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
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
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
    hasSpecFiles(changeDir)
  )
}

export interface ArtifactStatus {
  id: string
  done: boolean
  required: boolean
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
}

/**
 * Full status for a cospec-typed change with at least one artifact. Assumes the
 * caller has excluded the empty-change and legacy cases.
 */
export function computeStatus(cwd: string, change: Change): ChangeStatus {
  const facts = TYPE_ARTIFACTS[change.schema as keyof typeof TYPE_ARTIFACTS]
  const applyRequires = new Set(facts.applyRequires)
  const artifacts: ArtifactStatus[] = facts.declared.map((id) => ({
    id,
    done: artifactDone(change.dir, id),
    required: applyRequires.has(id),
  }))

  const blockersPath = join(change.dir, 'blocking-changes.md')
  const gate = existsSync(blockersPath)
    ? computeGate(
        parseBlockers(readFileSync(blockersPath, 'utf8')),
        archiveMap(cwd),
        new Set(listChanges(cwd).map((c) => c.id)),
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

  return {
    change: change.id,
    type: change.schema,
    state: 'building',
    artifacts,
    gate: gateLabel(gate),
    gateState: gate.state,
    tasks: { total, complete },
    archiveReady,
  }
}

function renderHuman(status: ChangeStatus): string {
  const lines = [`${status.change}  (${status.type})`]
  for (const a of status.artifacts) {
    const mark = a.done ? '✓' : ' '
    const tag = a.required ? 'required' : 'optional'
    lines.push(`  [${mark}] ${a.id.padEnd(16)} ${tag}`)
  }
  lines.push(`  gate:          ${status.gate}`)
  lines.push(`  tasks:         ${status.tasks.complete}/${status.tasks.total}`)
  lines.push(`  archive-ready: ${status.archiveReady ? 'yes' : 'no'}`)
  return `${lines.join('\n')}\n`
}

export async function run(ctx: CommandContext): Promise<number> {
  const { cwd, flags } = ctx
  let id = flagValue(ctx.args, '--change') ?? ctx.args.find((a) => !a.startsWith('-'))

  const active = listChanges(cwd)
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

  const change = resolveChange(cwd, id)
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

  const status = computeStatus(cwd, change)
  process.stdout.write(flags.json ? `${JSON.stringify(status, null, 2)}\n` : renderHuman(status))
  return EXIT.success
}
