// `cospec list [--blocked] [--sort <order>]` (DESIGN §2.6). Lists active
// changes with cospec columns — type, gate state, task progress,
// archive-readiness — derived from the filesystem (done == file exists) and the
// deterministic blocker gate. `--blocked` filters to changes whose gate is not
// clear.
//
// The rows, their order and the binary's own keys come from one delegated
// `openspec list --json` call (design D6): the binary's rows set the order and
// the membership, each gets cospec's native columns by name, and the binary's
// keys are merged in beside them (`core/upstream-keys.ts`). `--sort name`
// is forwarded; any other value, like none, is the binary's recent-first order.
//
// `cospec list --specs` (WI-7) closes the spec-listing gap: cospec's own rules
// are change-centric, so it delegates to `openspec list --specs --json`
// (disciplined passthrough, WI-1) and renders cospec's own spec table.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers } from '../core/blockers.ts'
import { loadSchema, schemaDir } from '../core/change-metadata.ts'
import {
  changesDir,
  defaultProjectSchema,
  findNestedChangesIn,
  isCospecType,
  listChanges,
  readOpenspecYaml,
} from '../core/change.ts'
import { flagValue, hasFlag } from '../core/command-table.ts'
import { artifactOutputExists } from '../core/glob.ts'
import {
  OpenspecCallError,
  passthroughOpenspec,
  wrappedCallLabel,
  type Root,
} from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { enforcedApplyRequires, type CospecType } from '../core/rules/type-facts.ts'
import { mergeUpstream, resolveRootOrDocument, type Identities } from '../core/upstream-keys.ts'
import { readVerificationVerdict } from '../core/verification.ts'
import { artifactDone, computeGate, isArchiveReady, type Gate } from './apply.ts'
import {
  gateLabel,
  hasAnyArtifact,
  readArchive,
  readChangeTasks,
  type ReadWarning,
} from './status.ts'

interface SpecRow {
  id: string
  requirementCount: number
}

interface OpenspecListSpecsJson {
  specs?: SpecRow[]
  root?: unknown
  status?: { severity: string; code: string; message: string; fix?: string }[]
}

/**
 * Delegate spec listing to `openspec list --specs --json` (openspec's `list
 * --specs`/`--json` shape is `{ specs: [{id, requirementCount}], root, status?
 * }`). Renders cospec's own spec table so `--specs` output style matches the
 * change table; under `--json` cospec's `{version: 1, specs}` document carries
 * the delegated `root`. Never touches cospec's own rule families — spec
 * *validation* stays `cospec validate --specs`; this is read-only listing.
 */
async function runSpecs(ctx: CommandContext, root: Root): Promise<number> {
  let result: Awaited<ReturnType<typeof passthroughOpenspec>>
  try {
    result = await passthroughOpenspec(
      { command: ['list'], threaded: ['--json', ...root.storeArgs], args: ['--specs'] },
      { cwd: root.cwd },
    )
  } catch (err) {
    if (err instanceof OpenspecCallError) {
      process.stderr.write(`${err.message}\n`)
      return EXIT.failure
    }
    throw err
  }

  let parsed: OpenspecListSpecsJson
  try {
    parsed = JSON.parse(result.stdout) as OpenspecListSpecsJson
  } catch {
    process.stderr.write('cospec: could not parse JSON from: openspec list --specs --json\n')
    return EXIT.failure
  }

  // A read the binary refuses (an unreadable capability directory) is its
  // answer, relayed: its document under `--json`, else its message and fix.
  const failure = upstreamFailure(parsed as Record<string, unknown>)
  if (failure !== undefined) {
    if (ctx.flags.json)
      process.stdout.write(respellRemedies(`${JSON.stringify(parsed, null, 2)}\n`))
    else
      for (const s of failure) {
        process.stderr.write(`cospec: ${respellRemedies(s.message)}\n`)
        if (typeof s.fix === 'string') process.stderr.write(`Fix: ${respellRemedies(s.fix)}\n`)
      }
    return EXIT.failure
  }

  if (result.exitCode !== 0) {
    const message = parsed.status?.map((s) => s.message).join('\n') ?? result.stderr
    process.stderr.write(`${message}\n`)
    return EXIT.failure
  }

  const specs = parsed.specs ?? []

  if (ctx.flags.json) {
    const doc = { version: 1, specs, ...(parsed.root === undefined ? {} : { root: parsed.root }) }
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
    return EXIT.success
  }

  if (specs.length === 0) {
    process.stdout.write('No specs.\n')
    return EXIT.success
  }

  const idWidth = Math.max(...specs.map((s) => s.id.length), 4)
  const lines = specs.map(
    (s) =>
      `  ${s.id.padEnd(idWidth)}  ${s.requirementCount} requirement${s.requirementCount === 1 ? '' : 's'}`,
  )
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}

interface Row {
  change: string
  type: string
  /** `not-a-change` for a namespace folder (design D6), which cospec used to call an empty change. */
  state: 'in-progress' | 'building' | 'not-a-change'
  gate: string
  gateState: Gate['state']
  tasks: { total: number; complete: number }
  archiveReady: boolean
  /** A namespace folder's nested changes (design D2), as the binary's row carries them. */
  nested?: string[]
}

/** A row cospec could not compute: a file only its own columns read would not open. */
interface FailedRow {
  change: string
  error: string
}

/**
 * cospec's native columns for the change directory `id`, computed as ever — a
 * namespace folder marked `not-a-change` with its nested ids. A change file
 * that cannot be read (errno) fails this row alone, as the binary never reads
 * `blocking-changes.md`; an unreadable `tasks.md` counts as no tasks, as the
 * binary counts it, its warning added to `warnings`.
 */
function nativeRow(
  base: string,
  id: string,
  archived: Map<string, string>,
  active: Set<string>,
  warnings: ReadWarning[],
): Row | FailedRow {
  try {
    return computeRow(base, id, archived, active, warnings)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (!(error instanceof Error) || typeof code !== 'string') throw error
    return { change: id, error: error.message }
  }
}

/**
 * Whether `dir` holds a file its own declared schema's `generates` pattern
 * names — the only signal cospec has for an artifact it doesn't recognize by
 * name (mirrors `core/change.ts`'s `hasSchemaOutput`, scoped to the change's
 * own resolved schema rather than the project's default, since a
 * schema-bearing change always names its own). A schema name that resolves to
 * no directory at all gives no signal, as the binary's own `list` never loads
 * a schema either (its row is task-progress-only; `dist/core/list.js`) — but a
 * schema that does resolve and then fails to read, parse or validate is a
 * real defect, not an absence, so it is surfaced as a warning on `id`'s row
 * rather than silently counted as no artifacts.
 */
function hasDeclaredArtifact(
  dir: string,
  schema: string,
  base: string,
  id: string,
  warnings: ReadWarning[],
): boolean {
  if (schemaDir(schema, base) === undefined) return false
  let artifacts: { generates: string }[]
  try {
    artifacts = loadSchema(schema, base)
  } catch (err) {
    warnings.push({
      code: 'schema_unreadable',
      message: `${id}: ${err instanceof Error ? err.message : String(err)}; its artifacts are counted as none`,
    })
    return false
  }
  try {
    return artifacts.some((artifact) => artifactOutputExists(dir, artifact.generates))
  } catch {
    // upstream's bare `catch` on an output it cannot resolve (one leaving
    // the change, a linked directory cycle): no signal.
    return false
  }
}

function computeRow(
  base: string,
  id: string,
  archived: Map<string, string>,
  active: Set<string>,
  warnings: ReadWarning[],
): Row {
  const dir = join(changesDir(base), id)
  const finding = findNestedChangesIn(changesDir(base), id)
  // A change with no `.openspec.yaml` of its own takes its schema the way
  // `cospec status`'s `gradedChange` and `core/change.ts`'s `hasSchemaOutput`
  // do — the project's `config.yaml` `schema:`, else `spec-driven` — so a
  // custom-named artifact under that fallback schema is never reported as no
  // artifacts at all, and the row's type/completeness agree with `status`.
  // A namespace folder is not a change at all (`state` below reports it as
  // such), so it never takes this fallback — `status --all` discards its
  // `gradedChange`-resolved schema the same way, reporting it as a failure
  // entry with no `type` field rather than the project's default schema.
  const bare = finding === undefined && !existsSync(join(dir, '.openspec.yaml'))
  const schema = bare ? defaultProjectSchema(base) : (readOpenspecYaml(dir)?.schema ?? '')
  const blockersPath = join(dir, 'blocking-changes.md')
  const gate = existsSync(blockersPath)
    ? computeGate(parseBlockers(readFileSync(blockersPath, 'utf8')), archived, active)
    : ({ state: 'clear', hard: [], soft: [] } satisfies Gate)

  const cospec = isCospecType(schema)
  // cospec's fixed artifact filenames are the only signal for a cospec-typed
  // change; a schema cospec doesn't type additionally gets its own declared
  // schema's `generates` signal, so a custom-named artifact cospec doesn't
  // recognize by filename is never reported as no artifacts at all (the
  // misclassification task 11.5 fixed for `status`'s `state`/`next`).
  const empty =
    !hasAnyArtifact(dir) && (cospec || !hasDeclaredArtifact(dir, schema, base, id, warnings))

  const parsedTasks = readChangeTasks(dir, warnings)
  const total = parsedTasks.items.length
  const complete = parsedTasks.items.filter((t) => t.checked).length

  let archiveReady = false
  if (cospec && !empty) {
    // The same required set `status` and the gates enforce: a grandfathered
    // change is judged on its stamped `schemaVersion`, and its verification
    // verdict is the archive gate's own computation.
    const applyRequires = enforcedApplyRequires(
      schema as CospecType,
      readOpenspecYaml(dir)?.schemaVersion ?? 1,
    )
    archiveReady = isArchiveReady({
      requiredDone: applyRequires.every((a) => artifactDone(dir, a)),
      tasks: { total, complete },
      gate,
      verdict: readVerificationVerdict(dir, applyRequires.includes('verification')),
    })
  }

  return {
    change: id,
    type: schema || '(none)',
    state: finding !== undefined ? 'not-a-change' : empty ? 'in-progress' : 'building',
    gate: gateLabel(gate),
    gateState: gate.state,
    tasks: { total, complete },
    archiveReady,
    ...(finding === undefined ? {} : { nested: finding.nested }),
  }
}

function isFailedRow(row: Row | FailedRow): row is FailedRow {
  return 'error' in row
}

/** The binary's failure diagnostics, when its answer is a failure document. */
function upstreamFailure(
  doc: Record<string, unknown>,
): { message: string; fix?: string }[] | undefined {
  if (!Array.isArray(doc.status)) return undefined
  const errors = (doc.status as { severity?: string; message: string; fix?: string }[]).filter(
    (s) => s.severity === 'error',
  )
  return errors.length > 0 ? errors : undefined
}

/** The warnings `list` prints: `Warning: <message>` on stderr, or `warnings` under `--json`. */
const WARNING_IDENTITY: Identities = { 'warnings[]': { cospec: 'message', upstream: 'message' } }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The one delegated `openspec list --json` call (design D6). Its failure
 * document (`status`, exit 1) is an answer, not a violation; anything but one
 * document carrying `changes` or `status` is.
 */
async function delegatedList(root: Root, args: string[]): Promise<Record<string, unknown>> {
  const label = wrappedCallLabel(['list', '--json', ...root.storeArgs, ...args])
  let doc: Record<string, unknown> | undefined
  await passthroughOpenspec(
    { command: ['list'], threaded: ['--json', ...root.storeArgs], args },
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
          if (!Array.isArray(parsed.changes) && !Array.isArray(parsed.status))
            return `${label} printed neither changes nor a diagnostic`
          doc = parsed
          return true
        },
      },
    },
  )
  return doc!
}

/** The binary's `list` null-shape under `--json` (`{changes: [], root: null}`). */
const LIST_FAILURE_PAYLOAD = { changes: [], root: null } as const
const SPECS_FAILURE_PAYLOAD = { specs: [], root: null } as const

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const parsed = ctx.parsed!
  const specsMode = hasFlag(parsed, '--specs')
  const root = await resolveRootOrDocument(
    ctx,
    'list_error',
    specsMode ? SPECS_FAILURE_PAYLOAD : LIST_FAILURE_PAYLOAD,
  )
  if (root === undefined) return EXIT.failure
  const base = root.base

  if (specsMode) return runSpecs(ctx, root)

  const onlyBlocked = hasFlag(parsed, '--blocked')
  const upstream = await delegatedList(
    root,
    flagValue(parsed, '--sort') === 'name' ? ['--sort', 'name'] : [],
  )

  // A read failure the binary refuses (an unreadable tasks.md or change
  // directory) is its answer, relayed: its document, or its messages.
  const failure = upstreamFailure(upstream)
  if (failure !== undefined) {
    if (flags.json) process.stdout.write(respellRemedies(`${JSON.stringify(upstream, null, 2)}\n`))
    else
      for (const s of failure) {
        // The binary's text answer: its message, then its fix, each spelled through cospec.
        process.stderr.write(`cospec list: ${respellRemedies(s.message)}\n`)
        if (typeof s.fix === 'string') process.stderr.write(`Fix: ${respellRemedies(s.fix)}\n`)
      }
    return EXIT.failure
  }

  const upstreamRows = (Array.isArray(upstream.changes) ? upstream.changes : []) as Record<
    string,
    unknown
  >[]

  const { archived, warning } = readArchive(base)
  const active = new Set(listChanges(base).map((c) => c.id))
  const warnings: ReadWarning[] = warning === undefined ? [] : [warning]
  const rows = upstreamRows.map((upRow) => {
    const native = nativeRow(base, String(upRow.name), archived, active, warnings)
    return mergeUpstream(native, upRow).value
  })
  const failed = rows.some(isFailedRow)

  const shown = onlyBlocked ? rows.filter((r) => isFailedRow(r) || r.gateState !== 'clear') : rows

  if (flags.json) {
    const { changes: _rows, ...rest } = upstream
    const doc = mergeUpstream(
      { version: 1, changes: shown, ...(warnings.length === 0 ? {} : { warnings }) },
      rest,
      WARNING_IDENTITY,
    ).value
    process.stdout.write(`${JSON.stringify(doc, null, 2)}\n`)
    return failed ? EXIT.failure : EXIT.success
  }

  for (const w of warnings) process.stderr.write(`Warning: ${w.message}\n`)
  if (shown.length === 0) {
    process.stdout.write(onlyBlocked ? 'No blocked changes.\n' : 'No active changes.\n')
    return EXIT.success
  }

  const nameWidth = Math.max(...shown.map((r) => r.change.length), 6)
  const typeWidth = Math.max(...shown.map((r) => (isFailedRow(r) ? 0 : r.type.length)), 4)
  const lines = shown.map((r) => {
    if (isFailedRow(r)) return `  ${r.change.padEnd(nameWidth)}  ERROR — ${r.error}`
    const tasks =
      r.state === 'not-a-change'
        ? 'not a change'
        : r.state === 'in-progress'
          ? 'no artifacts yet'
          : `${r.tasks.complete}/${r.tasks.total} tasks`
    const ready = r.archiveReady ? '  archive-ready' : ''
    return `  ${r.change.padEnd(nameWidth)}  ${r.type.padEnd(typeWidth)}  ${r.gate.padEnd(18)}  ${tasks}${ready}`
  })
  process.stdout.write(`${lines.join('\n')}\n`)
  // The binary's nested-folder warnings follow the table, as its text does.
  const upstreamWarnings = (Array.isArray(upstream.warnings) ? upstream.warnings : []) as {
    message: string
  }[]
  for (const w of upstreamWarnings) process.stdout.write(`\nWarning: ${w.message}\n`)
  return failed ? EXIT.failure : EXIT.success
}
