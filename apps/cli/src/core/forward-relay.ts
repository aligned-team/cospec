// The relay side of a `forward` row (design decisions 1 and 2): the binary is
// the parse authority, `--store-path` included, so a forward wrapper hands it
// the user's argv and only shapes what comes back. Two answers are not the
// command's output and must not be reported as a wrapped-call violation:
// commander's own parse rejection, and the binary's refusal of `--store-path`,
// whose remedy names bare `openspec` and so is answered with cospec's
// respelled redirect instead.

import { EXIT } from '../cli.ts'
import { isUpstreamStorePathRefusal, storePathRefusal } from './command-table.ts'
import { OpenspecCallError, type OpenspecResult } from './openspec.ts'

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
 * (a document on stdout under `json`) and returns exit 1. Returns undefined
 * for any other result, which the caller relays as usual. A call that exited
 * 0 ran its command (`--store-path` was another flag's value) and is never a
 * refusal.
 */
export function relayStorePathRefusal(result: OpenspecResult, json: boolean): number | undefined {
  if (result.exitCode === 0 || !isUpstreamStorePathRefusal(result)) return undefined
  const refusal = storePathRefusal(json)
  process[refusal.stream].write(refusal.text)
  return EXIT.failure
}
