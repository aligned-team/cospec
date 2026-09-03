// `cospec show <item>` (WI-5) — a disciplined read-only passthrough of
// `openspec show`, showing a change or spec (text or JSON). cospec adds no
// gate: it forwards the item name plus any of openspec's own flags
// (`--type`, `--deltas-only`, `--requirements-only`, `--requirements`,
// `--no-scenarios`, `-r`/`--requirement`) verbatim, threads the three global
// flags (`--json`/`--no-color`/`--store`) via `passthrough-command.ts`, and
// relays stdout/stderr as-is. The pinned binary already exits 1 for an
// unknown or ambiguous item (re-probed against the 1.11.0 pin: exit 1, empty
// stdout, `Unknown item '<name>'. Did you mean: …` on stderr) — no extra
// deny-list is needed for that case.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { runPassthrough } from '../core/passthrough-command.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const name = ctx.args.find((a) => !a.startsWith('-'))
  if (name === undefined) {
    process.stderr.write('cospec show: an item name is required (cospec show <change-or-spec>)\n')
    return EXIT.failure
  }
  return runPassthrough(ctx, { args: ['show', ...ctx.args] })
}
