// `cospec view` — cospec's own dashboard (design decision 3), no longer a relay
// of `openspec view`: post-processing upstream's text would mean respelling free
// text, which `core/remedies.ts` forbids, and could not add cospec's columns.
//
// The active section lists only active changes (never archived ones, which get
// their own short section), each with its schema and every artifact's state
// (done / ready / blocked / skipped), then what only cospec knows: the blocker
// gate, verification-ledger progress and archive readiness. Those come from
// the computation `cospec status` reports (`buildChangeEntry`), so the
// dashboard can never disagree with `status`, `apply` or `archive`. A change on
// a schema cospec does not type takes its artifact states from one delegated
// `status --all --json` sweep, made only when such a change exists; when the
// binary cannot load that change's workflow, the row still shows its task
// progress and names the failure. Specs come from one delegated
// `list --specs --json` call, as `cospec list --specs` reads them.
//
// Every progress bar starts in the same column: the name field is a fixed 48
// columns. Output is written once, top to bottom — no spinner, no redraw —
// and colour is off under `--no-color`, `NO_COLOR` or a stdout that is not a
// terminal. `--json` is refused by the table (use `cospec status --all --json`).

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers } from '../core/blockers.ts'
import {
  archiveDir,
  changesDir,
  defaultProjectSchema,
  describeNestedChange,
  findNestedChangesIn,
  isCospecType,
  listChanges,
  openspecDir,
  projectVerificationLayers,
  readOpenspecYaml,
  type Change,
} from '../core/change.ts'
import { passthroughOpenspec, wrappedCallLabel, type Root } from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { resolveRoot } from '../core/root.ts'
import { artifactRequires, TYPE_ARTIFACTS, type CospecType } from '../core/rules/type-facts.ts'
import { artifactDone, computeGate, type Gate } from './apply.ts'
import {
  type ArtifactState,
  buildChangeEntry,
  type ChangeStatus,
  gateLabel,
  readArchive,
  readChangeTasks,
  type ReadWarning,
} from './status.ts'

/** The name field every row pads to, so bars align for names up to this long. */
export const NAME_WIDTH = 48
const BAR_WIDTH = 20
const RULE = 60
/** Archived changes listed by name before the section folds the rest into a count. */
const ARCHIVED_SHOWN = 10

// --- the model -------------------------------------------------------------------

export interface ArtifactCell {
  id: string
  state: ArtifactState
}

export interface ActiveRow {
  name: string
  schema: string
  /** Absent when the change's workflow could not be loaded (`loadFailure` says why). */
  artifacts?: ArtifactCell[]
  loadFailure?: string
  /** `not a change`: a namespace folder holding changes (design D2 of nested detection). */
  notAChange?: string
  tasks: { total: number; complete: number }
  gate: Gate['state']
  gateLabel: string
  /** `verified/total` of the verification ledger, when the type declares one. */
  ledger?: { verified: number; total: number; deferred: number; unresolved: number }
  /** Only a cospec-typed change has an archive-readiness verdict. */
  archiveReady?: boolean
}

export interface ArchivedEntry {
  name: string
  type: string
  archivedOn: string | null
}

export interface SpecEntry {
  id: string
  requirementCount: number
}

export interface Dashboard {
  active: ActiveRow[]
  archived: ArchivedEntry[]
  /** Undefined when the delegated spec listing failed (`specsError` says why). */
  specs?: SpecEntry[]
  specsError?: string
  warnings: string[]
}

/**
 * A cospec-typed change's artifact states, as `status` grades them: done is the
 * file present, skipped a `skip_specs` change's absent `specs`, ready every
 * artifact it requires done or skipped, blocked otherwise.
 */
export function cospecArtifactStates(
  type: CospecType,
  done: (id: string) => boolean,
  skipSpecs: boolean,
): ArtifactCell[] {
  const settled = (id: string): boolean => done(id) || (id === 'specs' && skipSpecs)
  return TYPE_ARTIFACTS[type].declared.map((id) => {
    if (done(id)) return { id, state: 'done' }
    if (id === 'specs' && skipSpecs) return { id, state: 'skipped' }
    return { id, state: artifactRequires(type, id).every(settled) ? 'ready' : 'blocked' }
  })
}

function gateOf(dir: string, archived: Map<string, string>, active: Set<string>) {
  const path = join(dir, 'blocking-changes.md')
  return existsSync(path)
    ? computeGate(parseBlockers(readFileSync(path, 'utf8')), archived, active)
    : ({ state: 'clear', hard: [], soft: [] } satisfies Gate)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** One delegated `<command> --json` call whose answer is one JSON object, failure documents included. */
async function delegatedJson(
  root: Root,
  command: string,
  args: string[],
): Promise<Record<string, unknown>> {
  const label = wrappedCallLabel([command, '--json', ...root.storeArgs, ...args])
  let doc: Record<string, unknown> | undefined
  await passthroughOpenspec(
    { command: [command], threaded: ['--json', ...root.storeArgs], args },
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
          doc = parsed
          return true
        },
      },
    },
  )
  return doc!
}

/** The binary's diagnostics in a document, spelled through cospec. */
function diagnostics(doc: Record<string, unknown>): string | undefined {
  if (!Array.isArray(doc.status)) return undefined
  const messages = doc.status
    .filter((s): s is Record<string, unknown> => isRecord(s) && typeof s.message === 'string')
    .map((s) => respellRemedies(String(s.message)))
  return messages.length > 0 ? messages.join('; ') : undefined
}

/** A legacy change's artifact states from the binary's sweep entry, or why there are none. */
function upstreamCells(
  entry: Record<string, unknown> | undefined,
): { artifacts: ArtifactCell[] } | { loadFailure: string } {
  if (entry === undefined) return { loadFailure: 'the wrapped status sweep did not report it' }
  if (Array.isArray(entry.artifacts))
    return {
      artifacts: entry.artifacts.filter(isRecord).map((a) => ({
        id: String(a.id),
        state: a.status as ArtifactState,
      })),
    }
  return { loadFailure: diagnostics(entry) ?? 'its workflow could not be loaded' }
}

function activeRow(
  base: string,
  change: Change,
  archived: Map<string, string>,
  active: Set<string>,
  layers: ReturnType<typeof projectVerificationLayers>,
  sweep: Map<string, Record<string, unknown>>,
  warnings: ReadWarning[],
): ActiveRow {
  const tasks = readChangeTasks(change.dir, warnings)
  const progress = {
    total: tasks.items.length,
    complete: tasks.items.filter((t) => t.checked).length,
  }
  const nested = findNestedChangesIn(changesDir(base), change.id)
  if (nested !== undefined) {
    return {
      name: change.id,
      schema: '(none)',
      notAChange: describeNestedChange(nested),
      tasks: progress,
      gate: 'clear',
      gateLabel: 'clear',
    }
  }
  const bare = !existsSync(join(change.dir, '.openspec.yaml'))
  const schema = bare ? defaultProjectSchema(base) : change.schema
  const graded: Change = bare ? { ...change, schema, schemaVersion: 1 } : change

  if (!isCospecType(schema)) {
    const gate = gateOf(change.dir, archived, active)
    return {
      name: change.id,
      schema: schema || '(none)',
      ...upstreamCells(sweep.get(change.id)),
      tasks: progress,
      gate: gate.state,
      gateLabel: gateLabel(gate),
    }
  }

  const artifacts = cospecArtifactStates(
    schema,
    (id) => artifactDone(change.dir, id),
    change.skipSpecs === true,
  )
  const entry = buildChangeEntry(base, graded, undefined, archived, [], layers)
  if (!('gateState' in entry)) {
    // No artifact yet: nothing gated, nothing to verify, never archive-ready.
    return {
      name: change.id,
      schema,
      artifacts,
      tasks: progress,
      gate: 'clear',
      gateLabel: 'clear',
      archiveReady: false,
    }
  }
  const status = entry as ChangeStatus
  const v = status.verification
  return {
    name: change.id,
    schema,
    artifacts,
    tasks: status.tasks,
    gate: status.gateState,
    gateLabel: status.gate,
    ...(v.declared
      ? {
          ledger: {
            verified: v.verified,
            total: v.total,
            deferred: v.deferred,
            unresolved: v.unresolved,
          },
        }
      : {}),
    archiveReady: status.archiveReady,
  }
}

/** Every archived change folder, newest first, with its type and date. */
function archivedEntries(base: string): ArchivedEntry[] {
  const dir = archiveDir(base)
  if (!existsSync(dir)) return []
  const entries: ArchivedEntry[] = []
  for (const name of listDirNames(dir)) {
    const match = /^(\d{4}-\d{2}-\d{2})-/.exec(name)
    entries.push({
      name,
      type: readOpenspecYaml(join(dir, name))?.schema ?? '(none)',
      archivedOn: match?.[1] ?? null,
    })
  }
  return entries.toSorted(
    (a, b) =>
      (b.archivedOn ?? '').localeCompare(a.archivedOn ?? '') || a.name.localeCompare(b.name),
  )
}

function listDirNames(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
}

/** Build the dashboard model for `root` (one status pass, at most two delegated calls). */
export async function buildDashboard(root: Root): Promise<Dashboard> {
  const base = root.base
  const changes = listChanges(base).toSorted((a, b) => a.id.localeCompare(b.id))
  const { archived, warning } = readArchive(base)
  const activeIds = new Set(changes.map((c) => c.id))
  const layers = projectVerificationLayers(base)
  const readWarnings: ReadWarning[] = warning === undefined ? [] : [warning]

  const needsSweep = changes.some((c) => {
    const bare = !existsSync(join(c.dir, '.openspec.yaml'))
    return !isCospecType(bare ? defaultProjectSchema(base) : c.schema)
  })
  const sweep = new Map<string, Record<string, unknown>>()
  if (needsSweep) {
    const doc = await delegatedJson(root, 'status', ['--all'])
    for (const entry of Array.isArray(doc.changes) ? doc.changes : [])
      if (isRecord(entry)) sweep.set(String(entry.changeName), entry)
  }

  const active = changes.map((change) => {
    try {
      return activeRow(base, change, archived, activeIds, layers, sweep, readWarnings)
    } catch (error) {
      // A change file that cannot be read fails its own row, as `status --all` does.
      const code = (error as NodeJS.ErrnoException | undefined)?.code
      if (!(error instanceof Error) || typeof code !== 'string') throw error
      return {
        name: change.id,
        schema: change.schema || '(none)',
        loadFailure: error.message,
        tasks: { total: 0, complete: 0 },
        gate: 'clear' as const,
        gateLabel: 'clear',
      }
    }
  })

  const specsDoc = await delegatedJson(root, 'list', ['--specs'])
  const specsError = Array.isArray(specsDoc.specs) ? undefined : diagnostics(specsDoc)
  const specs = Array.isArray(specsDoc.specs)
    ? specsDoc.specs.filter(isRecord).map((s) => ({
        id: String(s.id),
        requirementCount: Number(s.requirementCount),
      }))
    : undefined

  return {
    active,
    archived: archivedEntries(base),
    ...(specs === undefined ? { specsError: specsError ?? 'the spec listing failed' } : { specs }),
    warnings: readWarnings.map((w) => w.message),
  }
}

// --- rendering --------------------------------------------------------------------

const SGR = {
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
} as const

type Paint = (code: keyof typeof SGR, text: string) => string

/** Whether to colour: never under `--no-color`, `NO_COLOR`, or a stdout that is no terminal. */
export function colorEnabled(
  noColor: boolean,
  env: NodeJS.ProcessEnv = process.env,
  isTTY: boolean = process.stdout.isTTY === true,
): boolean {
  if (noColor) return false
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  return isTTY
}

/** `[████░░░░]`, or a dim rule for a change with no tasks. */
export function progressBar(complete: number, total: number, paint: Paint): string {
  if (total === 0) return paint('dim', `[${'─'.repeat(BAR_WIDTH)}]`)
  const filled = Math.round((complete / total) * BAR_WIDTH)
  return `[${paint('green', '█'.repeat(filled))}${paint('dim', '░'.repeat(BAR_WIDTH - filled))}]`
}

/** Terminal controls in user-written names, masked before any colour of ours is added. */
function sanitize(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    out += code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? '?' : ch
  }
  return out
}

const MARK: Record<ArtifactState, string> = {
  done: '[x]',
  ready: '[ ]',
  blocked: '[-]',
  skipped: '[~]',
}

function artifactLine(cells: readonly ArtifactCell[], paint: Paint): string {
  return cells
    .map((cell) => {
      const text = `${MARK[cell.state]} ${sanitize(cell.id)}`
      if (cell.state === 'done') return paint('green', text)
      if (cell.state === 'ready') return paint('cyan', text)
      return paint('dim', text)
    })
    .join('  ')
}

function gateText(row: ActiveRow, paint: Paint): string {
  if (row.gate === 'blocked') return paint('red', row.gateLabel)
  if (row.gate === 'soft-blocked') return paint('yellow', row.gateLabel)
  return paint('green', row.gateLabel)
}

function percent(complete: number, total: number): number {
  return total === 0 ? 0 : Math.round((complete / total) * 100)
}

export function renderDashboard(dash: Dashboard, color: boolean): string {
  const paint: Paint = (code, text) => (color ? `${SGR[code]}${text}${SGR.reset}` : text)
  const out: string[] = ['', paint('bold', 'cospec Dashboard'), '', '═'.repeat(RULE)]

  const tasks = dash.active.reduce(
    (sum, row) => ({
      total: sum.total + row.tasks.total,
      complete: sum.complete + row.tasks.complete,
    }),
    { total: 0, complete: 0 },
  )
  const blocked = dash.active.filter((r) => r.gate === 'blocked').length
  const soft = dash.active.filter((r) => r.gate === 'soft-blocked').length
  const ready = dash.active.filter((r) => r.archiveReady === true).length
  out.push(paint('bold', 'Summary:'))
  if (dash.specs !== undefined) {
    const reqs = dash.specs.reduce((sum, s) => sum + s.requirementCount, 0)
    out.push(
      `  ${paint('cyan', '●')} Specifications: ${dash.specs.length} specs, ${reqs} requirements`,
    )
  }
  out.push(
    `  ${paint('yellow', '●')} Active Changes: ${dash.active.length} (${blocked} blocked, ${soft} soft-blocked, ${ready} archive-ready)`,
  )
  out.push(`  ${paint('green', '●')} Archived Changes: ${dash.archived.length}`)
  if (tasks.total > 0)
    out.push(
      `  ${paint('magenta', '●')} Task Progress: ${tasks.complete}/${tasks.total} (${percent(tasks.complete, tasks.total)}% complete)`,
    )

  if (dash.active.length > 0) {
    out.push('', paint('cyan', 'Active Changes'), '─'.repeat(RULE))
    for (const row of dash.active) {
      const name = sanitize(row.name).padEnd(NAME_WIDTH)
      const bar = progressBar(row.tasks.complete, row.tasks.total, paint)
      const pct = paint('dim', `${percent(row.tasks.complete, row.tasks.total)}%`)
      out.push(
        `  ${paint('yellow', '◉')} ${paint('bold', name)} ${bar} ${pct}  ${row.tasks.complete}/${row.tasks.total} tasks`,
      )
      const schema = paint('dim', `[${sanitize(row.schema)}]`)
      if (row.notAChange !== undefined) {
        out.push(`    └─ ${paint('dim', `not a change: ${sanitize(row.notAChange)}`)}`)
        continue
      }
      if (row.artifacts !== undefined)
        out.push(`    └─ ${schema} ${artifactLine(row.artifacts, paint)}`)
      else
        out.push(
          `    └─ ${schema} ${paint('yellow', `workflow status unavailable: ${sanitize(row.loadFailure ?? 'unknown')}`)}`,
        )
      const facts = [`gate: ${gateText(row, paint)}`]
      if (row.ledger !== undefined) {
        const l = row.ledger
        const extra = [
          ...(l.deferred > 0 ? [`${l.deferred} deferred`] : []),
          ...(l.unresolved > 0 ? [`${l.unresolved} unresolved`] : []),
        ]
        facts.push(
          `ledger: ${l.verified}/${l.total} verified${extra.length > 0 ? ` (${extra.join(', ')})` : ''}`,
        )
      }
      if (row.archiveReady !== undefined)
        facts.push(
          `archive-ready: ${row.archiveReady ? paint('green', 'yes') : paint('dim', 'no')}`,
        )
      out.push(`       ${facts.join(' · ')}`)
    }
  }

  if (dash.archived.length > 0) {
    out.push('', paint('green', 'Archived Changes'), '─'.repeat(RULE))
    for (const entry of dash.archived.slice(0, ARCHIVED_SHOWN)) {
      const on = entry.archivedOn ?? '(undated)'
      out.push(
        `  ${paint('green', '✓')} ${sanitize(entry.name).padEnd(NAME_WIDTH)} ${paint('dim', `[${sanitize(entry.type)}] ${on}`)}`,
      )
    }
    const more = dash.archived.length - ARCHIVED_SHOWN
    if (more > 0) out.push(paint('dim', `  … and ${more} more (cospec list --archived)`))
  }

  if (dash.specs !== undefined && dash.specs.length > 0) {
    out.push('', paint('blue', 'Specifications'), '─'.repeat(RULE))
    for (const spec of dash.specs.toSorted(
      (a, b) => b.requirementCount - a.requirementCount || a.id.localeCompare(b.id),
    )) {
      const label = spec.requirementCount === 1 ? 'requirement' : 'requirements'
      out.push(
        `  ${paint('blue', '▪')} ${sanitize(spec.id).padEnd(NAME_WIDTH)} ${paint('dim', `${spec.requirementCount} ${label}`)}`,
      )
    }
  } else if (dash.specsError !== undefined) {
    out.push('', paint('yellow', `Specifications unavailable: ${dash.specsError}`))
  }

  out.push('', '═'.repeat(RULE), '')
  out.push(
    paint(
      'dim',
      'Use cospec list --all, cospec list --specs or cospec status --change <id> for detailed views',
    ),
  )
  return `${out.join('\n')}\n`
}

export async function run(ctx: CommandContext): Promise<number> {
  const root = await resolveRoot(ctx)
  if (!existsSync(openspecDir(root.base))) {
    process.stderr.write(`cospec view: no openspec/ directory at ${root.base}\n`)
    return EXIT.failure
  }
  const dash = await buildDashboard(root)
  for (const warning of dash.warnings) process.stderr.write(`Warning: ${warning}\n`)
  process.stdout.write(renderDashboard(dash, colorEnabled(ctx.flags.noColor)))
  return EXIT.success
}
