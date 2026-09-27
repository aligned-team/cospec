// `cospec show <item>` (WI-5) — a disciplined read-only passthrough of
// `openspec show`, showing a change or spec (text or JSON). cospec adds no
// gate: it forwards the item name plus any of openspec's own flags
// (`--type`, `--deltas-only`, `--requirements-only`, `--requirements`,
// `--no-scenarios`, `-r`/`--requirement`) verbatim, threads the three global
// flags (`--json`/`--no-color`/`--store`) via `passthrough-command.ts`, and
// relays stdout/stderr as-is, except that a refusal's remedies naming bare
// `openspec` are spelled through cospec (`respellRemedies`). The pinned binary
// already exits 1 for an unknown or ambiguous item (re-probed against the
// 1.11.0 pin: exit 1, empty stdout, `Unknown item '<name>'. Did you mean: …`
// on stderr) — no extra deny-list is needed for that case.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, isStorePathToken } from '../core/command-table.ts'
import { relayStorePathRefusal, respellRemedies } from '../core/forward-relay.ts'
import { callPassthrough } from '../core/passthrough-command.ts'

/**
 * Whether the binary has something to answer besides its "Nothing to show"
 * screen (which names bare `openspec` commands): an item, which with
 * `allowUnknownOption(true)` includes any option `show` does not declare
 * (`show --bogus` looks up an item called `--bogus`); a declared value-taking
 * flag left without its value, commander's missing value; or `--store-path`,
 * whose refusal the relay answers with cospec's redirect.
 */
export function binaryAnswers(args: readonly string[]): boolean {
  const flags = commandRow('show')?.flags ?? []
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--') return i + 1 < args.length
    if (!tok.startsWith('-') || tok === '-' || isStorePathToken(tok)) return true
    const flag = flags.find((f) => f.name === tok || f.short === tok)
    if (flag === undefined) {
      const eq = tok.indexOf('=')
      const inline = eq > 0 ? flags.find((f) => f.name === tok.slice(0, eq)) : undefined
      if (inline?.takesValue !== true) return true
      continue
    }
    if (flag.takesValue === true && ++i >= args.length) return true
  }
  return false
}

export async function run(ctx: CommandContext): Promise<number> {
  if (!binaryAnswers(ctx.args)) {
    process.stderr.write('cospec show: an item name is required (cospec show <change-or-spec>)\n')
    return EXIT.failure
  }
  const { result, code } = await callPassthrough(ctx, { command: ['show'], args: ctx.args })
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
  // Only a refusal carries the binary's remedies; a change or spec it shows is
  // the user's own text, relayed untouched.
  const relay = code === EXIT.success ? (text: string) => text : respellRemedies
  if (result.stdout.length > 0) process.stdout.write(relay(result.stdout))
  if (result.stderr.length > 0) process.stderr.write(relay(result.stderr))
  return code
}
