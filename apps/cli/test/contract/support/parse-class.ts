// The parse classifier shared by the unknown-option differential and the
// precedence matrix (change `unknown-option-contract`, design decision 7).
//
//   parse-rejected  stderr carries an unknown-option, argument-missing,
//                   missing-required-argument, too-many-arguments or
//                   `--store-path` refusal (either
//                   dialect: commander's `error: …` or cospec's
//                   `cospec <command>: …`); upstream's `error: unknown command`
//                   for a cospec-native command; a `--store-path` JSON
//                   envelope; or, for a cospec row marked `json: 'refused'`,
//                   its one-document `{ok: false}` `--json` refusal
//   parsed          anything else, whatever the exit code
//
// `outcome()` refines that split for the precedence matrix, which must tell a
// version request, a help screen (and whose) and the KIND of a refusal apart
// from a command that ran (`refusalKind()`): lumping every refusal together let
// a `--store-path` ordering bug pass, because a redirect where the binary said
// `unknown option '--bogus'` still read as "both rejected".

import { COMMAND_TABLE } from '../../../src/core/command-table.ts'
import type { SpawnResult } from '../../fixtures/support.ts'

export type ParseClass = 'parse-rejected' | 'parsed'

/** Design decision 10: the `table` rows that refuse the global `--json`, read from the table. */
const JSON_REFUSED: ReadonlySet<string> = new Set(
  COMMAND_TABLE.filter((row) => row.parse === 'table' && row.json === 'refused').map(
    (row) => row.name,
  ),
)

export const REFUSAL_SHAPES: readonly RegExp[] = [
  /^error: unknown option '/m,
  /^error: option '.+' argument missing$/m,
  /^error: too many arguments/m,
  /^error: missing required argument '/m,
  /^error: unknown command '/m,
  /^cospec(?: [\w-]+(?: [\w-]+)?)?: unknown option '/m,
  /^cospec(?: [\w-]+(?: [\w-]+)?)?: option '.+' argument missing$/m,
  /^cospec [\w-]+(?: [\w-]+)?: too many arguments\./m,
  /^cospec [\w-]+(?: [\w-]+)?: missing required argument '/m,
  /--store-path is not supported\./,
]

function parseOneDocument(stdout: string): Record<string, unknown> | undefined {
  try {
    const doc = JSON.parse(stdout) as unknown
    return typeof doc === 'object' && doc !== null ? (doc as Record<string, unknown>) : undefined
  } catch (err) {
    if (err instanceof SyntaxError) return undefined
    throw err
  }
}

/**
 * How many JSON documents `stdout` carries: 0 for empty or non-JSON output (a
 * help screen, a listing, a refusal on stderr), else the count of
 * whitespace-separated top-level JSON values when that is all it holds.
 */
export function documentCount(stdout: string): number {
  const text = stdout.trim()
  if (text.length === 0) return 0
  if (parseOneDocument(text) !== undefined) return 1
  // A top-level value per `{…}`/`[…]` span, tracked by depth outside strings.
  let count = 0
  let depth = 0
  let start = -1
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inString) {
      if (ch === '\\') i++
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '{' || ch === '[') {
      if (depth++ === 0) start = i
    } else if (depth === 0) {
      if (!/\s/.test(ch)) return 0
    } else if (ch === '"') inString = true
    else if (ch === '}' || ch === ']') {
      if (--depth === 0) {
        if (parseOneDocument(text.slice(start, i + 1)) === undefined) return 0
        count++
      }
    }
  }
  return depth === 0 ? count : 0
}

export function classify(run: SpawnResult, command: string, argv: readonly string[]): ParseClass {
  if (REFUSAL_SHAPES.some((shape) => shape.test(run.stderr))) return 'parse-rejected'
  if (argv.includes('--json')) {
    const doc = parseOneDocument(run.stdout)
    const status = doc?.['status']
    if (
      Array.isArray(status) &&
      (status[0] as { code?: unknown })?.code === 'store_path_not_supported'
    )
      return 'parse-rejected'
    if (JSON_REFUSED.has(command) && doc?.['ok'] === false && doc['command'] === command)
      return 'parse-rejected'
  }
  return 'parsed'
}

/**
 * What a refusal was about, in either dialect:
 *
 *   store-path          any refusal whose subject is `--store-path`: the redirect
 *                       (text or `--json` envelope), or commander's
 *                       `unknown option '--store-path'` / `argument missing` for
 *                       it. Design decision 2 answers the redirect wherever the
 *                       binary refuses `--store-path` at all, so the matrix
 *                       compares where the refusal lands, not its dialect.
 *   unknown-command     an unknown command name
 *   unknown-subcommand  an unknown token where a known command wanted its
 *                       subcommand (commander words both `unknown command`)
 *   unknown-option      an undeclared option, or a `json: 'refused'` row's
 *                       one-document `--json` refusal (design decision 10)
 *   missing-value       a value-taking option given no value
 *   missing-argument    a required positional given nothing (commander's
 *                       `missing required argument`)
 *   too-many            an excess positional
 */
export type RefusalKind =
  | 'store-path'
  | 'unknown-command'
  | 'unknown-subcommand'
  | 'unknown-option'
  | 'missing-value'
  | 'missing-argument'
  | 'too-many'

const STORE_PATH_SUBJECT: readonly RegExp[] = [
  /--store-path is not supported\./,
  /^(?:error|cospec(?: [\w-]+){0,2}): unknown option '--store-path(?:=[^']*)?'$/m,
  /^(?:error|cospec(?: [\w-]+){0,2}): option '--store-path .+' argument missing$/m,
]

/**
 * Commander's `error: unknown command`, upstream store/workset's own
 * `Error: unknown command 'help' for …`, and cospec's dispatcher and module
 * refusals of an unknown command or subcommand; group 1 or 2 is the token.
 */
const UNKNOWN_COMMAND =
  /^(?:error|cospec(?: [\w-]+)?): unknown (?:sub)?command '([^']*)'|^cospec: unknown '[\w-]+' subcommand '([^']*)'/im

/**
 * The kind of refusal `run` printed, or undefined when it printed none.
 * `command` is the row the argv lands on: an unknown token that follows it in
 * `argv` is an unknown subcommand, anything else an unknown command.
 */
export function refusalKind(
  run: SpawnResult,
  command: string,
  argv: readonly string[],
): RefusalKind | undefined {
  const doc = argv.includes('--json') ? parseOneDocument(run.stdout) : undefined
  const status = doc?.['status']
  if (
    STORE_PATH_SUBJECT.some((shape) => shape.test(run.stderr)) ||
    (Array.isArray(status) &&
      (status[0] as { code?: unknown })?.code === 'store_path_not_supported')
  )
    return 'store-path'
  const unknown = UNKNOWN_COMMAND.exec(run.stderr)
  if (unknown !== null) {
    const token = unknown[1] ?? unknown[2] ?? ''
    const at = argv.indexOf(command)
    return token !== command && at !== -1 && argv.indexOf(token, at + 1) !== -1
      ? 'unknown-subcommand'
      : 'unknown-command'
  }
  if (/^(?:error|cospec(?: [\w-]+){0,2}): unknown option '/m.test(run.stderr))
    return 'unknown-option'
  if (JSON_REFUSED.has(command) && doc?.['ok'] === false && doc['command'] === command)
    return 'unknown-option'
  if (/^(?:error|cospec(?: [\w-]+){0,2}): option '.+' argument missing$/m.test(run.stderr))
    return 'missing-value'
  if (/^(?:error|cospec(?: [\w-]+){0,2}): missing required argument '/m.test(run.stderr))
    return 'missing-argument'
  if (/^(?:error|cospec(?: [\w-]+){0,2}): too many arguments/m.test(run.stderr)) return 'too-many'
  return undefined
}

/**
 * `version`, `help:<command path>` (`help:root` for the program's own help),
 * a `RefusalKind`, or `parsed` for anything else, whatever the exit code.
 */
export type Outcome = 'version' | `help:${string}` | RefusalKind | 'parsed'

export function outcome(run: SpawnResult, command: string, argv: readonly string[]): Outcome {
  if (run.exitCode === 0 && /^\d+\.\d+\.\d+\n$/.test(run.stdout)) return 'version'
  // `Usage: openspec config path [options]` / `Usage: cospec config path [options]`:
  // the words between the tool name and the first `[…]`/`<…>` are the help's path.
  const usage = /^Usage: (?:openspec|cospec)((?: [^\s<[]+)*)/m.exec(run.stdout)
  // Commander shows a subcommand's aliases in its path (`workset list|ls`).
  const path = usage?.[1]!.replace(/\|\S+/g, '').trim()
  if (run.exitCode === 0 && usage !== null) return `help:${path || 'root'}`
  return refusalKind(run, command, argv) ?? 'parsed'
}
