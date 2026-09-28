// `cospec show <item>` (WI-5) — a disciplined read-only passthrough of
// `openspec show`, showing a change or spec (text or JSON). cospec adds no
// gate: it forwards the item name plus any of openspec's own flags
// (`--type`, `--deltas-only`, `--requirements-only`, `--requirements`,
// `--no-scenarios`, `-r`/`--requirement`) verbatim, threads the three global
// flags (`--json`/`--no-color`/`--store`) via `passthrough-command.ts`, and
// relays stdout/stderr as-is, except that a refusal's remedies naming bare
// `openspec` are spelled through cospec (`relayRespelled`). The pinned binary
// already exits 1 for an unknown or ambiguous item (re-probed against the
// 1.11.0 pin: exit 1, empty stdout, `Unknown item '<name>'. Did you mean: …`
// on stderr) — no extra deny-list is needed for that case.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { commandRow, isStorePathToken, splitShortCluster } from '../core/command-table.ts'
import { relayRespelled } from '../core/forward-relay.ts'
import { callPassthrough } from '../core/passthrough-command.ts'

/**
 * Whether the binary has something to answer besides its "Nothing to show"
 * screen (which names bare `openspec` commands): an item, which with
 * `allowUnknownOption(true)` includes any option `show` does not declare
 * (`show --bogus` looks up an item called `--bogus`); a declared value-taking
 * flag left without its value, commander's missing value; or `--store-path`,
 * whose refusal the relay answers with cospec's redirect. An empty token
 * (`show ""`, after `--` too) is no item: the binary answers it with that
 * screen, so it is skipped, while a later item still reaches the binary
 * (`show "" c1` is its too many arguments). A short option is split as
 * commander splits it (`splitShortCluster`): `-r1`, `-r=1` and `-rr` give `-r`
 * the rest of the token as its value, and a boolean short leaves `-<rest>` as
 * the next token, so none of them is an item.
 */
export function binaryAnswers(argv: readonly string[]): boolean {
  const flags = commandRow('show')?.flags ?? []
  const surfaces = [{ flags }]
  const args = [...argv]
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '') continue
    if (tok === '--') return args.slice(i + 1).some((rest) => rest !== '')
    if (!tok.startsWith('-') || tok === '-' || isStorePathToken(tok)) return true
    const cluster = splitShortCluster(surfaces, tok)
    if (cluster !== undefined) {
      if (!cluster.takesValue) args.splice(i + 1, 0, cluster.tail)
      continue
    }
    const flag = flags.find((f) => f.name === tok || f.short === tok)
    if (flag === undefined) {
      const eq = tok.indexOf('=')
      const head = tok.slice(0, eq)
      const inline = eq > 0 ? flags.find((f) => f.name === head || f.short === head) : undefined
      if (inline?.takesValue !== true) return true
      continue
    }
    if (flag.takesValue === true && ++i >= args.length) return true
  }
  return false
}

export async function run(ctx: CommandContext): Promise<number> {
  if (!binaryAnswers(ctx.args)) {
    const message = 'an item name is required (cospec show <change-or-spec>)'
    // A `--json` caller gets one document in show's own failure shape.
    if (ctx.flags.json) {
      const status = [{ severity: 'error', code: 'missing_item', message }]
      process.stdout.write(`${JSON.stringify({ status }, null, 2)}\n`)
    } else process.stderr.write(`cospec show: ${message}\n`)
    return EXIT.failure
  }
  const { result } = await callPassthrough(ctx, { command: ['show'], args: ctx.args })
  return relayRespelled(result, ctx.flags.json)
}
