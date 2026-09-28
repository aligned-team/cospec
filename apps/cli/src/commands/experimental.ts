// `cospec experimental [--tool <tool-id>]` — upstream's hidden, deprecated
// alias of `init` (`openspec experimental`), kept so a script that still
// types it keeps working. Prints upstream's deprecation note with cospec's own
// spelling (never under `--json`, which must stay one document), then runs
// `cospec init` on the current directory with `--tool` as `--harness`. Never
// spawns the binary's `experimental`.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, flagValue, parseCommandArgs } from '../core/command-table.ts'
import { run as initRun } from './init.ts'

export const DEPRECATION_NOTE =
  'Note: "cospec experimental" is deprecated. Use "cospec init" instead.'

export function run(ctx: CommandContext): number {
  const tool = flagValue(ctx.parsed!, '--tool')
  if (!ctx.flags.json) process.stdout.write(`${DEPRECATION_NOTE}\n`)
  // init.ts reads `ctx.parsed`, so re-parse against init's own row, as
  // `instructions apply` re-parses against apply's.
  const args = ['.', ...(tool !== undefined ? ['--harness', tool] : [])]
  const row = commandRow('init')
  if (row?.parse !== 'table') throw new Error("cospec experimental: 'init' has no table row")
  const result = parseCommandArgs(row, args)
  if (!result.ok) {
    process.stderr.write(result.refusal.message)
    return EXIT.failure
  }
  // A refusal of the tool list names the spelling the user typed.
  const parsed =
    tool !== undefined ? { ...result.parsed, spellings: { '--harness': '--tool' } } : result.parsed
  return initRun({ ...ctx, args, parsed })
}
