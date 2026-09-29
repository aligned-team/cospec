// `cospec schemas` — read-only passthrough of `openspec schemas`, listing every
// resolvable schema (cospec's 11 canon-managed types plus any project/package
// fallback) with its artifact chain. No gate of cospec's own: the wrapped call
// runs through the shared passthrough plumbing (WI-1); a successful listing is
// relayed verbatim (a schema's own text is the user's), a failed one with the
// binary's remedies spelled through cospec (`relayRespelled`).

import type { CommandContext } from '../cli.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import { callPassthrough } from '../core/passthrough-command.ts'

/** `schemas`' empty payload in a `--json` root-selection failure, as upstream prints it. */
export const jsonFailurePayload = { schemas: [], root: null } as const

export async function run(ctx: CommandContext): Promise<number> {
  const { result } = await callPassthrough(ctx, { command: ['schemas'], args: ctx.args })
  return relayRespelled(result, ctx.flags.json)
}
