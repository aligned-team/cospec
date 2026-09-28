// `cospec instructions [artifact] --change <id> [--schema <name>]` (DESIGN
// §2.7). A thin passthrough to `openspec instructions` so the whole
// artifact-authoring loop is reachable under the cospec brand (MF1): every
// flag it handles is forwarded, and with no artifact or no `--change` the
// binary answers itself (its `Missing required …` list of the valid ones, one
// document under `--json`). `instructions apply --change <id>` on a change
// that exists is `cospec apply <id>`, so the gate cannot be bypassed by
// choosing the other spelling. A refusal relayed from the binary has its
// `openspec` remedies spelled through cospec (`relayRespelled`).

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { resolveChange } from '../core/change.ts'
import { commandRow, flagValue, hasFlag, parseCommandArgs } from '../core/command-table.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import { callPassthrough } from '../core/passthrough-command.ts'
import { resolveRoot } from '../core/root.ts'
import { run as applyRun } from './apply.ts'

export async function run(ctx: CommandContext): Promise<number> {
  const parsed = ctx.parsed!
  const artifact = parsed.positionals[0]
  const changeId = flagValue(parsed, '--change')
  const schema = flagValue(parsed, '--schema')

  // `instructions apply` is the apply gate under a different spelling, for a
  // change there is to gate. With no such change the binary answers, as for
  // any artifact: its document lists the available changes. `archive`
  // (OpenSpec 1.7 parity) is deliberately NOT aliased to `cospec archive`:
  // upstream's `instructions archive` is read-only guidance, forwarded like
  // every other artifact id.
  if (artifact === 'apply' && changeId !== undefined) {
    const root = await resolveRoot(ctx)
    if (resolveChange(root.base, changeId) !== undefined) {
      // The gate reads the change's own schema; an override would be dropped.
      if (schema !== undefined) {
        process.stderr.write(
          "cospec instructions: '--schema' does not apply to 'apply' — the gate reads the change's own schema\n",
        )
        return EXIT.failure
      }
      // apply.ts reads `ctx.parsed`, so re-parse against apply's own row
      // rather than spreading this command's `parsed` (its positional is
      // `'apply'`, not the change id, which apply.ts would otherwise resolve
      // as the change name).
      const args = [changeId]
      if (hasFlag(parsed, '--allow-soft')) args.push('--allow-soft')
      const row = commandRow('apply')
      if (row?.parse !== 'table') throw new Error("cospec instructions: 'apply' has no table row")
      const result = parseCommandArgs(row, args)
      if (!result.ok) {
        process.stderr.write(result.refusal.message)
        return EXIT.failure
      }
      return applyRun({ ...ctx, args, parsed: result.parsed })
    }
  }

  const { result } = await callPassthrough(ctx, {
    command: ['instructions', ...(artifact !== undefined ? [artifact] : [])],
    args: [
      ...(changeId !== undefined ? ['--change', changeId] : []),
      ...(schema !== undefined ? ['--schema', schema] : []),
    ],
  })
  return relayRespelled(result, ctx.flags.json)
}
