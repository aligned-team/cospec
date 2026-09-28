// Shared plumbing for disciplined-passthrough commands (`show`, `context`,
// `workset`, `schemas`, `schema`, `templates`, …). Every such command resolves
// the operating root, threads the same three global flags onto the wrapped
// call (`--store` via `root.storeArgs`, `--json`, `--no-color`) right after
// its command path, ahead of the user's argv (`threadedArgv`) — or, for a
// subcommand that rejects `--store`, spawns in the root itself — relays
// stdout/stderr verbatim, and maps the wrapped exit code onto cospec's own
// `EXIT` contract. Centralized here so no passthrough command re-derives this
// wiring (WI-1); command-specific argv (item names, `--type`, …) is the
// caller's job — this helper only owns the global-flag threading + relay.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { EXIT } from '../cli.ts'
import { isUpstreamStorePathRefusal } from './command-table.ts'
import { forwardCall, isParseRejection, relayStorePathRefusal } from './forward-relay.ts'
import {
  passthroughOpenspec,
  runOpenspec,
  threadedArgv,
  type OpenspecResult,
  type RunExpectation,
} from './openspec.ts'
import { resolveRoot, RootSelectionError, type ResolvedRoot } from './root.ts'

export interface PassthroughCommandOptions {
  /** The wrapped command path (`['show']`, `['schema', 'init']`). */
  command: string[]
  /** The user's own argv after the command path (`['foo']`). The global flags
   * (`--json`, `--no-color`, `--store`) are threaded between the two — do not
   * include them here. */
  args?: string[]
  /** Declared expectations for the wrapped call; see `PassthroughOptions`. */
  expect?: RunExpectation
  /**
   * Spawn with `root.base` as the working directory and never thread
   * `--store`, for wrapped subcommands that reject `--store` (`templates`,
   * every `schema` subcommand). The binary then sees the root as its own
   * nearest root, which also reaches an enclosing root from a subdirectory —
   * a deliberate superset of the binary, which reads its own cwd there.
   */
  spawnInRoot?: boolean
  /** Upstream renders this command's failures as text under `--json`; see `PassthroughOptions.textFailure`. */
  textFailure?: boolean
}

export interface PassthroughCommandResult {
  result: OpenspecResult
  code: number
}

/**
 * Resolve the operating root, thread `--json`/`--no-color`/`--store` between
 * `opts.command` and `opts.args` (no `--store` under `spawnInRoot`), and run it
 * through `passthroughOpenspec`. Returns both the raw `OpenspecResult` (for a
 * caller that wants to inspect/reshape stdout before printing) and the mapped
 * exit code; the binary's own parse rejection comes back as a result, not a
 * thrown wrapped-call error. Never prints anything itself — callers that just
 * want the default "relay verbatim" behavior should call `runPassthrough`
 * instead.
 */
export async function callPassthrough(
  ctx: CommandContext,
  opts: PassthroughCommandOptions,
): Promise<PassthroughCommandResult> {
  const flags = [
    ...(ctx.flags.json ? ['--json'] : []),
    ...(ctx.flags.noColor ? ['--no-color'] : []),
  ]
  let root: ResolvedRoot
  try {
    root = await resolveRoot(ctx)
  } catch (error) {
    // A forward row's argv (no table parse) is the binary's to refuse first.
    const refusal =
      error instanceof RootSelectionError && ctx.parsed === undefined
        ? await binaryParseRefusal(opts, flags)
        : undefined
    if (refusal === undefined) throw error
    return { result: refusal, code: EXIT.failure }
  }
  const inRoot = opts.spawnInRoot === true
  const threaded = [...flags, ...(inRoot ? [] : root.storeArgs)]
  const result = await forwardCall(() =>
    passthroughOpenspec(
      { command: opts.command, threaded, args: opts.args },
      {
        cwd: inRoot ? root.base : root.cwd,
        expect: opts.expect,
        textFailure: opts.textFailure === true,
      },
    ),
  )
  return { result, code: result.exitCode === 0 ? EXIT.success : EXIT.failure }
}

/**
 * The binary's own refusal of a forward row's argv, or undefined when the argv
 * parses. Upstream parses before its action selects a root, so its refusal (an
 * unknown option, a missing value, too many arguments, the `--store-path`
 * redirect) outranks any root-selection failure. It is asked in a fresh
 * scratch directory, never the user's — an argv that parses runs there, and
 * `schema init`/`fork` write — with cospec's threaded flags but no `--store`
 * (the selection is what failed; `templates` and `schema` declare none).
 * Whatever that run answers besides a refusal is discarded: the caller
 * reports its own root-selection failure.
 */
async function binaryParseRefusal(
  opts: PassthroughCommandOptions,
  threaded: readonly string[],
): Promise<OpenspecResult | undefined> {
  const scratch = mkdtempSync(join(tmpdir(), 'cospec-parse-'))
  try {
    const result = await runOpenspec(threadedArgv(opts.command, threaded, opts.args), {
      cwd: scratch,
      expect: { exitCodes: [0, 1] },
    })
    const refused =
      result.exitCode !== 0 && (isParseRejection(result) || isUpstreamStorePathRefusal(result))
    return refused ? result : undefined
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
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

// --- Structural respell of relayed JSON --------------------------------------

/**
 * A string field of a relayed `--json` document that holds a command for the
 * user to run: its path of keys, `'[]'` stepping into every element of an
 * array (`['references', '[]', 'fetch']`), and the fixed text upstream prints
 * ahead of the command in that field, if any (`Run: ` in a reference's `fix`).
 */
export interface CommandField {
  readonly path: readonly string[]
  readonly lead?: string
}

const OPENSPEC_COMMAND = 'openspec '
const COSPEC_COMMAND = 'cospec '

/**
 * `doc` with each field `fields` names that starts with its `lead` and then
 * `openspec ` spelled `cospec ` — that one token in command position and
 * nothing else, so the ids, paths and names after it (a store called
 * `openspec-team`) and every field `fields` does not name pass through
 * byte-for-byte. The rule reads the document's structure, never its rendered
 * text, so nothing a user owns can stand in for a command. Returns a new
 * document; `doc` is left as it was. A relay renders its text, human or
 * `--json` (`renderJsonDocument`), from the result.
 */
export function respellCommandFields<T>(doc: T, fields: readonly CommandField[]): T {
  const out = structuredClone(doc)
  for (const field of fields) respellAt(out, field.path, field.lead ?? '')
  return out
}

function respellAt(node: unknown, path: readonly string[], lead: string): void {
  const [key, ...rest] = path
  if (key === undefined || node === null || typeof node !== 'object') return
  if (key === '[]') {
    if (Array.isArray(node)) for (const item of node) respellAt(item, rest, lead)
    return
  }
  if (Array.isArray(node) || !Object.hasOwn(node, key)) return
  const record = node as Record<string, unknown>
  const value = record[key]
  if (rest.length > 0) return respellAt(value, rest, lead)
  const command = lead + OPENSPEC_COMMAND
  if (typeof value === 'string' && value.startsWith(command))
    record[key] = lead + COSPEC_COMMAND + value.slice(command.length)
}

/** A document rendered as the binary renders its own: two-space JSON and a newline. */
export function renderJsonDocument(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
