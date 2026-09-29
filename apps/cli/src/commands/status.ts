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
import { isCospecType, listChanges, resolveChange, type Change } from '../core/change.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { passthroughOpenspec, wrappedCallLabel } from '../core/openspec.ts'
import { respellRemedies, respellWholeRemedy } from '../core/remedies.ts'
import { resolveRoot, type ResolvedRoot } from '../core/root.ts'
import {
  artifactRequires,
  enforcedApplyRequires,
  TYPE_ARTIFACTS,
  type CospecType,
} from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
import { mergeUpstream, rootOutput, type Identities } from '../core/upstream-keys.ts'
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

/**
 * Full status for a cospec-typed change with at least one artifact. Assumes the
 * caller has excluded the empty-change and legacy cases.
 */
export function computeStatus(base: string, change: Change): ChangeStatus {
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
        archiveMap(base),
        new Set(listChanges(base).map((c) => c.id)),
      )
    : ({ state: 'clear', hard: [], soft: [] } satisfies Gate)

  const tasksPath = join(change.dir, 'tasks.md')
  const parsedTasks = existsSync(tasksPath)
    ? parseTasks(readFileSync(tasksPath, 'utf8'))
    : { items: [], malformed: [], groups: [] }
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

/** The empty-change entry shape (`.openspec.yaml` present, no artifacts yet). */
function emptyChangeEntry(change: Change) {
  return {
    change: change.id,
    type: change.schema,
    state: 'in-progress' as const,
    artifacts: [] as ArtifactStatus[],
    gate: 'clear',
    archiveReady: false,
    next: `cospec instructions proposal --change ${change.id}`,
  }
}

/** The legacy/unknown-schema entry shape. */
function legacyChangeEntry(change: Change) {
  return { change: change.id, type: change.schema, legacy: true as const }
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
 * One change's status entry — empty, legacy, or full — for a single change.
 * Never throws itself; a caller sweeping every change (`--all`) wraps this in
 * a try/catch per change so one bad change cannot abort the sweep.
 */
export function buildChangeEntry(base: string, change: Change): ChangeEntry {
  if (!hasAnyArtifact(change.dir)) return emptyChangeEntry(change)
  if (!isCospecType(change.schema)) return legacyChangeEntry(change)
  return computeStatus(base, change)
}

function isFailure(entry: ChangeEntry | ChangeEntryFailure): entry is ChangeEntryFailure {
  return 'error' in entry
}

function renderEntryHuman(entry: ChangeEntry | ChangeEntryFailure): string {
  if (isFailure(entry)) return `${entry.change}: ERROR — ${entry.error}\n`
  if ('legacy' in entry) {
    return `${entry.change} (${entry.type}): legacy schema — use \`cospec status --change ${entry.change}\` for details\n`
  }
  if (entry.state === 'in-progress') {
    return `${entry.change} (${entry.type}): in progress — no artifacts yet; next: ${entry.next}\n`
  }
  return renderHuman(entry)
}

/**
 * `cospec status --all` (OpenSpec 1.11 parity): a cospec-native sweep over
 * every active change, sorted by id. Unlike a single change lookup, one bad
 * change never aborts the sweep — it becomes a per-change failure entry and
 * the whole run still exits nonzero.
 */
async function runAll(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const root = await resolveRoot(ctx)
  const base = root.base
  const changes = listChanges(base).toSorted((a, b) => a.id.localeCompare(b.id))

  const entries: (ChangeEntry | ChangeEntryFailure)[] = changes.map((change) => {
    try {
      return buildChangeEntry(base, change)
    } catch (err) {
      return { change: change.id, error: (err as Error).message }
    }
  })

  if (flags.json) {
    const upstream = await delegatedStatus(root, ['--all'])
    const doc = mergeUpstream(
      { changes: entries, root: rootOutput(root) },
      withRespelledNextSteps(upstream),
      SWEEP_IDENTITIES,
    ).value
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  } else if (entries.length === 0) {
    process.stdout.write('cospec status: no active changes\n')
  } else {
    process.stdout.write(entries.map(renderEntryHuman).join('\n'))
  }

  return entries.some(isFailure) ? EXIT.failure : EXIT.success
}

const MUTEX_MESSAGE = 'The --all and --change options are mutually exclusive.'

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

/** A binary status entry with each `nextSteps` sentence spelled through cospec. */
function respellEntry(entry: unknown): unknown {
  if (!isRecord(entry) || !Array.isArray(entry.nextSteps)) return entry
  return {
    ...entry,
    nextSteps: entry.nextSteps.map((step: unknown) =>
      typeof step === 'string' ? respellWholeRemedy(step) : step,
    ),
  }
}

/** The binary's document, single or sweep, its remedies spelled through cospec. */
function withRespelledNextSteps(doc: Record<string, unknown>): Record<string, unknown> {
  const single = respellEntry(doc) as Record<string, unknown>
  return Array.isArray(single.changes)
    ? { ...single, changes: single.changes.map(respellEntry) }
    : single
}

/** cospec's entry for one change, the binary's document for it merged in, and `root`. */
async function mergedEntry(
  root: ResolvedRoot,
  entry: Record<string, unknown>,
  id: string,
): Promise<Record<string, unknown>> {
  const upstream = await delegatedStatus(root, ['--change', id])
  return mergeUpstream(
    { ...entry, root: rootOutput(root) },
    withRespelledNextSteps(upstream),
    ENTRY_IDENTITIES,
  ).value
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!

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
    return runAll(ctx)
  }

  const root = await resolveRoot(ctx)
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

  const change = resolveChange(base, id)
  if (change === undefined) {
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

  // Empty change: has .openspec.yaml but no artifacts yet (never "Unknown item").
  if (!hasAnyArtifact(change.dir)) {
    if (flags.json) {
      const doc = await mergedEntry(root, emptyChangeEntry(change), change.id)
      process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
    } else {
      process.stdout.write(
        `${change.id} (${change.schema}): in progress — no artifacts yet; next: cospec instructions proposal --change ${change.id}\n`,
      )
    }
    return EXIT.success
  }

  // Legacy / unknown schema: no cospec artifact matrix. `--json` reports it
  // minimally; text relays the binary's own status for the change, its
  // `Next:` remedy spelled through cospec.
  if (!isCospecType(change.schema)) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify({ change: change.id, type: change.schema, legacy: true }, null, 2)}\n`,
      )
      return EXIT.success
    }
    const result = await passthroughOpenspec(
      {
        command: ['status'],
        threaded: [...(flags.noColor ? ['--no-color'] : []), ...root.storeArgs],
        args: ['--change', change.id],
      },
      { cwd: root.cwd },
    )
    if (result.stdout.length > 0) process.stdout.write(respellRemedies(result.stdout))
    if (result.stderr.length > 0) process.stderr.write(respellRemedies(result.stderr))
    return result.exitCode === 0 ? EXIT.success : EXIT.failure
  }

  const status = computeStatus(base, change)
  if (!flags.json) {
    process.stdout.write(renderHuman(status))
    return EXIT.success
  }
  const doc = await mergedEntry(root, { ...status }, change.id)
  process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
  return EXIT.success
}
