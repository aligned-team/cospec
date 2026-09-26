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
 * True when a failed wrapped call is the binary's own answer to the argv
 * rather than a cospec-side violation: commander's parse rejection (unknown
 * option, missing value, too many arguments) or the `--store-path` redirect,
 * printed on stderr with nothing on stdout. Both come before the binary's JSON
 * renderer, even with `--json` present, so a `--json` call sees them as
 * unparseable stdout.
 */
export function isParseRejection(result: OpenspecResult): boolean {
  return (
    result.stdout.trim().length === 0 &&
    (/^error: (unknown option|option .* argument missing|too many arguments)/.test(
      result.stderr.trim(),
    ) ||
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
