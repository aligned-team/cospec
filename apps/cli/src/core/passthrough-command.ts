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
import { respellWhole, respellWholeRemedy } from './remedies.ts'
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
   * a deliberate superset of the binary, which reads its own cwd there. A
   * selection that fails with no explicit `--store` spawns in the invocation
   * directory instead, as the binary always does (`isCwdFallback`). Root
   * selection prints none of its own lines for these (`quiet`), as the binary
   * never runs root selection for them.
   */
  spawnInRoot?: boolean
  /** Upstream renders this command's failures as text under `--json`; see `PassthroughOptions.textFailure`. */
  textFailure?: boolean
  /**
   * Thread `--json` onto the wrapped call whatever the invocation's own mode,
   * for a command that builds its human answer from the binary's document
   * (`instructions`). Root selection still answers in the invocation's mode
   * (its human-mode banner included), once.
   */
  wrappedJson?: boolean
}

export interface PassthroughCommandResult {
  result: OpenspecResult
  code: number
  /** The selected root; undefined when the call ran in the invocation directory. */
  root?: ResolvedRoot
  /**
   * The same wrapped call again, in the same directory with the same flags,
   * `--json` threaded or not — without selecting the root again (so nothing
   * root selection prints is printed twice). A binary parse refusal answered
   * before any spawn is its own answer either way.
   */
  rerun: (opts: { json: boolean }) => Promise<OpenspecResult>
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
  const json = ctx.flags.json || opts.wrappedJson === true
  const color = ctx.flags.noColor ? ['--no-color'] : []
  const flags = [...(json ? ['--json'] : []), ...color]
  const inRoot = opts.spawnInRoot === true
  let root: ResolvedRoot | undefined
  try {
    // The binary's `templates`/`schema` never select a root, so they print no resolver line.
    root = await resolveRoot(ctx, { quiet: inRoot })
  } catch (error) {
    if (!(inRoot && ctx.flags.store === undefined && isCwdFallback(error))) {
      // A forward row's argv (no table parse) is the binary's to refuse first.
      const refusal =
        error instanceof RootSelectionError && ctx.parsed === undefined
          ? await binaryParseRefusal(opts, flags)
          : undefined
      if (refusal === undefined) throw error
      return { result: refusal, code: EXIT.failure, rerun: async () => refusal }
    }
  }
  const store = inRoot || root === undefined ? [] : root.storeArgs
  const cwd = root === undefined ? ctx.cwd : inRoot ? root.base : root.cwd
  const spawn = (withJson: boolean) =>
    forwardCall(() =>
      passthroughOpenspec(
        {
          command: opts.command,
          threaded: [...(withJson ? ['--json'] : []), ...color, ...store],
          args: opts.args,
        },
        { cwd, expect: opts.expect, textFailure: opts.textFailure === true },
      ),
    )
  const result = await spawn(json)
  return {
    result,
    code: result.exitCode === 0 ? EXIT.success : EXIT.failure,
    ...(root === undefined ? {} : { root }),
    rerun: ({ json: withJson }) => spawn(withJson),
  }
}

/**
 * Whether a `spawnInRoot` call whose selection failed runs in the invocation
 * directory instead. Upstream's `templates` and `schema` actions never select
 * a root — they read the directory they run in — so with no explicit
 * `--store` a failed selection (no root with stores registered, a malformed or
 * dangling pointer, a stale or broken `defaultStore`, an unreadable registry)
 * answers there, as the binary does. An explicit `--store`, which the binary
 * never takes on these commands, keeps its failure, and so does a missing
 * `--cwd` (cospec's own; there is no directory to run in).
 */
function isCwdFallback(error: unknown): boolean {
  return error instanceof RootSelectionError && error.diagnostic.code !== 'directory_not_found'
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
 * array (`['references', '[]', 'fetch']`), and either the fixed text upstream
 * prints ahead of the command in that field, if any (`Run: ` in a reference's
 * `fix`), or the allowlist entries (`core/remedies.ts` ids) the field's whole
 * value can be — the stricter rule: the field is spelled only when its whole
 * value is one of them, holes filled, and `lead` is not read.
 */
export interface CommandField {
  readonly path: readonly string[]
  readonly lead?: string
  /**
   * How the field is spelled: `leading` (the default) rewrites the one
   * `openspec ` token after `lead`; `remedy` rewrites the field only when its
   * whole value is one allowlisted remedy (`respellWholeRemedy` in
   * `core/remedies.ts`, each hole re-emitted as captured), so a command
   * later in the value (`git clone … && openspec store register …`) is
   * spelled while a value with any text around the remedy stays as written.
   */
  readonly rule?: 'leading' | 'remedy'
  /**
   * The allowlist entries (`core/remedies.ts` ids) this field's whole value
   * can be — stricter than `rule: 'remedy'`: the field is spelled only when
   * its whole value is one of these named entries (`respellWhole`), holes
   * filled, and neither `lead` nor `rule` is read.
   */
  readonly remedies?: readonly string[]
}

const OPENSPEC_COMMAND = 'openspec '
const COSPEC_COMMAND = 'cospec '

/**
 * `doc` with each field `fields` names spelled through cospec: a field with
 * `remedies` only when its whole value is one of those named allowlist
 * entries (`respellWhole`, the entry's holes re-emitted unread); a
 * `remedy`-rule field only when its whole value is one allowlisted remedy,
 * any entry (`respellWholeRemedy`); any other field when it starts with its
 * `lead` and then `openspec `, that one token in command position and nothing
 * else. Either way the ids, paths and names in a field (a store called
 * `openspec-team`) and every field `fields` does not name pass through
 * byte-for-byte. The rule reads the document's structure, never its rendered
 * text, so nothing a user owns can stand in for a command. Returns a new
 * document; `doc` is left as it was. A relay renders its text, human or
 * `--json` (`renderJsonDocument`), from the result.
 */
export function respellCommandFields<T>(doc: T, fields: readonly CommandField[]): T {
  const out = structuredClone(doc)
  for (const field of fields) respellAt(out, field.path, spelling(field))
  return out
}

/** A field's rule: its named remedies, else the generic remedy rule, else its leading command. */
function spelling(field: CommandField): (value: string) => string {
  const { remedies } = field
  if (remedies !== undefined) return (value) => respellWhole(value, remedies)
  if (field.rule === 'remedy') return respellWholeRemedy
  const lead = field.lead ?? ''
  const command = lead + OPENSPEC_COMMAND
  return (value) =>
    value.startsWith(command) ? lead + COSPEC_COMMAND + value.slice(command.length) : value
}

function respellAt(node: unknown, path: readonly string[], spell: (value: string) => string): void {
  const [key, ...rest] = path
  if (key === undefined || node === null || typeof node !== 'object') return
  if (key === '[]') {
    if (Array.isArray(node)) for (const item of node) respellAt(item, rest, spell)
    return
  }
  if (Array.isArray(node) || !Object.hasOwn(node, key)) return
  const record = node as Record<string, unknown>
  const value = record[key]
  if (rest.length > 0) return respellAt(value, rest, spell)
  if (typeof value === 'string') record[key] = spell(value)
}

/** A document rendered as the binary renders its own: two-space JSON and a newline. */
export function renderJsonDocument(doc: unknown): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}
