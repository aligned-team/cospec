// Shared plumbing for disciplined-passthrough commands (`show`, `context`,
// `workset`, `schemas`, `schema`, `templates`, …). Every such command resolves
// the operating root, threads the same three global flags onto the wrapped
// call (`--store` via `root.storeArgs`, `--json`, `--no-color`) right after
// its command path, ahead of the user's argv (`threadedArgv`), relays
// stdout/stderr verbatim, and maps the wrapped exit code onto cospec's own
// `EXIT` contract. Centralized here so no passthrough command re-derives this
// wiring (WI-1); command-specific argv (item names, `--type`, …) is the
// caller's job — this helper only owns the global-flag threading + relay.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { forwardCall, relayStorePathRefusal } from './forward-relay.ts'
import { passthroughOpenspec, type OpenspecResult, type RunExpectation } from './openspec.ts'
import { resolveRoot } from './root.ts'

export interface PassthroughCommandOptions {
  /** The wrapped command path (`['show']`, `['schema', 'init']`). */
  command: string[]
  /** The user's own argv after the command path (`['foo']`). The global flags
   * (`--json`, `--no-color`, `--store`) are threaded between the two — do not
   * include them here. */
  args?: string[]
  /** Declared expectations for the wrapped call; see `PassthroughOptions`. */
  expect?: RunExpectation
}

export interface PassthroughCommandResult {
  result: OpenspecResult
  code: number
}

/**
 * Resolve the operating root, thread `--json`/`--no-color`/`--store` between
 * `opts.command` and `opts.args`, and run it through `passthroughOpenspec`.
 * Returns both the raw `OpenspecResult` (for a caller that wants to
 * inspect/reshape stdout before printing) and the mapped exit code; the
 * binary's own parse rejection comes
 * back as a result, not a thrown wrapped-call error. Never prints anything
 * itself — callers that just want the default "relay verbatim" behavior should
 * call `runPassthrough` instead.
 */
export async function callPassthrough(
  ctx: CommandContext,
  opts: PassthroughCommandOptions,
): Promise<PassthroughCommandResult> {
  const root = await resolveRoot(ctx)
  const threaded = [
    ...(ctx.flags.json ? ['--json'] : []),
    ...(ctx.flags.noColor ? ['--no-color'] : []),
    ...root.storeArgs,
  ]
  const result = await forwardCall(() =>
    passthroughOpenspec(
      { command: opts.command, threaded, args: opts.args },
      { cwd: root.cwd, expect: opts.expect },
    ),
  )
  return { result, code: result.exitCode === 0 ? EXIT.success : EXIT.failure }
}

/**
 * The common case: run the passthrough call and relay its stdout/stderr
 * verbatim, returning the mapped exit code — except the binary's own
 * `--store-path` refusal, answered with cospec's respelled redirect. A
 * passthrough command has no blocked/soft-blocked state of its own — every
 * non-zero wrapped exit maps to `EXIT.failure`.
 */
export async function runPassthrough(
  ctx: CommandContext,
  opts: PassthroughCommandOptions,
): Promise<number> {
  const { result, code } = await callPassthrough(ctx, opts)
  const refused = relayStorePathRefusal(result, ctx.flags.json)
  if (refused !== undefined) return refused
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return code
}
