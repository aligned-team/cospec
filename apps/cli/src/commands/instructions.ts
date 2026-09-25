// `cospec instructions <artifact> --change <id>` (DESIGN §2.7). A thin
// passthrough to `openspec instructions` so the whole artifact-authoring loop is
// reachable under the cospec brand (MF1). `instructions apply` is an alias for
// `cospec apply <id>` so the gate cannot be bypassed by choosing the other
// spelling.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, parseCommandArgs } from '../core/command-table.ts'
import { runPassthrough } from '../core/passthrough-command.ts'
import { run as applyRun } from './apply.ts'

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1]
  const eq = args.find((a) => a.startsWith(`${flag}=`))
  return eq?.slice(flag.length + 1)
}

// `archive` (OpenSpec 1.7 parity) is deliberately NOT aliased to `cospec
// archive` the way `apply` is aliased to the apply gate: upstream's
// `instructions archive` is read-only guidance, so it falls through to the
// generic passthrough branch below like every other artifact id.
const ARTIFACTS = [
  'proposal',
  'blocking-changes',
  'specs',
  'design',
  'verification',
  'tasks',
  'apply',
  'archive',
]

export async function run(ctx: CommandContext): Promise<number> {
  const artifact = ctx.args.find((a) => !a.startsWith('-'))
  const changeId = flagValue(ctx.args, '--change')

  if (artifact === undefined) {
    process.stderr.write(
      `cospec instructions: an artifact is required (one of: ${ARTIFACTS.join(', ')})\n`,
    )
    return EXIT.failure
  }

  // `instructions apply` is the apply gate under a different spelling.
  // apply.ts reads `ctx.parsed`, so re-parse against apply's own row rather
  // than spreading this command's `parsed` (its positional is `'apply'`, not
  // the change id, which apply.ts would otherwise resolve as the change name).
  if (artifact === 'apply') {
    const args = changeId !== undefined ? [changeId] : []
    if (ctx.args.includes('--allow-soft')) args.push('--allow-soft')
    const row = commandRow('apply')
    if (row?.parse !== 'table') throw new Error("cospec instructions: 'apply' has no table row")
    const result = parseCommandArgs(row, args)
    if (!result.ok) {
      process.stderr.write(result.refusal.message)
      return EXIT.failure
    }
    return applyRun({ ...ctx, args, parsed: result.parsed })
  }

  if (changeId === undefined) {
    process.stderr.write('cospec instructions: --change <id> is required\n')
    return EXIT.failure
  }

  return runPassthrough(ctx, { args: ['instructions', artifact, '--change', changeId] })
}
