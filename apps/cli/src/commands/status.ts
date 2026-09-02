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
import { resolveRoot } from '../core/root.ts'
import {
  artifactRequires,
  enforcedApplyRequires,
  TYPE_ARTIFACTS,
  type CospecType,
} from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
import { computeVerificationVerdict, type VerificationVerdict } from '../core/verification.ts'
import { archiveMap, artifactDone, closest, computeGate, hasSpecFiles, type Gate } from './apply.ts'

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
  const eq = args.find((a) => a.startsWith(`${flag}=`))
  return eq?.slice(flag.length + 1)
}

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
    return `${entry.change} (${entry.type}): legacy schema — use \`openspec status --change ${entry.change}\` for details\n`
  }
  if ('next' in entry) {
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
    process.stdout.write(`${JSON.stringify({ changes: entries, root: base }, null, 2)}\n`)
  } else if (entries.length === 0) {
    process.stdout.write('cospec status: no active changes\n')
  } else {
    process.stdout.write(entries.map(renderEntryHuman).join('\n'))
  }

  return entries.some(isFailure) ? EXIT.failure : EXIT.success
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx

  if (ctx.args.includes('--all')) {
    if (flagValue(ctx.args, '--change') !== undefined || ctx.args.some((a) => !a.startsWith('-'))) {
      process.stderr.write(
        'cospec status: The --all and --change options are mutually exclusive.\n',
      )
      return EXIT.failure
    }
    return runAll(ctx)
  }

  const root = await resolveRoot(ctx)
  const base = root.base
  let id = flagValue(ctx.args, '--change') ?? ctx.args.find((a) => !a.startsWith('-'))

  const active = listChanges(base)
  if (id === undefined) {
    if (active.length === 1) {
      id = active[0]!.id
    } else if (active.length === 0) {
      process.stdout.write('cospec status: no active changes\n')
      return EXIT.success
    } else {
      process.stderr.write('cospec status: --change <id> is required\n')
      process.stderr.write(`active changes: ${active.map((c) => c.id).join(', ')}\n`)
      return EXIT.failure
    }
  }

  const change = resolveChange(base, id)
  if (change === undefined) {
    process.stderr.write(`cospec status: unknown change '${id}'\n`)
    const suggestion = closest(
      id,
      active.map((c) => c.id),
    )
    if (suggestion !== undefined) process.stderr.write(`Did you mean '${suggestion}'?\n`)
    return EXIT.failure
  }

  // Empty change: has .openspec.yaml but no artifacts yet (never "Unknown item").
  if (!hasAnyArtifact(change.dir)) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify(
          {
            change: change.id,
            type: change.schema,
            state: 'in-progress',
            artifacts: [],
            gate: 'clear',
            archiveReady: false,
            next: `cospec instructions proposal --change ${change.id}`,
          },
          null,
          2,
        )}\n`,
      )
    } else {
      process.stdout.write(
        `${change.id} (${change.schema}): in progress — no artifacts yet; next: cospec instructions proposal --change ${change.id}\n`,
      )
    }
    return EXIT.success
  }

  // Legacy / unknown schema: no cospec artifact matrix — report minimally.
  if (!isCospecType(change.schema)) {
    if (flags.json) {
      process.stdout.write(
        `${JSON.stringify({ change: change.id, type: change.schema, legacy: true }, null, 2)}\n`,
      )
    } else {
      process.stdout.write(
        `${change.id} (${change.schema}): legacy schema — use \`openspec status --change ${change.id}\` for details\n`,
      )
    }
    return EXIT.success
  }

  const status = computeStatus(base, change)
  process.stdout.write(flags.json ? `${JSON.stringify(status, null, 2)}\n` : renderHuman(status))
  return EXIT.success
}
