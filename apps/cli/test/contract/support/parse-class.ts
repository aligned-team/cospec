// The parse classifier shared by the unknown-option differential and the
// precedence matrix (change `unknown-option-contract`, design decision 7).
//
//   parse-rejected  stderr carries an unknown-option, argument-missing,
//                   too-many-arguments or `--store-path` refusal (either
//                   dialect: commander's `error: …` or cospec's
//                   `cospec <command>: …`); upstream's `error: unknown command`
//                   for a cospec-native command; a `--store-path` JSON
//                   envelope; or, for a cospec row marked `json: 'refused'`,
//                   its one-document `{ok: false}` `--json` refusal
//   parsed          anything else, whatever the exit code
//
// `outcome()` refines that split for the precedence matrix, which must tell a
// version request, a help screen (and whose) and an unknown command apart from
// a command that ran.

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
  /^error: unknown command '/m,
  /^cospec(?: [\w-]+(?: [\w-]+)?)?: unknown option '/m,
  /^cospec(?: [\w-]+(?: [\w-]+)?)?: option '.+' argument missing$/m,
  /^cospec [\w-]+(?: [\w-]+)?: too many arguments\./m,
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
 * `version`, `help:<command path>` (`help:root` for the program's own help),
 * `unknown-command`, or else the `classify()` split.
 */
export type Outcome = 'version' | `help:${string}` | 'unknown-command' | ParseClass

/**
 * Commander's `error: unknown command`, upstream store/workset's own
 * `Error: unknown command 'help' for …`, and cospec's dispatcher and module
 * refusals of an unknown command or subcommand.
 */
const UNKNOWN_COMMAND =
  /^(?:error|cospec(?: [\w-]+)?): unknown (?:sub)?command '|^cospec: unknown '[\w-]+' subcommand '/im

export function outcome(run: SpawnResult, command: string, argv: readonly string[]): Outcome {
  if (run.exitCode === 0 && /^\d+\.\d+\.\d+\n$/.test(run.stdout)) return 'version'
  // `Usage: openspec config path [options]` / `Usage: cospec config path [options]`:
  // the words between the tool name and the first `[…]`/`<…>` are the help's path.
  const usage = /^Usage: (?:openspec|cospec)((?: [^\s<[]+)*)/m.exec(run.stdout)
  if (run.exitCode === 0 && usage !== null) return `help:${usage[1]!.trim() || 'root'}`
  if (UNKNOWN_COMMAND.test(run.stderr)) return 'unknown-command'
  return classify(run, command, argv)
}
