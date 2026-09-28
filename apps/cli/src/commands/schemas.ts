// `cospec schemas` — read-only passthrough of `openspec schemas`, listing every
// resolvable schema (cospec's 11 canon-managed types plus any project/package
// fallback) with its artifact chain. No gate of cospec's own: relay the
// wrapped call verbatim through the shared passthrough plumbing (WI-1).

import type { CommandContext } from '../cli.ts'
import { runPassthrough } from '../core/passthrough-command.ts'

/** `schemas`' empty payload in a `--json` root-selection failure, as upstream prints it. */
export const jsonFailurePayload = { schemas: [], root: null } as const

export function run(ctx: CommandContext): Promise<number> {
  return runPassthrough(ctx, { command: ['schemas'], args: ctx.args })
}
