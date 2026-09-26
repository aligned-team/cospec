// The global-flag precedence matrix (change `unknown-option-contract`, ledger
// 1.16): which answer wins when one argv carries several program-level and
// command-level outcomes at once — a version request, help, an unknown option,
// a missing or empty value, `--store-path`, a `--` terminator, a bare `help`
// token.
//
// Upstream's commander never ranks across levels. The program level parses the
// whole argv for its own options, and stops on its own outcome (version, help,
// an unknown option, an unknown command); only when it dispatches does the
// subcommand parse its argv, in commander's per-level order: a missing value
// while it parses, then help, then the first unknown option, then too many
// arguments, then the action. Each row runs the same argv through cospec and
// the pinned binary and compares the outcome (`support/parse-class.ts`
// `outcome()`: version, help and whose, the refusal's kind — store-path,
// unknown command or subcommand, unknown option, missing value, too many
// arguments — or parsed) and the exit code. Comparing the kind, not just
// "refused", is what catches an ordering bug: a `--store-path` redirect where
// the binary refuses `--bogus` first is two different answers. The expected
// answer is the binary's, read at test time, never a typed copy.
//
// Both tools receive argv verbatim, a leading `--` included: the binary runs
// under Node (`oracle(…, { runtime: 'node' })`), and cospec runs as
// `bun <entry> -- …argv`, whose first `--` Bun consumes (asserted below).
//
// A `cospec-only` row exercises a cospec global upstream does not have at that
// level (`--cwd` anywhere, `--store`/`--json` before the command, cospec's
// `help` alias on a table row) or a deliberate cospec divergence (no command
// prints help and exits 0); it states the intended outcome instead of
// consulting the binary.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
import { type Outcome, outcome } from './support/parse-class.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

function freshRoot(): string {
  const dir = mkTempRepo()
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  return dir
}

/** cospec with `argv` delivered verbatim (Bun eats the `--` after the entry path). */
function runCospec(argv: readonly string[], root: string): Promise<SpawnResult> {
  return cospec(['--', ...argv], { cwd: root, env: oracleEnv(root) })
}

function runUpstream(argv: readonly string[], root: string): Promise<SpawnResult> {
  return oracle([...argv], root, { runtime: 'node' })
}

interface Row {
  argv: readonly string[]
  /** The command row the argv lands on, for the `--json` refusal classes. */
  command: string
  /** Text cospec's stderr must contain, beyond the outcome check. */
  cospecStderr?: string
  /** A cospec-only row's intended answer; `same` rows compare against the binary. */
  cospecOnly?: { outcome: Outcome; exit: number }
}

const REDIRECT = '--store-path is not supported. Register the path with cospec store register'
const unknownOption = (option: string): string => `cospec: unknown option '${option}'\n`

// Targets: `list` is a table row, `show` a forward row, `config`/`schema`/
// `store`/`workset` forward rows with subcommands, `new`/`completion` table
// rows with subcommands; a row with no command name exercises the program alone.

const VERSION_ROWS: readonly Row[] = [
  { argv: ['--version'], command: 'list' },
  { argv: ['-V', 'list'], command: 'list' },
  { argv: ['list', '--version'], command: 'list' },
  { argv: ['show', 'foo', '-V'], command: 'show' },
  { argv: ['config', 'path', '--version'], command: 'config' },
  { argv: ['--bogus', 'list', '--version'], command: 'list' },
  { argv: ['--store-path', '/x', '-V'], command: 'list' },
  // The program level sees `--version` before `list` can take it as a value.
  { argv: ['list', '--store', '--version'], command: 'list' },
  { argv: ['bogus', '--version'], command: 'bogus' },
  { argv: ['-V', '--', 'list'], command: 'list' },
  // After `--` it is an operand.
  { argv: ['list', '--', '--version'], command: 'list' },
  { argv: ['--', '--version'], command: 'list' },
]

const HELP_ROWS: readonly Row[] = [
  { argv: ['--help'], command: 'list' },
  // Help before the command name is the program's own help, whatever follows.
  { argv: ['--help', 'list'], command: 'list' },
  { argv: ['-h', 'show', 'foo'], command: 'show' },
  { argv: ['--help', 'config'], command: 'config' },
  { argv: ['--help', 'list', '--store'], command: 'list' },
  { argv: ['--help', '--store'], command: 'list' },
  { argv: ['-h', '--', 'list'], command: 'list' },
  { argv: ['--bogus', '--help', 'list'], command: 'list' },
  { argv: ['--bogus', 'list', '--help'], command: 'list' },
  { argv: ['--bogus', '--', '--help'], command: 'list' },
  { argv: ['--store-path', '/x', 'list', '--help'], command: 'list' },
  // An unknown command is never dispatched, so the program still answers help.
  { argv: ['bogus', '--help'], command: 'bogus' },
  // After the command name, the command's own help.
  { argv: ['list', '--help'], command: 'list' },
  { argv: ['show', '--help'], command: 'show' },
  { argv: ['config', '--help'], command: 'config' },
  { argv: ['config', 'path', '--help'], command: 'config' },
  // A missing value is raised while the command parses, before help.
  { argv: ['list', '--help', '--store'], command: 'list' },
  { argv: ['status', '--help', '--change'], command: 'status' },
  // Help outranks the command's unknown option and excess operand.
  { argv: ['list', '--bogus', '--help'], command: 'list' },
  { argv: ['list', 'a', '--help'], command: 'list' },
  { argv: ['--', 'list', '--help'], command: 'list' },
]

const UNKNOWN_OPTION_ROWS: readonly Row[] = [
  { argv: ['--bogus'], command: 'list', cospecStderr: unknownOption('--bogus') },
  { argv: ['--bogus', 'list'], command: 'list', cospecStderr: unknownOption('--bogus') },
  { argv: ['--bogus', 'show', 'foo'], command: 'show', cospecStderr: unknownOption('--bogus') },
  {
    argv: ['--bogus', 'config', 'path'],
    command: 'config',
    cospecStderr: unknownOption('--bogus'),
  },
  { argv: ['--bogus', 'list', '--store'], command: 'list', cospecStderr: unknownOption('--bogus') },
  { argv: ['--bogus', '--store'], command: 'list', cospecStderr: unknownOption('--bogus') },
  { argv: ['--bogus', '--', 'list'], command: 'list', cospecStderr: unknownOption('--bogus') },
  { argv: ['list', '--bogus'], command: 'list' },
  { argv: ['show', 'foo', '--bogus'], command: 'show' },
  { argv: ['config', 'path', '--bogus'], command: 'config' },
  // The first program-level unknown option wins; `--store-path` answers with its redirect.
  { argv: ['--store-path', '/x', '--bogus', 'list'], command: 'list', cospecStderr: REDIRECT },
  {
    argv: ['--bogus', '--store-path', '/x', 'list'],
    command: 'list',
    cospecStderr: unknownOption('--bogus'),
  },
  // An unknown command outranks everything after it but version and help.
  { argv: ['bogus', '--store'], command: 'bogus' },
  { argv: ['bogus', '--bogus'], command: 'bogus' },
]

const VALUE_ROWS: readonly Row[] = [
  { argv: ['list', '--store'], command: 'list' },
  { argv: ['show', 'foo', '--store'], command: 'show' },
  // An empty store id is refused after parsing, in both tools.
  { argv: ['list', '--store='], command: 'list' },
  { argv: ['show', 'foo', '--store='], command: 'show' },
  { argv: ['list', '--bogus', '--store='], command: 'list' },
  { argv: ['list', '--store=', '--help'], command: 'list' },
  // Too many arguments comes before the action's `--store-path` redirect.
  { argv: ['list', 'a', '--store-path', '/x'], command: 'list' },
  { argv: ['list', '--bogus', '--store-path', '/x'], command: 'list' },
  { argv: ['list', '--store-path', '/x', '--store'], command: 'list' },
]

const STORE_PATH_ROWS: readonly Row[] = [
  { argv: ['--store-path', '/x', 'list'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['--store-path=/x', 'list'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['--store-path'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--store-path', '/x'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--store-path=/x'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--store-path'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['show', 'foo', '--store-path', '/x'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['config', 'path', '--store-path', '/x'], command: 'config', cospecStderr: REDIRECT },
  // The program level stops on the redirect; the subcommand's missing value never parses.
  { argv: ['--store-path', '/x', 'list', '--store'], command: 'list', cospecStderr: REDIRECT },
  // A command that declares `--store-path` refuses it in its action, so an
  // unknown option or an excess operand after it answers first.
  { argv: ['list', '--store-path', '/x', '--bogus'], command: 'list' },
  { argv: ['list', '--store-path', '/x', 'extra'], command: 'list' },
  { argv: ['validate', '--store-path', '/x', '--bogus'], command: 'validate' },
  { argv: ['validate', '--store-path', '/x', 'a', 'b'], command: 'validate' },
  // On a forward row the binary is the ordering authority.
  { argv: ['show', '--store-path', '/x', '--bogus'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['show', 'foo', '--store-path', '/x', '--bogus'], command: 'show' },
  { argv: ['show', '--store-path', '/x', 'a', 'b'], command: 'show' },
  // `config` declares no `--store-path`: the first unknown option wins.
  { argv: ['config', 'path', '--bogus', '--store-path', '/x'], command: 'config' },
  // After a leading `--` it is config's unknown subcommand, not an option.
  { argv: ['--', 'config', '--store-path', '/x'], command: 'config' },
]

const TERMINATOR_ROWS: readonly Row[] = [
  { argv: ['--', 'list'], command: 'list' },
  { argv: ['--', 'list', 'extra'], command: 'list' },
  { argv: ['--', 'list', 'help'], command: 'list' },
  { argv: ['--', 'show', 'foo'], command: 'show' },
  { argv: ['--', 'schemas', '--json'], command: 'schemas' },
  { argv: ['--', 'store', 'list', '--json'], command: 'store' },
  // The token after the command is still dispatched as its subcommand,
  // commander's implicit `help` included.
  { argv: ['--', 'config', 'help'], command: 'config' },
  { argv: ['--', 'config', 'help', 'path'], command: 'config' },
  { argv: ['--', 'schema', 'help'], command: 'schema' },
  { argv: ['--', 'new', 'help'], command: 'new' },
  { argv: ['--', 'completion', 'help'], command: 'completion' },
  { argv: ['--', 'store', 'help'], command: 'store' },
  { argv: ['--', 'workset', 'help'], command: 'workset' },
  { argv: ['--', 'config', '--help'], command: 'config' },
  { argv: ['list', '--', '--json'], command: 'list' },
  { argv: ['show', 'foo', '--', '--json'], command: 'show' },
  { argv: ['config', 'path', '--', '--json'], command: 'config' },
  // A `--` that is the first token reaching the row: the next token is still
  // the subcommand, and a bare `config --` is config's usage.
  { argv: ['config', '--', 'path'], command: 'config' },
  { argv: ['store', '--', 'list'], command: 'store' },
  { argv: ['workset', '--', 'list'], command: 'workset' },
  { argv: ['config', '--', 'help'], command: 'config' },
  { argv: ['config', '--'], command: 'config' },
]

const HELP_TOKEN_ROWS: readonly Row[] = [
  // Commander's implicit `help` subcommand on a command with subcommands.
  { argv: ['config', 'help'], command: 'config' },
  { argv: ['config', 'help', 'path'], command: 'config' },
  { argv: ['schema', 'help'], command: 'schema' },
  { argv: ['new', 'help'], command: 'new' },
  { argv: ['completion', 'help'], command: 'completion' },
  // Still the help token after an absorbed global flag.
  { argv: ['config', '--no-color', 'help'], command: 'config' },
  { argv: ['schema', '--no-color', 'help'], command: 'schema' },
  { argv: ['completion', '--no-color', 'help'], command: 'completion' },
  // Upstream's store and workset refuse `help` as an unknown subcommand.
  { argv: ['store', 'help'], command: 'store' },
  { argv: ['workset', 'help'], command: 'workset' },
  // A forward row without subcommands hands `help` to the binary as an operand.
  { argv: ['show', 'help'], command: 'show' },
  { argv: ['schemas', 'help'], command: 'schemas' },
]

/** cospec globals and divergences upstream has no counterpart for at that level. */
const COSPEC_ONLY_ROWS: readonly Row[] = [
  {
    argv: ['--store'],
    command: 'list',
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    cospecStderr: "cospec: option '--store <id>' argument missing\n",
  },
  {
    argv: ['--store='],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec: option '--store <id>' argument must not be empty\n",
  },
  {
    argv: ['--store=', 'list'],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec list: option '--store <id>' argument must not be empty\n",
  },
  // `--store` takes the next token whatever it is, so no command is left.
  { argv: ['--store', 'list'], command: 'list', cospecOnly: { outcome: 'help:root', exit: 0 } },
  {
    argv: ['--cwd'],
    command: 'list',
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    cospecStderr: "cospec: option '--cwd <path>' argument missing\n",
  },
  {
    argv: ['--cwd=', 'list'],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec list: option '--cwd <path>' argument must not be empty\n",
  },
  {
    argv: ['list', '--cwd'],
    command: 'list',
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    cospecStderr: "cospec list: option '--cwd <path>' argument missing\n",
  },
  // Upstream `config` has no `--store`, so the binary calls it an unknown option.
  {
    argv: ['config', '--store'],
    command: 'config',
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    cospecStderr: "cospec config: option '--store <id>' argument missing\n",
  },
  {
    argv: ['show', 'foo', '--cwd'],
    command: 'show',
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    cospecStderr: "cospec show: option '--cwd <path>' argument missing\n",
  },
  { argv: ['--json', 'list'], command: 'list', cospecOnly: { outcome: 'parsed', exit: 0 } },
  {
    argv: ['--store-path', '/x', 'list', '--json'],
    command: 'list',
    cospecOnly: { outcome: 'store-path', exit: 1 },
  },
  // No command: help on stdout, exit 0 (upstream prints it on stderr, exit 1).
  { argv: [], command: 'list', cospecOnly: { outcome: 'help:root', exit: 0 } },
  { argv: ['--'], command: 'list', cospecOnly: { outcome: 'help:root', exit: 0 } },
  { argv: ['--no-color'], command: 'list', cospecOnly: { outcome: 'help:root', exit: 0 } },
  // cospec's `help` alias on a table row never runs the command.
  { argv: ['list', 'help'], command: 'list', cospecOnly: { outcome: 'help:list', exit: 0 } },
  {
    argv: ['archive', 'help'],
    command: 'archive',
    cospecOnly: { outcome: 'help:archive', exit: 0 },
  },
]

/**
 * Rows cospec answers differently from the binary or from the intended
 * cospec-only outcome, keyed by argv: the refusal-kind comparison exposed a
 * `--store-path` ordering bug (it answered before an unknown option or an
 * excess operand), and phase B's routing missed a `help` after an absorbed
 * global and a `--` right after the command name. Each fix empties its share.
 */
const KNOWN_FAILING: ReadonlySet<string> = new Set<string>([
  // phase B routing
  'config -- path',
  'store -- list',
  'workset -- list',
  'config -- help',
  'config --',
  'config --no-color help',
  'schema --no-color help',
  'completion --no-color help',
])

async function checkRow(row: Row): Promise<void> {
  const co = await runCospec(row.argv, freshRoot())
  const coOutcome = outcome(co, row.command, row.argv)
  const detail = `cospec exit ${co.exitCode}\nstdout: ${co.stdout.slice(0, 200)}\nstderr: ${co.stderr.slice(0, 300)}`
  if (row.cospecOnly !== undefined) {
    expect({ outcome: coOutcome, exit: co.exitCode }, detail).toEqual(row.cospecOnly)
  } else {
    const up = await runUpstream(row.argv, freshRoot())
    const upDetail = `openspec exit ${up.exitCode}\nstdout: ${up.stdout.slice(0, 200)}\nstderr: ${up.stderr.slice(0, 300)}`
    expect({ outcome: coOutcome, exit: co.exitCode }, `${detail}\n${upDetail}`).toEqual({
      outcome: outcome(up, row.command, row.argv),
      exit: up.exitCode,
    })
  }
  if (row.cospecStderr !== undefined) expect(co.stderr, detail).toContain(row.cospecStderr)
}

function register(rows: readonly Row[]): void {
  for (const row of rows) {
    const key = row.argv.join(' ')
    const name = `${row.cospecOnly !== undefined ? 'cospec-only' : 'same'}: ${key || '(no argv)'}`
    if (KNOWN_FAILING.has(key)) test.failing(name, () => checkRow(row), 30_000)
    else test(name, () => checkRow(row), 30_000)
  }
}

describe('precedence matrix: -V/--version', () => register(VERSION_ROWS))
describe('precedence matrix: -h/--help', () => register(HELP_ROWS))
describe('precedence matrix: unknown options and commands', () => register(UNKNOWN_OPTION_ROWS))
describe('precedence matrix: --store values', () => register(VALUE_ROWS))
describe('precedence matrix: --store-path', () => register(STORE_PATH_ROWS))
describe('precedence matrix: -- terminators', () => register(TERMINATOR_ROWS))
describe('precedence matrix: a bare help token', () => register(HELP_TOKEN_ROWS))
describe('precedence matrix: cospec-only rows', () => register(COSPEC_ONLY_ROWS))

describe('precedence matrix: harness', () => {
  test('both tools receive a leading -- verbatim', async () => {
    const co = await runCospec(['--', '--version'], freshRoot())
    expect(co.stderr).toContain("cospec: unknown command '--version'")
    const up = await runUpstream(['--', '--version'], freshRoot())
    expect(up.stderr).toContain("error: unknown command '--version'")
  }, 30_000)

  test('every row is unique and the matrix covers at least 30 rows', () => {
    const all = [
      ...VERSION_ROWS,
      ...HELP_ROWS,
      ...UNKNOWN_OPTION_ROWS,
      ...VALUE_ROWS,
      ...STORE_PATH_ROWS,
      ...TERMINATOR_ROWS,
      ...HELP_TOKEN_ROWS,
      ...COSPEC_ONLY_ROWS,
    ].map((row) => row.argv.join(' '))
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBeGreaterThanOrEqual(30)
    for (const key of KNOWN_FAILING) expect(all).toContain(key)
  })
})
