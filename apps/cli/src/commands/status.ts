// `cospec status --change <id>` (DESIGN §2.6). An augmented view over a change:
// per-artifact completion (done == file exists, mirroring openspec's
// detectCompleted), the deterministic blocker gate column, and archive-readiness.
// A change with a `.openspec.yaml` but no artifacts yet renders as "in progress"
// rather than openspec's bare "Unknown item" (PMF10 / product gap #3).

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers } from '../core/blockers.ts'
import { schemaDir } from '../core/change-metadata.ts'
import {
  archiveDir,
  changesDir,
  describeNestedChange,
  findNestedChangesIn,
  isCospecType,
  listChanges,
  projectConfigSchema,
  resolveChange,
  type Change,
} from '../core/change.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { answeringErrno } from '../core/errno.ts'
import { passthroughOpenspec, wrappedCallLabel } from '../core/openspec.ts'
import { respellRemedies, respellWholeRemedy } from '../core/remedies.ts'
import type { ResolvedRoot } from '../core/root.ts'
import {
  artifactRequires,
  enforcedApplyRequires,
  TYPE_ARTIFACTS,
  type CospecType,
} from '../core/rules/type-facts.ts'
import { parseTasks, type ParsedTasks } from '../core/tasks.ts'
import {
  mergeUpstream,
  resolveRootOrDocument,
  rootOutput,
  type Identities,
} from '../core/upstream-keys.ts'
import { computeVerificationVerdict, type VerificationVerdict } from '../core/verification.ts'
import { archiveMap, artifactDone, closest, computeGate, hasSpecFiles, type Gate } from './apply.ts'

/** The `clear | soft-blocked (n) | blocked (n hard)` gate column (DESIGN §2.6). */
export function gateLabel(gate: Gate): string {
  if (gate.state === 'blocked') return `blocked (${gate.hard.length} hard)`
  if (gate.state === 'soft-blocked') return `soft-blocked (${gate.soft.length})`
  return 'clear'
}

/** Does a change carry any artifact yet? */
export function hasAnyArtifact(changeDir: string): boolean {
  return (
    existsSync(join(changeDir, 'proposal.md')) ||
    existsSync(join(changeDir, 'blocking-changes.md')) ||
    existsSync(join(changeDir, 'tasks.md')) ||
    existsSync(join(changeDir, 'design.md')) ||
    existsSync(join(changeDir, 'verification.md')) ||
    hasSpecFiles(changeDir)
  )
}

export interface ArtifactStatus {
  id: string
  done: boolean
  required: boolean
  /**
   * True when every artifact this one `requires` is done — i.e. it can be
   * authored next (DESIGN §3.2 dependency graph). A done artifact stays `ready`
   * (its deps are, by construction, satisfied); the propose loop filters on
   * `ready && !done` to find what to write next.
   */
  ready: boolean
}

export interface ChangeStatus {
  change: string
  type: string
  state: 'in-progress' | 'building'
  artifacts: ArtifactStatus[]
  gate: string
  gateState: Gate['state']
  tasks: { total: number; complete: number }
  archiveReady: boolean
  /** read-only verification verdict (DESIGN §3.6) — never a gate; `cospec apply`
   * and `cospec archive` are the only commands that gate on verification. */
  verification: VerificationVerdict
  /** The next step (`resolveNext`), when there is one. */
  next?: string
}

/** An artifact's state in its schema's build order, as the binary's `artifacts[].status` names them. */
export type ArtifactState = 'done' | 'ready' | 'blocked' | 'skipped'

/**
 * The next step for a change (design D4), the one function the JSON `next`
 * and the human `Next:` line both print: the first ready artifact the change
 * requires to apply; else `cospec apply <id>` once every required artifact is
 * done (a `skip_specs`-skipped one counts as done); else the first ready
 * artifact of any kind; else nothing. Unlike the binary's `nextSteps`, an
 * optional artifact still unwritten never holds the change back from its gate.
 */
export function resolveNext(
  states: readonly { id: string; state: ArtifactState }[],
  required: ReadonlySet<string>,
  changeId: string,
): string | undefined {
  const instructions = (id: string): string => `cospec instructions ${id} --change ${changeId}`
  const readyRequired = states.find((a) => a.state === 'ready' && required.has(a.id))
  if (readyRequired !== undefined) return instructions(readyRequired.id)
  const settled = (id: string): boolean => {
    const state = states.find((a) => a.id === id)?.state
    return state === 'done' || state === 'skipped'
  }
  if ([...required].every(settled)) return `cospec apply ${changeId}`
  const ready = states.find((a) => a.state === 'ready')
  return ready === undefined ? undefined : instructions(ready.id)
}

/**
 * A cospec-typed change's artifact states from its own matrix: done is the
 * file present, skipped a `skip_specs` change's absent `specs`, ready every
 * artifact it requires done or skipped.
 */
function cospecStates(
  type: CospecType,
  done: ReadonlyMap<string, boolean>,
  skipSpecs: boolean,
): { id: string; state: ArtifactState }[] {
  const facts = TYPE_ARTIFACTS[type]
  const settled = (id: string): boolean => done.get(id) === true || (id === 'specs' && skipSpecs)
  return facts.declared.map((id) => {
    if (done.get(id) === true) return { id, state: 'done' }
    if (id === 'specs' && skipSpecs) return { id, state: 'skipped' }
    return { id, state: artifactRequires(type, id).every(settled) ? 'ready' : 'blocked' }
  })
}

/** A warning a status or list document carries (`--json`) or prints on stderr (text). */
export interface ArchiveWarning {
  code: 'archive_unreadable'
  message: string
}

/** The warning for a change whose `tasks.md` could not be read (`readChangeTasks`). */
export interface TasksWarning {
  code: 'tasks_unreadable'
  message: string
}

export type ReadWarning = ArchiveWarning | TasksWarning

const NO_TASKS: ParsedTasks = { items: [], malformed: [], groups: [] }

/**
 * A change's `tasks.md`, read as the binary's `countTaskFile` reads it: an
 * absent file is no tasks, and so is one any other errno refuses, with a
 * warning naming the file pushed onto `warnings`. A caller handed a warning
 * asks the binary whether the change can be reported at all: it refuses the
 * change where its runtime's `realpath` confinement check refuses the file
 * (Bun on macOS), and counts the file as no tasks elsewhere.
 */
export function readChangeTasks(changeDir: string, warnings: ReadWarning[]): ParsedTasks {
  const path = join(changeDir, 'tasks.md')
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (typeof code !== 'string') throw error
    if (code !== 'ENOENT')
      warnings.push({
        code: 'tasks_unreadable',
        message: `could not read ${path} (${code}); its tasks are counted as none`,
      })
    return NO_TASKS
  }
  return parseTasks(text)
}

/**
 * The archive index the gate column reads (design D4). The binary never reads
 * `openspec/changes/archive/` for `status` or `list`, so an unreadable one
 * must not fail them: the gate is computed from an empty index — which can
 * only err toward `blocked`, never a false `clear` — and the warning says
 * why. `validate` and `apply` read past it the same way
 * (`readValidateContext`); `archive` reads it through `archiveMap` and still
 * refuses.
 */
export function readArchive(base: string): {
  archived: Map<string, string>
  warning?: ArchiveWarning
} {
  try {
    return { archived: archiveMap(base) }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (typeof code !== 'string' || code === 'ENOENT') throw error
    return {
      archived: new Map(),
      warning: {
        code: 'archive_unreadable',
        message:
          `could not read ${archiveDir(base)} (${code}); blocker gates are computed as if no change ` +
          'were archived',
      },
    }
  }
}

/**
 * Full status for a cospec-typed change with at least one artifact. Assumes the
 * caller has excluded the empty-change and legacy cases. `archived` is the
 * archive index its gate reads (`readArchive`); read here when not given. An
 * unreadable `tasks.md` adds its warning to `warnings`.
 */
export function computeStatus(
  base: string,
  change: Change,
  archived?: Map<string, string>,
  warnings: ReadWarning[] = [],
): ChangeStatus {
  const type = change.schema as CospecType
  const facts = TYPE_ARTIFACTS[type]
  // Grandfathering: `required` mirrors the schemaVersion-filtered set the
  // apply/archive gates actually enforce (DESIGN §5), so a v1 change is not
  // reported archive-blocked on a v2-introduced artifact the gates skip.
  const applyRequires = new Set(enforcedApplyRequires(type, change.schemaVersion ?? 1))
  const done = new Map(facts.declared.map((id) => [id, artifactDone(change.dir, id)]))
  const artifacts: ArtifactStatus[] = facts.declared.map((id) => ({
    id,
    done: done.get(id)!,
    required: applyRequires.has(id),
    ready: artifactRequires(type, id).every((r) => done.get(r) === true),
  }))

  const blockersPath = join(change.dir, 'blocking-changes.md')
  const gate = existsSync(blockersPath)
    ? computeGate(
        parseBlockers(readFileSync(blockersPath, 'utf8')),
        archived ?? archiveMap(base),
        new Set(listChanges(base).map((c) => c.id)),
      )
    : ({ state: 'clear', hard: [], soft: [] } satisfies Gate)

  const parsedTasks = readChangeTasks(change.dir, warnings)
  const total = parsedTasks.items.length
  const complete = parsedTasks.items.filter((t) => t.checked).length

  const requiredDone = artifacts.filter((a) => a.required).every((a) => a.done)
  const tasksDone = total > 0 && complete === total
  const archiveReady = requiredDone && tasksDone && gate.state === 'clear'

  const verificationPath = join(change.dir, 'verification.md')
  const verificationText = existsSync(verificationPath)
    ? readFileSync(verificationPath, 'utf8')
    : undefined
  const verification = computeVerificationVerdict(
    applyRequires.has('verification'),
    verificationText,
  )

  const next = resolveNext(
    cospecStates(type, done, change.skipSpecs === true),
    applyRequires,
    change.id,
  )
  return {
    change: change.id,
    type: change.schema,
    state: 'building',
    artifacts,
    gate: gateLabel(gate),
    gateState: gate.state,
    tasks: { total, complete },
    archiveReady,
    verification,
    ...(next === undefined ? {} : { next }),
  }
}

function renderHuman(status: ChangeStatus): string {
  const lines = [`${status.change}  (${status.type})`]
  for (const a of status.artifacts) {
    const mark = a.done ? '✓' : ' '
    const tag = a.required ? 'required' : 'optional'
    // Surface authoring readiness for artifacts not yet written: `ready` means
    // its dependencies are satisfied, `waiting` means one is still missing.
    const readiness = a.done ? '' : a.ready ? '  ready' : '  waiting'
    lines.push(`  [${mark}] ${a.id.padEnd(16)} ${tag}${readiness}`)
  }
  lines.push(`  gate:          ${status.gate}`)
  lines.push(`  tasks:         ${status.tasks.complete}/${status.tasks.total}`)
  lines.push(`  archive-ready: ${status.archiveReady ? 'yes' : 'no'}`)
  if (status.verification.declared) {
    const v = status.verification
    lines.push(
      `  verification:  ${v.verified}/${v.total} verified, ${v.deferred} deferred, ${v.unresolved} unresolved`,
    )
  }
  if (status.next !== undefined) lines.push(`Next: ${status.next}`)
  return `${lines.join('\n')}\n`
}

/**
 * The empty-change entry shape: a cospec-typed change (`.openspec.yaml`
 * present) with no artifacts yet, its next step from its own matrix.
 */
function emptyChangeEntry(change: Change, type: CospecType) {
  const required = new Set(enforcedApplyRequires(type, change.schemaVersion ?? 1))
  const next = resolveNext(
    cospecStates(type, new Map(), change.skipSpecs === true),
    required,
    change.id,
  )
  return {
    change: change.id,
    type: change.schema,
    state: 'in-progress' as const,
    artifacts: [] as ArtifactStatus[],
    gate: 'clear',
    archiveReady: false,
    ...(next === undefined ? {} : { next }),
  }
}

/**
 * A change on a schema cospec doesn't type: its identity, and — from the
 * binary's own status for it — the next step (`resolveNext` over the
 * binary's `artifacts[].status` and `applyRequires`).
 */
function legacyChangeEntry(
  change: Change,
  upstream: Record<string, unknown> | undefined,
): { change: string; type: string; legacy: true; next?: string } {
  const entry = { change: change.id, type: change.schema, legacy: true as const }
  const next = upstream === undefined ? undefined : upstreamNext(upstream, change.id)
  return next === undefined ? entry : { ...entry, next }
}

function emptyHuman(entry: { change: string; type: string; next?: string }): string {
  const next = entry.next === undefined ? '' : `; next: ${entry.next}`
  return `${entry.change} (${entry.type}): in progress — no artifacts yet${next}\n`
}

export type ChangeEntry =
  | ReturnType<typeof emptyChangeEntry>
  | ReturnType<typeof legacyChangeEntry>
  | ChangeStatus

export interface ChangeEntryFailure {
  change: string
  error: string
}

/**
 * The change as status grades it (design D4): `--schema` overrides its schema,
 * as the binary's does; a directory with no `.openspec.yaml` takes its schema
 * as the binary does — the root's `config.yaml` `schema:`, else
 * `spec-driven` — at `schemaVersion` 1.
 */
function gradedChange(base: string, change: Change, override: string | undefined): Change {
  const bare = !existsSync(join(change.dir, '.openspec.yaml'))
  const schema = override ?? (bare ? (projectConfigSchema(base) ?? 'spec-driven') : change.schema)
  return bare ? { ...change, schema, schemaVersion: 1 } : { ...change, schema }
}

/** `--schema <name>` as the binary forwards it, or nothing. */
function schemaArgs(override: string | undefined): string[] {
  return override === undefined ? [] : ['--schema', override]
}

/**
 * The binary's refusal of an unknown `--schema` (its `validateSchemaExists`,
 * project, user and package tiers), from a delegated `--json` call so the
 * list of available schemas is the binary's: its document under `--json`,
 * its message on stderr otherwise, exit 1.
 */
async function refuseUnknownSchema(
  root: ResolvedRoot,
  args: string[],
  json: boolean,
): Promise<number> {
  const doc = await delegatedStatus(root, args)
  if (json) process.stdout.write(`${JSON.stringify(respelledUpstream(doc), null, 2)}\n`)
  else
    for (const s of upstreamFailure(doc) ?? [])
      process.stderr.write(`cospec status: ${s.message}\n`)
  return EXIT.failure
}

/**
 * Whether the binary's status for this change must answer it: a schema cospec
 * doesn't type, whose artifacts only its own schema names, written or not.
 */
function answeredUpstream(change: Change): boolean {
  return !isCospecType(change.schema)
}

/**
 * One change's status entry — legacy, empty, or full. A legacy entry (any
 * schema cospec doesn't type, with or without artifacts) takes its next step
 * from `upstream`, the binary's status for the change; only a cospec-typed
 * change is empty. Never throws itself; a caller sweeping every change
 * (`--all`) wraps this in a try/catch per change so one bad change cannot
 * abort the sweep.
 */
export function buildChangeEntry(
  base: string,
  change: Change,
  upstream?: Record<string, unknown>,
  archived?: Map<string, string>,
  warnings: ReadWarning[] = [],
): ChangeEntry {
  if (!isCospecType(change.schema)) return legacyChangeEntry(change, upstream)
  if (!hasAnyArtifact(change.dir)) return emptyChangeEntry(change, change.schema)
  return computeStatus(base, change, archived, warnings)
}

/** An errno failure reading a change's files: its message, as the binary reports it. */
function readFailure(error: unknown): string | undefined {
  const code = (error as NodeJS.ErrnoException | undefined)?.code
  return error instanceof Error && typeof code === 'string' ? error.message : undefined
}

/** A namespace folder's explanation (design D2), when `id` names one. */
function namespaceExplanation(base: string, id: string): string | undefined {
  const finding = findNestedChangesIn(changesDir(base), id)
  return finding === undefined ? undefined : describeNestedChange(finding)
}

function printWarnings(warnings: readonly ReadWarning[]): void {
  for (const warning of warnings) process.stderr.write(`Warning: ${warning.message}\n`)
}

/** The document's `warnings`, when there are any to carry. */
function warningsKey(warnings: readonly ReadWarning[]): { warnings?: ReadWarning[] } {
  return warnings.length === 0 ? {} : { warnings: [...warnings] }
}

/** The archive's warning, if any, then the tasks warnings in change order. */
function readWarnings(
  archive: ArchiveWarning | undefined,
  tasks: readonly ReadWarning[],
): ReadWarning[] {
  return [...(archive === undefined ? [] : [archive]), ...tasks]
}

function isFailure(entry: ChangeEntry | ChangeEntryFailure): entry is ChangeEntryFailure {
  return 'error' in entry
}

// --- the binary's status, for a schema cospec doesn't type ----------------------

interface UpstreamArtifact {
  id: string
  status: ArtifactState
  missingDeps?: string[]
}

function upstreamArtifacts(doc: Record<string, unknown>): UpstreamArtifact[] | undefined {
  return Array.isArray(doc.artifacts) ? (doc.artifacts as UpstreamArtifact[]) : undefined
}

/** `resolveNext` over the binary's own artifact states and `applyRequires`. */
function upstreamNext(doc: Record<string, unknown>, id: string): string | undefined {
  const artifacts = upstreamArtifacts(doc)
  if (artifacts === undefined) return undefined
  const required = new Set(Array.isArray(doc.applyRequires) ? (doc.applyRequires as string[]) : [])
  return resolveNext(
    artifacts.map((a) => ({ id: a.id, state: a.status })),
    required,
    id,
  )
}

/**
 * The binary's diagnostics for a change it could not report, if it could not,
 * each spelled through the remedy allowlist as every relay of them is.
 */
export function upstreamFailure(doc: Record<string, unknown>): { message: string }[] | undefined {
  if (upstreamArtifacts(doc) !== undefined) return undefined
  return Array.isArray(doc.status) ? respellDiagnostics(doc.status) : undefined
}

const INDICATOR: Record<ArtifactState, string> = {
  done: '[x]',
  skipped: '[~]',
  ready: '[ ]',
  blocked: '[-]',
}

/**
 * A port of the binary's `printStatusText` (`commands/workflow/status.js`)
 * over its `status --json` document, uncoloured, with the `Next:` line from
 * `resolveNext` — so nothing the binary wrote as prose is relayed or
 * respelled.
 */
export function renderUpstreamHuman(
  doc: Record<string, unknown>,
  next: string | undefined,
): string {
  const artifacts = upstreamArtifacts(doc) ?? []
  const done = artifacts.filter((a) => a.status === 'done').length
  const skipped = artifacts.filter((a) => a.status === 'skipped').length
  const lines = [`Change: ${String(doc.changeName)}`, `Schema: ${String(doc.schemaName)}`]
  if (typeof doc.changeRoot === 'string' && doc.changeRoot.length > 0)
    lines.push(`Change root: ${doc.changeRoot}`)
  lines.push(
    `Progress: ${done}/${artifacts.length - skipped} artifacts complete${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
  )
  lines.push('')
  for (const a of artifacts) {
    let line = `${INDICATOR[a.status]} ${a.id}`
    if (a.status === 'skipped') line += ' (skipped: change declares skip_specs)'
    if (a.status === 'blocked' && a.missingDeps !== undefined && a.missingDeps.length > 0)
      line += ` (blocked by: ${a.missingDeps.join(', ')})`
    lines.push(line)
  }
  const complete = doc.isPlanningComplete === true
  if (complete || next !== undefined) lines.push('')
  if (complete) lines.push('All planning artifacts complete!')
  if (next !== undefined) lines.push(`Next: ${next}`)
  return `${lines.join('\n')}\n`
}

function renderEntryHuman(
  entry: ChangeEntry | ChangeEntryFailure,
  upstream: Record<string, unknown> | undefined,
): string {
  if (isFailure(entry)) return `${entry.change}: ERROR — ${entry.error}\n`
  if ('legacy' in entry) {
    const failure = upstream === undefined ? undefined : upstreamFailure(upstream)
    if (upstream === undefined || failure !== undefined)
      return `${entry.change}: ERROR — ${(failure ?? []).map((s) => s.message).join('\n')}\n`
    return renderUpstreamHuman(upstream, entry.next)
  }
  if (entry.state === 'in-progress') {
    return emptyHuman(entry)
  }
  return renderHuman(entry)
}

/** The binary's sweep entries by change name. */
function sweepEntries(doc: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const changes = Array.isArray(doc.changes) ? (doc.changes as Record<string, unknown>[]) : []
  return new Map(changes.map((c) => [String(c.changeName), c]))
}

/**
 * `cospec status --all` (OpenSpec 1.11 parity): a cospec-native sweep over
 * every active change, sorted by id. Unlike a single change lookup, one bad
 * change never aborts the sweep — it becomes a per-change failure entry and
 * the whole run still exits nonzero. The binary's sweep is fetched once, and
 * only when an entry needs it: under `--json`, for a change on a schema
 * cospec doesn't type, or for a change whose `tasks.md` cospec could not read
 * — the binary decides whether that change can be reported at all.
 */
async function runAll(ctx: CommandContext, override: string | undefined): Promise<number> {
  const { flags } = ctx
  const root = await resolveRootOrDocument(ctx, 'change_error', BATCH_FAILURE_PAYLOAD)
  if (root === undefined) return EXIT.failure
  const base = root.base
  // Checked before any change is enumerated, as the binary checks it.
  if (override !== undefined && schemaDir(override, base) === undefined)
    return refuseUnknownSchema(root, ['--all', ...schemaArgs(override)], flags.json)
  const changes = listChanges(base)
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((change) => gradedChange(base, change, override))

  const sweepArgs = ['--all', ...schemaArgs(override)]
  let upstream =
    flags.json || changes.some(answeredUpstream)
      ? await delegatedStatus(root, sweepArgs)
      : undefined
  let byName = upstream === undefined ? new Map() : sweepEntries(upstream)

  const { archived, warning } = readArchive(base)
  const tasksWarnings = new Map<string, ReadWarning[]>()
  let entries: (ChangeEntry | ChangeEntryFailure)[] = changes.map((change) => {
    // A namespace folder is a failure entry carrying its explanation, as the
    // binary's sweep carries it.
    const nested = namespaceExplanation(base, change.id)
    if (nested !== undefined) return { change: change.id, error: nested }
    const own: ReadWarning[] = []
    try {
      return buildChangeEntry(base, change, byName.get(change.id), archived, own)
    } catch (err) {
      return { change: change.id, error: (err as Error).message }
    } finally {
      if (own.length > 0) tasksWarnings.set(change.id, own)
    }
  })
  // A change whose tasks.md cospec could not read is reported only when the
  // binary reports it; where the binary refuses it (its runtime's `realpath`
  // refuses the file), the binary's message is the change's entry.
  if (tasksWarnings.size > 0) {
    upstream ??= await delegatedStatus(root, sweepArgs)
    byName = sweepEntries(upstream)
    entries = entries.map((entry) => {
      if (isFailure(entry) || !tasksWarnings.has(entry.change)) return entry
      const refused = upstreamFailure(byName.get(entry.change) ?? {})
      if (refused === undefined) return entry
      tasksWarnings.delete(entry.change)
      return { change: entry.change, error: refused.map((s) => s.message).join('\n') }
    })
  }
  const warnings = readWarnings(warning, [...tasksWarnings.values()].flat())
  // A change the binary could not report fails the sweep when the binary's
  // answer is the one it gets.
  const upstreamFailed = entries.some((entry) => {
    if (isFailure(entry) || !('legacy' in entry)) return false
    const up = byName.get(entry.change)
    return up === undefined || upstreamFailure(up) !== undefined
  })

  if (flags.json) {
    const doc = mergeUpstream(
      { changes: entries, root: rootOutput(root), ...warningsKey(warnings) },
      respelledUpstream(upstream!),
      SWEEP_IDENTITIES,
    ).value
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  } else if (entries.length === 0) {
    process.stdout.write('cospec status: no active changes\n')
  } else {
    printWarnings(warnings)
    process.stdout.write(
      entries.map((entry) => renderEntryHuman(entry, byName.get(entry.change))).join('\n'),
    )
  }

  return entries.some(isFailure) || upstreamFailed ? EXIT.failure : EXIT.success
}

const MUTEX_MESSAGE = 'The --all and --change options are mutually exclusive.'

/** The binary's `--all --json` failure null-shape (`BATCH_STATUS_FAILURE_PAYLOAD`). */
const BATCH_FAILURE_PAYLOAD = { changes: [], root: null } as const

/**
 * A lookup refusal under `--json`: one document on stdout in upstream's
 * `failWithError` shape (`{status: [{severity, code, message}]}`, code
 * `change_error`), exit 1, so a `--json` caller always gets something to parse.
 */
function changeErrorDocument(message: string): number {
  const status = [{ severity: 'error', code: 'change_error', message }]
  process.stdout.write(`${JSON.stringify({ status }, null, 2)}\n`)
  return EXIT.failure
}

/** Array identities between cospec's status documents and the binary's. */
const ENTRY_IDENTITIES: Identities = { 'artifacts[]': { cospec: 'id', upstream: 'id' } }
const SWEEP_IDENTITIES: Identities = {
  'changes[]': { cospec: 'change', upstream: 'changeName' },
  'changes[].artifacts[]': { cospec: 'id', upstream: 'id' },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The one delegated `openspec status … --json` call an invocation makes
 * (design D4): the binary's own document for `args` (`--change <id>` or
 * `--all`), in the resolved root. Its failure document (`status`, exit 1)
 * is an answer, not a violation; anything but one document naming the change
 * (or the sweep) or carrying `status` is.
 */
async function delegatedStatus(
  root: ResolvedRoot,
  args: string[],
): Promise<Record<string, unknown>> {
  const change = args[0] === '--change' ? args[1] : undefined
  const label = wrappedCallLabel(['status', '--json', ...root.storeArgs, ...args])
  let doc: Record<string, unknown> | undefined
  await passthroughOpenspec(
    { command: ['status'], threaded: ['--json', ...root.storeArgs], args },
    {
      cwd: root.cwd,
      expect: {
        exitCodes: [0, 1],
        postCondition: (result) => {
          let parsed: unknown
          try {
            parsed = JSON.parse(result.stdout)
          } catch {
            return `${label} did not print one JSON document`
          }
          if (!isRecord(parsed)) return `${label} printed no JSON object`
          const named =
            change === undefined ? Array.isArray(parsed.changes) : parsed.changeName === change
          if (!named && !Array.isArray(parsed.status))
            return `${label} printed neither the change's status nor a diagnostic`
          doc = parsed
          return true
        },
      },
    },
  )
  return doc!
}

/** The binary's diagnostics, each `message` and `fix` spelled through the remedy allowlist. */
function respellDiagnostics(status: unknown[]): { message: string }[] {
  return status.map((d) => {
    if (!isRecord(d)) return d as { message: string }
    const fix = typeof d.fix === 'string' ? { fix: respellRemedies(d.fix) } : {}
    const message = typeof d.message === 'string' ? respellRemedies(d.message) : d.message
    return { ...d, message, ...fix } as { message: string }
  })
}

/**
 * A binary status entry with each `nextSteps` sentence spelled through
 * cospec, and each `status[]` diagnostic's message and fix.
 */
function respellEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry
  const steps = Array.isArray(entry.nextSteps)
    ? {
        nextSteps: entry.nextSteps.map((step: unknown) =>
          typeof step === 'string' ? respellWholeRemedy(step) : step,
        ),
      }
    : {}
  const status = Array.isArray(entry.status) ? { status: respellDiagnostics(entry.status) } : {}
  return { ...entry, ...steps, ...status }
}

/** The binary's document, single or sweep, its remedies spelled through cospec. */
export function respelledUpstream(doc: Record<string, unknown>): Record<string, unknown> {
  const single = respellEntry(doc) as Record<string, unknown>
  return Array.isArray(single.changes)
    ? { ...single, changes: single.changes.map(respellEntry) }
    : single
}

/** cospec's entry, the binary's document for the same change merged in, and `root`. */
function mergedEntry(
  root: ResolvedRoot,
  entry: Record<string, unknown>,
  upstream: Record<string, unknown>,
): Record<string, unknown> {
  return mergeUpstream(
    { ...entry, root: rootOutput(root) },
    respelledUpstream(upstream),
    ENTRY_IDENTITIES,
  ).value
}

/**
 * `cospec status`: an errno failure it lets escape (an unreadable
 * `openspec/changes/`) is the binary's one `change_error` document under
 * `--json`, carrying the sweep's null-shape for `--all`.
 */
export function run(ctx: CommandContext): Promise<number> {
  const payload = hasFlag(ctx.parsed!, '--all') ? BATCH_FAILURE_PAYLOAD : {}
  return answeringErrno(ctx.flags.json, { code: 'change_error', payload }, () => status(ctx))
}

async function status(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!
  // A schema override, as the binary's `--schema` is — never a filter.
  const override = flagValue(parsed, '--schema')

  // A positional beside `--change` or `--all` never gets here: the table
  // refuses it as an excess argument, as upstream (which has none) does.
  if (hasFlag(parsed, '--all')) {
    if (flagValue(parsed, '--change') !== undefined) {
      // Under --json the failure is a JSON envelope on stdout, never a bare
      // stderr line: a caller that asked for JSON must always get something
      // parseable, and openspec's own `--all`/`--change` mutex check is caught
      // by a handler that honours --json the same way.
      if (flags.json) {
        process.stdout.write(
          `${JSON.stringify({ changes: [], root: null, error: MUTEX_MESSAGE }, null, 2)}\n`,
        )
      } else {
        process.stderr.write(`cospec status: ${MUTEX_MESSAGE}\n`)
      }
      return EXIT.failure
    }
    return runAll(ctx, override)
  }

  const root = await resolveRootOrDocument(ctx, 'change_error')
  if (root === undefined) return EXIT.failure
  const base = root.base
  let id = flagValue(parsed, '--change') ?? parsed.positionals[0]

  const active = listChanges(base)
  if (id === undefined) {
    if (active.length === 1) {
      id = active[0]!.id
    } else if (active.length === 0) {
      process.stdout.write(
        flags.json
          ? `${JSON.stringify({ changes: [], message: 'No active changes.', root: rootOutput(root) }, null, 2)}\n`
          : 'cospec status: no active changes\n',
      )
      return EXIT.success
    } else {
      if (flags.json)
        return changeErrorDocument(
          `--change <id> is required. Active changes: ${active.map((c) => c.id).join(', ')}`,
        )
      process.stderr.write('cospec status: --change <id> is required\n')
      process.stderr.write(`active changes: ${active.map((c) => c.id).join(', ')}\n`)
      return EXIT.failure
    }
  }

  const found = resolveChange(base, id)
  if (found === undefined) {
    const suggestion = closest(
      id,
      active.map((c) => c.id),
    )
    if (flags.json)
      return changeErrorDocument(
        `unknown change '${id}'${suggestion !== undefined ? `. Did you mean '${suggestion}'?` : ''}`,
      )
    process.stderr.write(`cospec status: unknown change '${id}'\n`)
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }
  // A namespace folder is refused, as the binary refuses it.
  const nested = namespaceExplanation(base, found.id)
  if (nested !== undefined) {
    if (flags.json) return changeErrorDocument(nested)
    process.stderr.write(`cospec status: ${nested}\n`)
    return EXIT.failure
  }

  // Checked after the change resolves and before it is reported, as the
  // binary checks it; with neither `--change` nor `--all` it is not checked.
  if (
    override !== undefined &&
    flagValue(parsed, '--change') !== undefined &&
    schemaDir(override, base) === undefined
  )
    return refuseUnknownSchema(root, ['--change', found.id, ...schemaArgs(override)], flags.json)
  const change = gradedChange(base, found, override)

  // A schema cospec doesn't type: the binary's own status answers it, in
  // both modes, with the binary's outcome.
  if (answeredUpstream(change)) {
    const upstream = await delegatedStatus(root, ['--change', change.id, ...schemaArgs(override)])
    const failure = upstreamFailure(upstream)
    const entry = legacyChangeEntry(change, upstream)
    if (flags.json) {
      process.stdout.write(`${JSON.stringify(mergedEntry(root, entry, upstream), null, 2)}\n`)
    } else if (failure !== undefined) {
      for (const s of failure) process.stderr.write(`cospec status: ${s.message}\n`)
    } else {
      process.stdout.write(renderUpstreamHuman(upstream, entry.next))
    }
    return failure === undefined ? EXIT.success : EXIT.failure
  }

  // Empty change: has .openspec.yaml but no artifacts yet (never "Unknown item").
  const { archived, warning } = readArchive(base)
  const tasksWarnings: ReadWarning[] = []
  let entry: ChangeEntry
  try {
    entry = buildChangeEntry(base, change, undefined, archived, tasksWarnings)
  } catch (error) {
    // A change file that cannot be read fails the lookup, as the binary's does.
    const message = readFailure(error)
    if (message === undefined) throw error
    if (flags.json) return changeErrorDocument(message)
    process.stderr.write(`cospec status: ${message}\n`)
    return EXIT.failure
  }
  // A tasks.md cospec could not read: whether the change can be reported at
  // all is the binary's answer. It refuses the change where its runtime's
  // `realpath` refuses the file, and counts the file as no tasks elsewhere.
  const upstream =
    flags.json || tasksWarnings.length > 0
      ? await delegatedStatus(root, ['--change', change.id, ...schemaArgs(override)])
      : undefined
  const refused =
    upstream === undefined || tasksWarnings.length === 0 ? undefined : upstreamFailure(upstream)
  if (refused !== undefined) {
    if (flags.json)
      process.stdout.write(`${JSON.stringify(respelledUpstream(upstream!), null, 2)}\n`)
    else for (const s of refused) process.stderr.write(`cospec status: ${s.message}\n`)
    return EXIT.failure
  }
  const warnings = readWarnings(warning, tasksWarnings)
  if (!flags.json) {
    printWarnings(warnings)
    process.stdout.write(
      'state' in entry && entry.state === 'in-progress'
        ? emptyHuman(entry)
        : renderHuman(entry as ChangeStatus),
    )
    return EXIT.success
  }
  const doc = mergedEntry(root, { ...entry, ...warningsKey(warnings) }, upstream!)
  process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  return EXIT.success
}
