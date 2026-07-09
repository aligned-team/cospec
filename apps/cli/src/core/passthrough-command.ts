// Shared plumbing for disciplined-passthrough commands (`show`, `context`,
// `workset`, `schemas`, `schema`, `templates`, …). Every such command resolves
// the operating root, threads the same three global flags onto the wrapped
// call (`--store` via `root.storeArgs`, `--json`, `--no-color`), relays
// stdout/stderr verbatim, and maps the wrapped exit code onto cospec's own
// `EXIT` contract. Centralized here so no passthrough command re-derives this
// wiring (WI-1); command-specific argv (item names, `--type`, …) is the
// caller's job — this helper only owns the global-flag threading + relay.

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { passthroughOpenspec, type OpenspecResult, type RunExpectation } from './openspec.ts'
import { resolveRoot } from './root.ts'

export interface PassthroughCommandOptions {
  /** The openspec subcommand + its own args (e.g. `['show', 'foo']`). Global
   * flags (`--json`, `--no-color`, `--store`) are threaded on top — do not
   * include them here. */
  args: string[]
  /** Declared expectations for the wrapped call; see `PassthroughOptions`. */
  expect?: RunExpectation
}

export interface PassthroughCommandResult {
  result: OpenspecResult
  code: number
}

/**
 * Resolve the operating root, thread `--json`/`--no-color`/`--store` onto
 * `opts.args`, and run it through `passthroughOpenspec`. Returns both the raw
 * `OpenspecResult` (for a caller that wants to inspect/reshape stdout before
 * printing) and the mapped exit code. Never prints anything itself — callers
 * that just want the default "relay verbatim" behavior should call
 * `runPassthrough` instead.
 */
export async function callPassthrough(
  ctx: CommandContext,
  opts: PassthroughCommandOptions,
): Promise<PassthroughCommandResult> {
  const root = await resolveRoot(ctx)
  const args = [...opts.args]
  if (ctx.flags.json) args.push('--json')
  if (ctx.flags.noColor) args.push('--no-color')
  const result = await passthroughOpenspec(args, {
    cwd: root.cwd,
    storeArgs: root.storeArgs,
    expect: opts.expect,
  })
  return { result, code: result.exitCode === 0 ? EXIT.success : EXIT.failure }
}

/**
 * The common case: run the passthrough call and relay its stdout/stderr
 * verbatim, returning the mapped exit code. A passthrough command has no
 * blocked/soft-blocked state of its own — every non-zero wrapped exit maps to
 * `EXIT.failure`.
 */
export async function runPassthrough(
  ctx: CommandContext,
  opts: PassthroughCommandOptions,
): Promise<number> {
  const { result, code } = await callPassthrough(ctx, opts)
  if (result.stdout.length > 0) process.stdout.write(result.stdout)
  if (result.stderr.length > 0) process.stderr.write(result.stderr)
  return code
}
