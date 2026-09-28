// `cospec templates` — read-only passthrough of `openspec templates`, listing
// resolved per-artifact template paths for a schema (`--schema <name>`,
// default `spec-driven`). No gate of cospec's own. `openspec templates`
// rejects `--store`, so it spawns in the resolved root instead (`spawnInRoot`).
// Its action renders every failure as text, `--json` or not (`textFailure`), and
// a failed answer is relayed with its remedies spelled through cospec
// (`relayRespelled`); a successful one verbatim.

import type { CommandContext } from '../cli.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import { callPassthrough } from '../core/passthrough-command.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const { result } = await callPassthrough(ctx, {
    command: ['templates'],
    args: ctx.args,
    spawnInRoot: true,
    textFailure: true,
  })
  return relayRespelled(result, ctx.flags.json)
}
