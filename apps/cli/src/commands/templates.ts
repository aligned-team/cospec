// `cospec templates` — read-only passthrough of `openspec templates`, listing
// resolved per-artifact template paths for a schema (`--schema <name>`,
// default `spec-driven`). No gate of cospec's own: relay the wrapped call
// verbatim through the shared passthrough plumbing (WI-1). `openspec templates`
// rejects `--store`, so it spawns in the resolved root instead (`spawnInRoot`).

import type { CommandContext } from '../cli.ts'
import { runPassthrough } from '../core/passthrough-command.ts'

export function run(ctx: CommandContext): Promise<number> {
  return runPassthrough(ctx, { command: ['templates'], args: ctx.args, spawnInRoot: true })
}
