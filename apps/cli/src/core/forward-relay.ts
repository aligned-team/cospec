// The relay side of a `forward` row (design decisions 1 and 2): the binary is
// the parse authority, `--store-path` included, so a forward wrapper hands it
// the user's argv and only shapes what comes back. Two answers are not the
// command's output and must not be reported as a wrapped-call violation:
// commander's own parse rejection, and the binary's refusal of `--store-path`,
// whose remedy names bare `openspec` and so is answered with cospec's
// respelled redirect instead.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { isUpstreamStorePathRefusal, storePathRefusal } from './command-table.ts'
import { OpenspecCallError, type OpenspecResult, passthroughOpenspec } from './openspec.ts'

/**
 * Every refusal the pinned binary's commander (14.x, `lib/command.js`) raises
 * while it parses, before any action runs. The pin itself reaches the first
 * five (it declares no `.choices()`, `.conflicts()`, required option, custom
 * argument parser or env-backed option); the rest keep a newer in-range
 * binary's refusals relayed too.
 */
const COMMANDER_REFUSAL = new RegExp(
  `^error: (?:${[
    "unknown option '",
    "unknown command '",
    "option '.+' argument missing",
    "missing required argument '",
    'too many arguments',
    "option '.+' argument '.*' is invalid\\.",
    "option '.+' value '.*' from env '.+' is invalid\\.",
    "command-argument value '.*' is invalid for argument '",
    "required option '.+' not specified",
    "(?:option|environment variable) '.+' cannot be used with ",
  ].join('|')})`,
)

/**
 * True when a failed wrapped call is the binary's own answer to the argv
 * rather than a cospec-side violation: commander's parse rejection (any
 * `COMMANDER_REFUSAL` shape — unknown option, missing value, missing required
 * argument, too many arguments, …) or the `--store-path` redirect, printed on
 * stderr with nothing on stdout. Both come before the binary's JSON renderer,
 * even with `--json` present, so a `--json` call sees them as unparseable
 * stdout.
 */
export function isParseRejection(result: OpenspecResult): boolean {
  return (
    result.stdout.trim().length === 0 &&
    (COMMANDER_REFUSAL.test(result.stderr.trim()) ||
      /--store-path is not supported\./.test(result.stderr))
  )
}

/**
 * Runs a forward row's wrapped call, returning the binary's parse rejection
 * as an ordinary result instead of the `OpenspecCallError` a `--json` call
 * raises for it. Every other violation still throws.
 */
export async function forwardCall(call: () => Promise<OpenspecResult>): Promise<OpenspecResult> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof OpenspecCallError && isParseRejection(err.result)) return err.result
    throw err
  }
}

/**
 * When a failed call is the binary's own `--store-path` refusal — its
 * redirect, its `--json` envelope, or commander's plain refusal where the
 * command does not declare the option — prints cospec's redirect in its place
 * and returns exit 1: a document on stdout only where the binary emitted its
 * envelope for a `json` caller (a command that declares the option, refusing
 * it in its action), else the text on stderr, as commander's refusal comes
 * before any output. Returns undefined for any other result, which the caller
 * relays as usual. A call that exited 0 ran its command (`--store-path` was
 * another flag's value) and is never a refusal.
 */
export function relayStorePathRefusal(result: OpenspecResult, json: boolean): number | undefined {
  if (result.exitCode === 0 || !isUpstreamStorePathRefusal(result)) return undefined
  const refusal = storePathRefusal(
    json && /"code":\s*"store_path_not_supported"/.test(result.stdout),
  )
  process[refusal.stream].write(refusal.text)
  return EXIT.failure
}

/**
 * The pinned binary's own remedies in the answers `show` relays (probed at
 * 1.13.1, `dist/commands/change.js`, `show.js`),
 * each rewritten to the cospec command of the same shape — or dropped where
 * cospec has none:
 *
 * - `show` for a change with no proposal.md: `Run "openspec status --change
 *   <id>"`, on stderr, or with escaped quotes in its `--json` message.
 * - `show` for an id that is both a change and a spec: `Pass --type
 *   change|spec, or use: openspec change show / openspec spec show`. cospec
 *   has no noun-form commands, so the clause goes, leaving the wording
 *   upstream itself prints for a store root.
 */
const RELAYED_REMEDIES: readonly (readonly [RegExp, string])[] = [
  [
    /Pass --type change\|spec, or use: openspec change show \/ openspec spec show/g,
    'Pass --type change|spec.',
  ],
  [/(\\?")openspec (status --change )/g, '$1cospec $2'],
]

/** `text` with each of the binary's `RELAYED_REMEDIES` spelled through cospec. */
export function respellRemedies(text: string): string {
  return RELAYED_REMEDIES.reduce((out, [span, cospec]) => out.replace(span, cospec), text)
}

/**
 * A forward row's subcommand and its argv. The dispatcher keeps a `--` ahead
 * of an operand in subcommand position that looks like an option
 * (`cospec -- config --x`), so the token after that `--` is the subcommand
 * name, never an option at the command's level.
 */
export function subcommandOf(args: readonly string[]): {
  readonly sub: string | undefined
  readonly rest: string[]
  /** The name came after a `--`: it is never an option. */
  readonly operand: boolean
} {
  if (args[0] === '--') return { sub: args[1], rest: args.slice(2), operand: true }
  return { sub: args[0], rest: args.slice(1), operand: false }
}

/** Commander's test for a token that is an option rather than an operand. */
export function isOptionToken(tok: string): boolean {
  return tok.length > 1 && tok.startsWith('-')
}

/**
 * A forward row with subcommands whose first remaining token is an option,
 * not a subcommand name: the binary parses it at the command's own level and
 * refuses it there (`config --bogus` as an unknown option), so it is relayed
 * rather than refused as an unknown subcommand. `command` is the command path
 * with any option the wrapper lifted itself (`config --scope <s>`). Nothing
 * is threaded: the command level takes no `--json`, and the binary's refusal
 * comes before any output a flag could shape. `--store-path` there is the
 * binary's unknown option, answered with cospec's redirect.
 */
export async function relayCommandLevel(
  ctx: CommandContext,
  command: readonly string[],
  args: readonly string[],
): Promise<number> {
  const result = await forwardCall(() => passthroughOpenspec({ command, args }, { cwd: ctx.cwd }))
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return result.exitCode === 0 ? EXIT.success : EXIT.failure
}
