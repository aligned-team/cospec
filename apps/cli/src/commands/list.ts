// `cospec list [--blocked]` (DESIGN §2.6). Lists active changes with cospec
// columns — type, gate state, task progress, archive-readiness — derived from
// the filesystem (done == file exists) and the deterministic blocker gate.
// `--blocked` filters to changes whose gate is not clear.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { parseBlockers } from '../core/blockers.ts'
import { isCospecType, listChanges } from '../core/change.ts'
import { TYPE_ARTIFACTS } from '../core/rules/type-facts.ts'
import { parseTasks } from '../core/tasks.ts'
import { archiveMap, artifactDone, computeGate, type Gate } from './apply.ts'
import { gateLabel, hasAnyArtifact } from './status.ts'

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
  const { cwd, flags } = ctx
  const onlyBlocked = ctx.args.includes('--blocked')

  const changes = listChanges(cwd)
  const archived = archiveMap(cwd)
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
