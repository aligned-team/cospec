// The binary's own parse rejection, told apart from a command's output. Shared
// by the forward relay and by the dispatcher's completion-tip decision.

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
export function isParseRejection(result: {
  readonly stdout: string
  readonly stderr: string
}): boolean {
  return (
    result.stdout.trim().length === 0 &&
    (COMMANDER_REFUSAL.test(result.stderr.trim()) ||
      /--store-path is not supported\./.test(result.stderr))
  )
}

/**
 * The same refusals in cospec's own spelling: the table parser's message for a
 * forward row it pre-validates before a terminal handover (`workset open`,
 * `config edit`/`profile`), where the binary is never asked. Each shape is
 * `unknownOption`/`pendingRefusal`/the required, missing-value and too-many
 * checks in `core/command-table.ts`; `parse-rejection.test.ts` generates each
 * from the parser and fails if one stops matching.
 */
const TABLE_REFUSAL = new RegExp(
  `^cospec(?: [^:\\n]+)?: (?:${[
    "unknown option '",
    "'.+' is not supported yet",
    "missing required argument '",
    "option '.+' argument missing",
    'too many arguments\\.',
  ].join('|')})`,
)

/**
 * True when a forward row's relayed answer was a parse refusal, in the binary's
 * spelling or cospec's: nothing on stdout and a refusal on stderr.
 */
export function isRelayedParseRefusal(run: {
  readonly stdout: string
  readonly stderr: string
}): boolean {
  return (
    isParseRejection(run) ||
    (run.stdout.trim().length === 0 && TABLE_REFUSAL.test(run.stderr.trim()))
  )
}
