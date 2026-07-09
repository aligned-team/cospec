// `cospec list [--blocked]` (DESIGN §2.6). Lists active changes with cospec
// columns — type, gate state, task progress, archive-readiness — derived from
// the filesystem (done == file exists) and the deterministic blocker gate.
// `--blocked` filters to changes whose gate is not clear.
//
// `cospec list --specs` (WI-7) closes the spec-listing gap: cospec's own rules
// are change-centric, so it delegates to `openspec list --specs --json`
// (disciplined passthrough, WI-1) and renders cospec's own spec table —
// change listing stays entirely native.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers } from '../core/blockers.ts'
import { isCospecType, listChanges } from '../core/change.ts'
import { OpenspecCallError, passthroughOpenspec } from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
import { archiveMap, artifactDone, computeGate, type Gate } from './apply.ts'
import { gateLabel, hasAnyArtifact } from './status.ts'

interface SpecRow {
  id: string
  requirementCount: number
}

interface OpenspecListSpecsJson {
  specs?: SpecRow[]
  status?: { severity: string; code: string; message: string; fix?: string }[]
}

/**
 * Delegate spec listing to `openspec list --specs --json` (openspec's `list
 * --specs`/`--json` shape is `{ specs: [{id, requirementCount}], root, status?
 * }`, probed against the pinned 1.5.0). Renders cospec's own spec table so
 * `--specs` output style matches the change table above it. Never touches
 * cospec's own rule families — spec *validation* stays `cospec validate
 * --specs`; this is read-only listing.
 */
async function runSpecs(
  ctx: CommandContext,
  cwd: string,
  storeArgs: readonly string[],
): Promise<number> {
  let result: Awaited<ReturnType<typeof passthroughOpenspec>>
  try {
    result = await passthroughOpenspec(['list', '--specs', '--json'], { cwd, storeArgs })
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

  if (result.exitCode !== 0) {
    const message = parsed.status?.map((s) => s.message).join('\n') ?? result.stderr
    process.stderr.write(`${message}\n`)
    return EXIT.failure
  }

  const specs = parsed.specs ?? []

  if (ctx.flags.json) {
    process.stdout.write(`${JSON.stringify({ version: 1, specs }, null, 2)}\n`)
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
  state: 'in-progress' | 'building'
  gate: string
  gateState: Gate['state']
  tasks: { total: number; complete: number }
  archiveReady: boolean
}

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const root = await resolveRoot(ctx)
  const base = root.base

  if (ctx.args.includes('--specs')) return runSpecs(ctx, root.cwd, root.storeArgs)

  const onlyBlocked = ctx.args.includes('--blocked')

  const changes = listChanges(base)
  const archived = archiveMap(base)
  const active = new Set(changes.map((c) => c.id))

  const rows: Row[] = changes.map((change) => {
    const blockersPath = join(change.dir, 'blocking-changes.md')
    const gate = existsSync(blockersPath)
      ? computeGate(parseBlockers(readFileSync(blockersPath, 'utf8')), archived, active)
      : ({ state: 'clear', hard: [], soft: [] } satisfies Gate)

    const empty = !hasAnyArtifact(change.dir)
    const cospec = isCospecType(change.schema)

    const tasksPath = join(change.dir, 'tasks.md')
    const parsedTasks = existsSync(tasksPath)
      ? parseTasks(readFileSync(tasksPath, 'utf8'))
      : { items: [], malformed: [], groups: [] }
    const total = parsedTasks.items.length
    const complete = parsedTasks.items.filter((t) => t.checked).length

    let archiveReady = false
    if (cospec && !empty) {
      const facts = TYPE_ARTIFACTS[change.schema as keyof typeof TYPE_ARTIFACTS]
      const requiredDone = facts.applyRequires.every((id) => artifactDone(change.dir, id))
      archiveReady = requiredDone && total > 0 && complete === total && gate.state === 'clear'
    }

    return {
      change: change.id,
      type: change.schema || '(none)',
      state: empty ? 'in-progress' : 'building',
      gate: gateLabel(gate),
      gateState: gate.state,
      tasks: { total, complete },
      archiveReady,
    }
  })

  const shown = onlyBlocked ? rows.filter((r) => r.gateState !== 'clear') : rows

  if (flags.json) {
    process.stdout.write(`${JSON.stringify({ version: 1, changes: shown }, null, 2)}\n`)
    return EXIT.success
  }

  if (shown.length === 0) {
    process.stdout.write(onlyBlocked ? 'No blocked changes.\n' : 'No active changes.\n')
    return EXIT.success
  }

  const nameWidth = Math.max(...shown.map((r) => r.change.length), 6)
  const typeWidth = Math.max(...shown.map((r) => r.type.length), 4)
  const lines = shown.map((r) => {
    const tasks =
      r.state === 'in-progress' ? 'no artifacts yet' : `${r.tasks.complete}/${r.tasks.total} tasks`
    const ready = r.archiveReady ? '  archive-ready' : ''
    return `  ${r.change.padEnd(nameWidth)}  ${r.type.padEnd(typeWidth)}  ${r.gate.padEnd(18)}  ${tasks}${ready}`
  })
  process.stdout.write(`${lines.join('\n')}\n`)
  return EXIT.success
}
