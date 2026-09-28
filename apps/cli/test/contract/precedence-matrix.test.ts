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
// arguments — or parsed), the exit code, and how many JSON documents stdout
// carries (`documentCount()`). Comparing the kind, not just "refused", is what
// catches an ordering bug: a `--store-path` redirect where the binary refuses
// `--bogus` first is two different answers. Counting documents catches a
// value-position bug the kind cannot: `list --store-path --json` is the text
// redirect upstream (`--json` is the value), never a `--json` envelope. The expected
// answer is the binary's, read at test time, never a typed copy.
//
// Both tools receive argv verbatim, a leading `--` included. The binary runs
// under Bun, as cospec's wrapped calls run it, except for an argv whose first
// token is `--`: Bun would drop that token, so those rows alone run it under
// Node (`oracle(…, { runtime: 'node' })`), which delivers it. cospec runs as
// `bun <entry> -- …argv`, whose first `--` Bun consumes (asserted below).
//
// A `pending` row is a spelling the binary answers and cospec does not yet,
// owned by a later change in `parity-pending.yaml`: it asserts both the
// binary's answer and cospec's current one, so the row fails the moment either
// moves and the owner converts it to a `same` row.
//
// A `cospec-only` row exercises a cospec global upstream does not have at that
// level (`--cwd` anywhere, `--store`/`--json` before the command, cospec's
// `help` alias on a table row) or a deliberate cospec divergence (no command
// prints help and exits 0); it states the intended outcome instead of
// consulting the binary.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import { cleanupAll, cospec, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
import { documentCount, type Outcome, outcome } from './support/parse-class.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** Each fresh root's tree at creation, for `nothingWritten`. */
const snapshots = new Map<string, string>()

/**
 * Every path under `root` (and the registry's content), skipping the runtime
 * caches and state dirs a run may touch without acting on the argv.
 */
function snapshot(root: string): string {
  const skip = new Set(['.oracle-home/.cache', '.oracle-home/.local/state'])
  const paths: string[] = []
  const walk = (rel: string): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      const path = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (skip.has(path)) continue
      paths.push(path)
      if (entry.isDirectory()) walk(path)
    }
  }
  walk('')
  const registry = join(root, REGISTRY)
  const content = existsSync(registry) ? readFileSync(registry, 'utf8') : '<none>'
  return `${paths.sort().join('\n')}\n--- registry\n${content}`
}

const REGISTRY = '.oracle-home/.local/share/openspec/stores/registry.yaml'

/** This repo's own cospec schemas, the source a `userSchema` row installs from. */
const REPO_SCHEMAS = join(import.meta.dir, '..', '..', '..', '..', 'openspec', 'schemas')

/**
 * A root holding the scaffolded `openspec/` tree; with `store`, also a store
 * `st` at `<root>/store`, registered in the root's sandboxed registry (built
 * directly, as `integration/store-aware.test.ts` does, so no git identity is
 * involved).
 */
function freshRoot(store = false, userSchema?: Row['userSchema'], setup?: Row['setup']): string {
  const dir = mkTempRepo()
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  if (userSchema !== undefined) {
    const schemas =
      userSchema === 'data'
        ? join(dir, '.oracle-home', '.local', 'share', 'openspec', 'schemas')
        : join(dir, '.oracle-home', '.config', 'openspec', 'schemas')
    cpSync(join(REPO_SCHEMAS, 'feat'), join(schemas, 'feat'), { recursive: true })
  }
  if (store) {
    const storeDir = join(dir, 'store')
    mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
    writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), 'version: 1\nid: st\n')
    cpSync(join(template, 'openspec'), join(storeDir, 'openspec'), { recursive: true })
    mkdirSync(join(dir, REGISTRY, '..'), { recursive: true })
    writeFileSync(
      join(dir, REGISTRY),
      `version: 1\nstores:\n  st:\n    backend:\n      type: git\n      local_path: ${storeDir}\n`,
    )
  }
  setup?.(dir)
  oracleEnv(dir)
  snapshots.set(dir, snapshot(dir))
  return dir
}

/** cospec with `argv` delivered verbatim (Bun eats the `--` after the entry path). */
function runCospec(argv: readonly string[], root: string): Promise<SpawnResult> {
  return cospec(['--', ...argv], { cwd: root, env: oracleEnv(root) })
}

/** The binary with `argv` delivered verbatim: under Node only when Bun would drop a leading `--`. */
function runUpstream(argv: readonly string[], root: string): Promise<SpawnResult> {
  return oracle([...argv], root, argv[0] === '--' ? { runtime: 'node' } : {})
}

interface Row {
  argv: readonly string[]
  /** The command row the argv lands on, for the `--json` refusal classes. */
  command: string
  /** Text cospec's stderr must contain, beyond the outcome check. */
  cospecStderr?: string
  /** A cospec-only row's intended answer; `same` rows compare against the binary. */
  cospecOnly?: { outcome: Outcome; exit: number }
  /** A pending row: the owner slug, the binary's answer and cospec's current one. */
  pending?: {
    owner: string
    upstream: { outcome: Outcome; exit: number }
    cospec: { outcome: Outcome; exit: number }
  }
  /** Asserts what a run left behind (or printed), for each tool that ran the row. */
  check?: (tool: 'cospec' | 'openspec', root: string, run: SpawnResult) => void
  /** Each tool's root also registers a store `st` (see `freshRoot`). */
  store?: true
  /**
   * Each tool's root has no project `feat` schema but a user-level one: in
   * the sandbox's `$XDG_DATA_HOME/openspec/schemas` (`data`, where the binary
   * resolves it) or in `~/.config/openspec/schemas` (`config`, where it does not).
   */
  userSchema?: 'data' | 'config'
  /** Shapes each tool's root before its snapshot is taken (a change, a schema, no tree). */
  setup?: (root: string) => void
  /** Tells apart two rows sharing an argv (a different `setup`), in its key and name. */
  variant?: string
}

/** A row's key: its argv, plus its variant where one shares that argv. */
function rowKey(row: Row): string {
  const argv = row.argv.join(' ')
  return row.variant === undefined ? argv : `${argv} [${row.variant}]`
}

const REDIRECT = '--store-path is not supported. Register the path with cospec store register'
const UPSTREAM_REDIRECT = 'openspec store register'

/** The schema `schema init s1` writes: it ran, in both tools. */
function schemaCreated(tool: string, root: string): void {
  expect(existsSync(join(root, 'openspec', 'schemas', 's1', 'schema.yaml')), tool).toBe(true)
}

/** The run changed nothing on disk: no store, schema, workset or dash-named file. */
function nothingWritten(tool: string, root: string): void {
  expect(snapshot(root), `${tool} wrote under ${root}`).toBe(snapshots.get(root)!)
}

/** `context --code-workspace --help` wrote its workspace file at `./--help`: it ran. */
function workspaceWritten(tool: string, root: string): void {
  expect(existsSync(join(root, '--help')), tool).toBe(true)
}

/** `store setup s1 --path <dir>` set the store up at `./<dir>`: it ran. */
function storeSetUpAt(dir: string): (tool: string, root: string) => void {
  return (tool, root) => {
    expect(existsSync(join(root, dir, 'openspec')), tool).toBe(true)
    expect(readFileSync(join(root, REGISTRY), 'utf8'), tool).toContain('s1:')
  }
}

/** `store setup s1 --path --help` set the store up at `./--help`: it ran. */
const storeSetUp = storeSetUpAt('--help')

/** `config edit` with `EDITOR=true` writes the config file; a refusal leaves none. */
function nothingEdited(tool: string, root: string): void {
  const config = join(root, '.oracle-home', '.config', 'openspec', 'config.json')
  expect(existsSync(config), `${tool} edited ${config}`).toBe(false)
}

/** Exactly one JSON document whose `status[0]` is the store-path redirect. */
function storePathDocument(tool: string, _root: string, run: SpawnResult): void {
  const doc = JSON.parse(run.stdout) as { status: { code: string }[] }
  expect(doc.status[0]?.code, tool).toBe('store_path_not_supported')
}
const unknownOption = (option: string): string => `cospec: unknown option '${option}'\n`
const missingValue = (command: string, option: string): string =>
  `cospec ${command}: option '${option}' argument missing\n`

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
  // An unknown option earlier in the argv is only reported after the scan.
  { argv: ['status', '--help', '--bogus', '--change'], command: 'status' },
  // A pending flag is no different: its missing value outranks help and any
  // unknown option or pending flag before it.
  {
    argv: ['list', '--help', '--sort'],
    command: 'list',
    cospecStderr: missingValue('list', '--sort <order>'),
  },
  {
    argv: ['validate', '--help', '--type'],
    command: 'validate',
    cospecStderr: missingValue('validate', '--type <type>'),
  },
  {
    argv: ['init', '--help', '--language'],
    command: 'init',
    cospecStderr: missingValue('init', '--language <language>'),
  },
  {
    argv: ['status', '--change', 'c1', '--help', '--schema'],
    command: 'status',
    cospecStderr: missingValue('status', '--schema <name>'),
  },
  // In a value position a help flag is `--store-path`'s value: the command's
  // own refusal answers, not help.
  { argv: ['show', 'c1', '--store-path', '--help'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['schemas', '--store-path', '-h'], command: 'schemas', cospecStderr: REDIRECT },
  // The program level does not declare `--store-path`, so `--help` is no value
  // there: help outranks the unknown option.
  { argv: ['--store-path', '--help', 'list'], command: 'list' },
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
  // A trailing pending flag's missing value outranks an earlier unknown option.
  {
    argv: ['list', '--bogus', '--sort'],
    command: 'list',
    cospecStderr: missingValue('list', '--sort <order>'),
  },
  {
    argv: ['list', '-x', '--sort'],
    command: 'list',
    cospecStderr: missingValue('list', '--sort <order>'),
  },
  {
    argv: ['status', '--change', 'c1', '--bogus', '--schema'],
    command: 'status',
    cospecStderr: missingValue('status', '--schema <name>'),
  },
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
  // In a value position `--store-path` is that flag's value: the command runs.
  {
    argv: ['schema', 'init', 's1', '--description', '--store-path'],
    command: 'schema',
    check: schemaCreated,
  },
  { argv: ['show', '--type', '--store-path', 'c1'], command: 'show' },
  // `show` allows unknown options, so the binary's own redirect answers.
  { argv: ['show', '--bogus', '--store-path', '/x'], command: 'show', cospecStderr: REDIRECT },
  {
    argv: ['show', 'c1', '--store-path', '/x', '--json'],
    command: 'show',
    check: storePathDocument,
  },
  // A terminal-handover leaf: the redirect, and the editor never runs.
  {
    argv: ['config', 'edit', '--store-path', '/x'],
    command: 'config',
    cospecStderr: REDIRECT,
    check: nothingEdited,
  },
  // Commander raises a trailing missing value during the scan, ahead of an
  // unknown option or a pending flag it collected earlier, and ahead of help.
  { argv: ['list', '--bogus', '--store-path'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--help', '--bogus', '--store-path'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--sort', 'x', '--store-path'], command: 'list', cospecStderr: REDIRECT },
  // A global after a space-form `--store-path` is its value, never absorbed:
  // the redirect answers (text, no document), or the binary's excess operand.
  { argv: ['list', '--store-path', '--store'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['list', '--store-path', '--cwd'], command: 'list', cospecStderr: REDIRECT },
  { argv: ['show', 'c1', '--store-path', '--store'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['show', 'c1', '--store-path', '--store', 'foo'], command: 'show' },
  { argv: ['show', 'c1', '--store-path', '--json'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['list', '--store-path', '--json'], command: 'list', cospecStderr: REDIRECT },
  // The inline form carries its own value, so `--json` still asks for a document.
  {
    argv: ['list', '--store-path=/x', '--json'],
    command: 'list',
    check: storePathDocument,
  },
]

/**
 * The flags a wrapper threads onto a forward row's wrapped call (`--json`,
 * `--no-color`, `--store <id>`) land right after the command path, ahead of
 * the user's argv: appended after it, a dangling value-taking flag took them
 * as its value and the binary ran — `store setup s1 --path` set up a store at
 * `./--json`. Each row asserts the refusal and that nothing was written.
 */
const THREADING_ROWS: readonly Row[] = [
  { argv: ['store', 'setup', 's1', '--path'], command: 'store', check: nothingWritten },
  { argv: ['store', 'setup', 's1', '--json', '--path'], command: 'store', check: nothingWritten },
  { argv: ['store', 'register', '.', '--id'], command: 'store', check: nothingWritten },
  {
    argv: ['schema', 'init', 's1', '--json', '--description'],
    command: 'schema',
    check: nothingWritten,
  },
  {
    argv: ['schema', 'init', 's1', '--no-color', '--description'],
    command: 'schema',
    check: nothingWritten,
  },
  { argv: ['templates', '--json', '--schema'], command: 'templates', check: nothingWritten },
  { argv: ['show', 'c1', '--json', '--type'], command: 'show', check: nothingWritten },
  { argv: ['show', 'c1', '--no-color', '--type'], command: 'show', check: nothingWritten },
  {
    argv: ['workset', 'create', 'w1', '--json', '--tool'],
    command: 'workset',
    check: nothingWritten,
  },
  // A store-selected root threads `--store <id>` the same way on `show`; on
  // `templates` and `schema` it selects the root the binary runs in and is
  // never threaded (`FORWARD_STORE_ROWS`), and the missing value still wins.
  {
    argv: ['show', 'c1', '--store', 'st', '--type'],
    command: 'show',
    store: true,
    check: nothingWritten,
  },
  {
    argv: ['templates', '--store', 'st', '--schema'],
    command: 'templates',
    store: true,
    check: nothingWritten,
  },
  {
    argv: ['schema', 'init', 's1', '--store', 'st', '--description'],
    command: 'schema',
    store: true,
    check: nothingWritten,
  },
  {
    argv: ['schema', 'init', 's1', '--store', 'st', '--json', '--artifacts'],
    command: 'schema',
    store: true,
    check: nothingWritten,
  },
]

/** A copy of this repo's `feat` schema in the fixture store `st` only. */
function featInStore(dir: string): void {
  cpSync(join(REPO_SCHEMAS, 'feat'), join(dir, 'store', 'openspec', 'schemas', 'feat'), {
    recursive: true,
  })
}

/** The run answered from the fixture store's `feat` schema, not the local root's. */
function answeredFromStore(tool: string, root: string, run: SpawnResult): void {
  expect(run.stdout, tool).toContain(
    join(realpathSync(root), 'store', 'openspec', 'schemas', 'feat'),
  )
}

/**
 * Upstream's `templates` and every `schema` subcommand declare no `--store`,
 * so cospec never passes it to them (root-resolution-parity T3): `--store` is
 * cospec's global in either position there too, selecting the root the
 * wrapper spawns the binary inside. Every other token reaches the binary in
 * the user's order, so the first unknown option it names is the first one
 * after the store (`templates --bogus --store st` says `--bogus`, and a
 * `--store-path` ahead of it keeps its redirect), a flag after it still
 * raises its missing value, and nothing is written. Where upstream refuses
 * the `--store` itself — before the command name, or as the first unknown
 * option after it — cospec's answer is a deliberate superset: the store's
 * schema is read, or the next unknown option is the one named.
 */
const FORWARD_STORE_ROWS: readonly Row[] = [
  {
    argv: ['templates', '--bogus', '--store', 'st'],
    command: 'templates',
    store: true,
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['templates', '--store-path', '/x', '--store', 'st'],
    command: 'templates',
    store: true,
    cospecStderr: REDIRECT,
  },
  {
    argv: ['schema', 'which', 's1', '--bogus', '--store', 'st'],
    command: 'schema',
    store: true,
    cospecStderr: "error: unknown option '--bogus'",
  },
  // Superset: upstream names the `--store` it does not declare.
  {
    argv: ['templates', '--store', 'st', '--bogus'],
    command: 'templates',
    store: true,
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['schema', 'init', 's1', '--description', '--store', 'st'],
    command: 'schema',
    store: true,
    check: nothingWritten,
  },
  {
    argv: ['schema', 'init', 's1', '--bogus', '--store', 'st', '--description'],
    command: 'schema',
    store: true,
    check: nothingWritten,
  },
  {
    argv: ['--store', 'st', 'templates', '--bogus'],
    command: 'templates',
    store: true,
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['--store', 'st', 'schema', 'init', '--description'],
    command: 'schema',
    store: true,
    cospecOnly: { outcome: 'missing-value', exit: 1 },
    check: nothingWritten,
  },
  // Superset: a `--store` before the command name selects the store, which
  // alone holds `feat` (`openspec --store st templates` is an unknown option).
  {
    argv: ['--store', 'st', 'templates', '--schema', 'feat'],
    command: 'templates',
    store: true,
    setup: featInStore,
    cospecOnly: { outcome: 'parsed', exit: 0 },
    check: answeredFromStore,
  },
  {
    argv: ['--store', 'st', 'schema', 'which', 'feat'],
    command: 'schema',
    store: true,
    setup: featInStore,
    cospecOnly: { outcome: 'parsed', exit: 0 },
    check: answeredFromStore,
  },
]

/**
 * A token right after one of the row's own value-taking flags (space form) is
 * that flag's value whatever it looks like, as commander takes it: a help
 * flag or a global there is never intercepted or absorbed. A table row parses
 * the value; a forward row hands both tokens to the binary, which runs — and,
 * where the value is a path, writes there, in both tools.
 */
const VALUE_POSITION_ROWS: readonly Row[] = [
  { argv: ['status', '--change', '--help'], command: 'status' },
  { argv: ['status', '--change', '--json'], command: 'status' },
  { argv: ['status', '--change', '--store'], command: 'status' },
  { argv: ['status', '--change', '--cwd'], command: 'status' },
  { argv: ['instructions', 'proposal', '--change', '--help'], command: 'instructions' },
  { argv: ['init', '--tools', '--help'], command: 'init', check: nothingWritten },
  { argv: ['init', '--profile', '--help'], command: 'init', check: nothingWritten },
  { argv: ['init', '--language', '--help'], command: 'init', check: nothingWritten },
  { argv: ['validate', '--concurrency', '--help'], command: 'validate' },
  { argv: ['validate', '--type', '--json'], command: 'validate' },
  { argv: ['templates', '--schema', '--help'], command: 'templates' },
  { argv: ['templates', '--schema', '--json'], command: 'templates' },
  { argv: ['show', 'c1', '--type', '--help'], command: 'show' },
  { argv: ['show', 'c1', '--type', '--json'], command: 'show' },
  { argv: ['show', 'c1', '--type', '--store', 'st'], command: 'show', store: true },
  {
    argv: ['schema', 'init', '--description', '--help', 's1'],
    command: 'schema',
    check: schemaCreated,
  },
  {
    argv: ['context', '--code-workspace', '--help'],
    command: 'context',
    check: workspaceWritten,
  },
  { argv: ['store', 'setup', 's1', '--path', '--help'], command: 'store', check: storeSetUp },
  { argv: ['workset', 'create', 'w1', '--tool', '--help'], command: 'workset' },
  // cospec refuses a pending flag as not supported yet once it has its value,
  // where the binary runs with `--help` as the value (owned by later changes).
  {
    argv: ['list', '--sort', '--help'],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec list: '--sort' is not supported yet\n",
  },
  {
    argv: ['status', '--schema', '--json'],
    command: 'status',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec status: '--schema' is not supported yet\n",
  },
  // Every other declared value-taking flag, table and forward rows alike.
  { argv: ['feedback', '--body', '--help'], command: 'feedback' },
  { argv: ['templates', '--schema', '-h'], command: 'templates' },
  { argv: ['show', 'c1', '--requirement', '--help'], command: 'show' },
  { argv: ['show', 'c1', '-r', '--help'], command: 'show' },
  {
    argv: ['schema', 'init', 's1', '--artifacts', '--help'],
    command: 'schema',
    check: nothingWritten,
  },
  {
    argv: ['store', 'setup', 's1', '--remote', '--help'],
    command: 'store',
    check: nothingWritten,
  },
  {
    argv: ['store', 'setup', 's1', '--path', '--json'],
    command: 'store',
    check: storeSetUpAt('--json'),
  },
  {
    argv: ['workset', 'create', 'w1', '--member', '--help'],
    command: 'workset',
    check: nothingWritten,
  },
  { argv: ['workset', 'open', 'w1', '--tool', '--help'], command: 'workset' },
  { argv: ['config', '--scope', '--help', 'list'], command: 'config' },
  {
    argv: ['validate', '--report', '--help'],
    command: 'validate',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec validate: '--report' is not supported yet\n",
  },
  { argv: ['instructions', 'proposal', '--schema', '--help'], command: 'instructions' },
  // cospec-only flags take their value the same way.
  // The fixture holds no cospec schemas, so `new` refuses the missing
  // schema; the row pins that `--help` was the value, never help.
  {
    argv: ['new', 'feat', 'x', '--description', '--help'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: schema 'feat' is not installed in this repo",
  },
  {
    argv: ['init', '--harness', '--help'],
    command: 'init',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec: invalid --harness '--help'",
  },
  {
    argv: ['sync-blockers', '--change', '--help'],
    command: 'sync-blockers',
    cospecOnly: { outcome: 'parsed', exit: 0 },
  },
  // A wrapper's own cospec-only flag is a value there too, and an operand after `--`.
  {
    argv: ['store', 'setup', 's1', '--path', '--no-cospec-init'],
    command: 'store',
    check: storeSetUpAt('--no-cospec-init'),
  },
  {
    argv: ['store', 'setup', 's1', '--', '--no-cospec-init'],
    command: 'store',
    check: nothingWritten,
  },
]

/**
 * A `table` row whose module never reads `--store` (`store: 'refused'`)
 * refuses it as an unknown option, as the binary does for `init`, `update`
 * and `completion`: absorbed as a global, it was silently ignored — `init
 * --store nosuch` scaffolded the cwd. Before the command name it is a cospec
 * global, refused the same way once the row is known.
 */
const STORE_GLOBAL_ROWS: readonly Row[] = [
  { argv: ['init', '--store', 'x'], command: 'init', check: nothingWritten },
  { argv: ['init', '--store=x'], command: 'init', check: nothingWritten },
  { argv: ['init', '--store'], command: 'init', check: nothingWritten },
  { argv: ['init', '--store', 'x', '--help'], command: 'init' },
  { argv: ['init', '--harness', 'none', '--store', 'x'], command: 'init', check: nothingWritten },
  { argv: ['update', '--store', 'foo'], command: 'update', check: nothingWritten },
  { argv: ['update', '--store=foo'], command: 'update', check: nothingWritten },
  { argv: ['completion', '--store', 'x'], command: 'completion' },
  {
    argv: ['check-commit', 'msg', '--store', 'x'],
    command: 'check-commit',
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "cospec check-commit: unknown option '--store'\n",
  },
  {
    argv: ['--store', 'x', 'init'],
    command: 'init',
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "cospec init: unknown option '--store'\n",
    check: nothingWritten,
  },
  {
    argv: ['--store', 'x', 'update', '--help'],
    command: 'update',
    cospecOnly: { outcome: 'help:update', exit: 0 },
  },
]

/**
 * A forward wrapper's own pre-spawn guards (`config`, `schema` and `workset`
 * subcommand checks, `config`'s `--scope` lift, `show`'s item-name check)
 * never answer for the binary. A dangling declared value flag is commander's
 * missing value; an option before the subcommand is the binary's unknown
 * option, `--store-path` its redirect; `show`'s unknown option is its item
 * name. None of `config`, `schema`, `workset`, `store` or `templates`
 * declares `--store-path` upstream, so a help flag after it is help there —
 * never its value, and never the binary's own help relayed.
 */
const FORWARD_GUARD_ROWS: readonly Row[] = [
  {
    argv: ['config', '--scope'],
    command: 'config',
    cospecStderr: missingValue('config', '--scope <scope>'),
  },
  {
    argv: ['config', 'list', '--scope'],
    command: 'config',
    cospecStderr: missingValue('config', '--scope <scope>'),
  },
  { argv: ['show', '--type'], command: 'show' },
  { argv: ['show', '-r'], command: 'show' },
  { argv: ['show', '--deltas-only', '--requirement'], command: 'show' },
  { argv: ['show', '--bogus'], command: 'show', cospecStderr: "Unknown item '--bogus'." },
  { argv: ['show', '--bogus=1'], command: 'show', cospecStderr: "Unknown item '--bogus=1'." },
  { argv: ['show', '--store-path'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['show', '--store-path', '/x'], command: 'show', cospecStderr: REDIRECT },
  { argv: ['config', '--bogus'], command: 'config', cospecStderr: "unknown option '--bogus'" },
  { argv: ['config', '--bogus', 'path'], command: 'config' },
  { argv: ['config', '--scope', 'global', '--bogus', 'list'], command: 'config' },
  { argv: ['schema', '--bogus'], command: 'schema', cospecStderr: "unknown option '--bogus'" },
  { argv: ['workset', '--bogus'], command: 'workset', cospecStderr: "unknown option '--bogus'" },
  { argv: ['config', '--store-path', '/x'], command: 'config', cospecStderr: REDIRECT },
  { argv: ['config', '--store-path', '/x', 'path'], command: 'config', cospecStderr: REDIRECT },
  { argv: ['schema', '--store-path'], command: 'schema', cospecStderr: REDIRECT },
  { argv: ['workset', '--store-path', '/x'], command: 'workset', cospecStderr: REDIRECT },
  { argv: ['store', '--store-path', '/x'], command: 'store' },
  { argv: ['workset', '--store-path', '-h'], command: 'workset' },
  { argv: ['config', '--store-path', '-h'], command: 'config' },
  { argv: ['config', 'path', '--store-path', '-h'], command: 'config' },
  { argv: ['schema', 'which', '--store-path', '-h'], command: 'schema' },
  { argv: ['workset', 'list', '--store-path', '-h'], command: 'workset' },
  { argv: ['store', 'list', '--store-path', '-h'], command: 'store' },
  { argv: ['templates', '--store-path', '-h'], command: 'templates' },
  // Past a `--` every token is an operand: `--scope` is not lifted, and an
  // option-like operand in subcommand position is an unknown subcommand.
  { argv: ['--', 'config', '--scope', 'global'], command: 'config' },
  { argv: ['config', 'path', '--', '--scope', 'global'], command: 'config' },
  { argv: ['--', 'schema', '--bogus'], command: 'schema' },
]

/**
 * A `--json` caller gets exactly one document on every `status` path, its
 * refusals included — upstream's `{status: [{severity, code, message}]}` for
 * an unknown change, exit 1 — and `status` with no active changes.
 */
const STATUS_JSON_ROWS: readonly Row[] = [
  { argv: ['status', '--change', '--', '--json'], command: 'status' },
  { argv: ['status', '--change', 'nope', '--json'], command: 'status' },
  // cospec's own positional change (upstream `status` takes none).
  {
    argv: ['status', 'nope', '--json'],
    command: 'status',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: (tool, _root, run) => expect(documentCount(run.stdout), tool).toBe(1),
  },
  { argv: ['status', '--json'], command: 'status' },
]

/**
 * cospec's positional change is its own spelling of `--change`; upstream
 * `status` takes no positional, so given alongside `--change` or `--all` it is
 * the excess argument commander refuses before the action runs — on stderr,
 * no document, even under `--json`.
 */
const STATUS_POSITIONAL_ROWS: readonly Row[] = [
  { argv: ['status', 'foo', '--change', 'bar'], command: 'status' },
  { argv: ['status', '--change', 'bar', 'foo'], command: 'status' },
  { argv: ['status', 'foo', '--change', 'bar', '--json'], command: 'status' },
  { argv: ['status', 'foo', '--all'], command: 'status' },
  { argv: ['status', 'foo', '--all', '--json'], command: 'status' },
  { argv: ['status', 'foo', '--all', '--change', 'bar'], command: 'status' },
  // Help still outranks it; an unknown option still comes first.
  { argv: ['status', 'foo', '--change', 'bar', '--help'], command: 'status' },
  { argv: ['status', 'foo', '--change', 'bar', '--bogus'], command: 'status' },
]

/**
 * `new <type>` in a repo whose `openspec/schemas/` lacks the cospec type is
 * the user's setup to fix, answered before the wrapped `new change` runs —
 * never a wrapped-call failure.
 */
const NEW_SCHEMA_ROWS: readonly Row[] = [
  {
    argv: ['new', 'feat', 'x'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: schema 'feat' is not installed in this repo",
    check: nothingWritten,
  },
  // A `--json` caller gets one document in upstream's `new change` failure
  // shape (`{ change: null, status: [<error>] }`), and nothing on stderr.
  {
    argv: ['new', 'feat', 'x', '--json'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: (tool, root, run) => {
      nothingWritten(tool, root)
      expect(documentCount(run.stdout), run.stdout).toBe(1)
      expect(JSON.parse(run.stdout)).toEqual({
        change: null,
        status: [
          {
            severity: 'error',
            code: 'change_error',
            message: "schema 'feat' is not installed in this repo — run 'cospec init' first",
          },
        ],
      })
      expect(run.stdout).toStartWith('{\n  "change": null,\n')
      expect(run.stderr).toBe('')
    },
  },
  // A user-level schema counts where the binary resolves one
  // (`$XDG_DATA_HOME/openspec/schemas`, else `~/.local/share/openspec/schemas`)
  // and nowhere else: `~/.config/openspec/schemas` is not on its path.
  {
    argv: ['new', 'feat', 'u1'],
    command: 'new',
    userSchema: 'data',
    cospecOnly: { outcome: 'parsed', exit: 0 },
    check: (tool, root) =>
      expect(readFileSync(join(root, 'openspec/changes/u1/.openspec.yaml'), 'utf8'), tool).toMatch(
        /^schema: feat$/m,
      ),
  },
  {
    argv: ['new', 'feat', 'c1'],
    command: 'new',
    userSchema: 'config',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: schema 'feat' is not installed in this repo",
    check: nothingWritten,
  },
]

/**
 * `new`'s every own refusal, in both modes: text on stderr, or under `--json`
 * exactly one `{ change: null, status: [<change_error>] }` document on stdout
 * — the shape the wrapped `new change --json` gives each of its failures
 * (probed: unknown schema, existing change, invalid name, schema parse
 * failure) — with nothing on stderr, exit 1 and nothing written. A missing
 * slug is a parse-class refusal, as the binary's commander
 * `missing required argument 'name'` is: text in both modes, no document.
 * `--initiative`/`--areas` (which the binary refuses with its own
 * `*_option_removed` document) never reach `new` here: the table parser
 * refuses them as unknown options, text in both modes, as it does every
 * option `new` does not declare.
 */
function newRefusal(message: string): Row['check'] {
  return (tool, root, run) => {
    nothingWritten(tool, root)
    expect(documentCount(run.stdout), run.stdout).toBe(1)
    expect(JSON.parse(run.stdout)).toEqual({
      change: null,
      status: [{ severity: 'error', code: 'change_error', message }],
    })
    expect(run.stdout).toStartWith('{\n  "change": null,\n')
    expect(run.stderr).toBe('')
  }
}

/** A text refusal: nothing on stdout, nothing written. */
function textRefusal(tool: string, root: string, run: SpawnResult): void {
  nothingWritten(tool, root)
  expect(run.stdout, tool).toBe('')
}

const withChange = (root: string): void => {
  mkdirSync(join(root, 'openspec', 'changes', 'ex'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'ex', '.openspec.yaml'), 'schema: feat\n')
}
const withArchived = (root: string): void => {
  mkdirSync(join(root, 'openspec', 'changes', 'archive', '2026-01-01-old'), { recursive: true })
}
const withoutTree = (root: string): void =>
  rmSync(join(root, 'openspec'), { recursive: true, force: true })
const withBrokenSchema = (root: string): void => {
  mkdirSync(join(root, 'openspec', 'schemas', 'broken'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'schemas', 'broken', 'schema.yaml'), 'not: [valid\n')
}

/** The binary's parse failure for `withBrokenSchema`'s schema.yaml, as its `--json` message. */
const BROKEN_REASON =
  /^Failed to parse schema at '[^']*\/openspec\/schemas\/broken\/schema\.yaml': Flow sequence in block collection/
const BROKEN_REASON_TEXT = new RegExp(`^cospec new: ${BROKEN_REASON.source.slice(1)}`)

const VALID_TYPES = 'build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test'

/** `new`'s usage, the line after each of its missing-argument refusals. */
const NEW_USAGE =
  'cospec new: usage — cospec new <type> <slug> | cospec new "<type>: <description>"\n'
const MISSING_SLUG = `cospec new: missing required argument 'slug'\n${NEW_USAGE}`

const NEW_REFUSAL_ROWS: readonly Row[] = [
  {
    argv: ['new', 'bogus', 'x'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: unknown type 'bogus'\nDid you mean 'docs'?\nValid types:\n",
    check: textRefusal,
  },
  {
    argv: ['new', 'bogus', 'x', '--json'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal(`unknown type 'bogus' — did you mean 'docs'? Valid types: ${VALID_TYPES}`),
  },
  {
    argv: ['new', 'feat'],
    command: 'new',
    cospecOnly: { outcome: 'missing-argument', exit: 1 },
    cospecStderr: MISSING_SLUG,
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', '--json'],
    command: 'new',
    cospecOnly: { outcome: 'missing-argument', exit: 1 },
    cospecStderr: MISSING_SLUG,
    check: textRefusal,
  },
  {
    argv: ['new', 'feat: !!!'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: could not derive a slug from '!!!'",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat: !!!', '--json'],
    command: 'new',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal(
      "could not derive a slug from '!!!' — pass an explicit slug: cospec new feat <slug>",
    ),
  },
  {
    argv: ['new', 'feat', 'Bad_Name'],
    command: 'new',
    userSchema: 'data',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: invalid slug 'Bad_Name'",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', 'Bad_Name', '--json'],
    command: 'new',
    userSchema: 'data',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal("invalid slug 'Bad_Name' — must match ^[a-z][a-z0-9]*(-[a-z0-9]+)*$"),
  },
  {
    argv: ['new', 'feat', 'ex'],
    command: 'new',
    userSchema: 'data',
    setup: withChange,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: change 'ex' already exists in openspec/changes/",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', 'ex', '--json'],
    command: 'new',
    userSchema: 'data',
    setup: withChange,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal("change 'ex' already exists in openspec/changes/"),
  },
  {
    argv: ['new', 'feat', 'old'],
    command: 'new',
    userSchema: 'data',
    setup: withArchived,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: 'old' collides with an archived change suffix",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', 'old', '--json'],
    command: 'new',
    userSchema: 'data',
    setup: withArchived,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal("'old' collides with an archived change suffix — choose a different slug"),
  },
  {
    argv: ['new', 'feat', 'nr'],
    command: 'new',
    setup: withoutTree,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr: "cospec new: no openspec/ directory — run 'cospec init' first",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', 'nr', '--json'],
    command: 'new',
    setup: withoutTree,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: newRefusal("no openspec/ directory — run 'cospec init' first"),
  },
  // Without an openspec/ tree a missing slug is still the parse refusal
  // (commander parses before its action runs), in both modes — never the
  // root refusal, text or document.
  ...[['new'], ['new', '--json'], ['new', 'feat'], ['new', 'feat', '--json']].map(
    (argv): Row => ({
      argv,
      variant: 'no root',
      command: 'new',
      setup: withoutTree,
      cospecOnly: { outcome: 'missing-argument', exit: 1 },
      cospecStderr: `cospec new: missing required argument '${argv[1] === 'feat' ? 'slug' : 'type'}'\n${NEW_USAGE}`,
      check: (tool, root, run) => {
        textRefusal(tool, root, run)
        expect(run.stderr, tool).not.toContain('no openspec/ directory')
      },
    }),
  ),
  // A schema the wrapped `new change` cannot parse: the binary's own reason
  // (its `--json` document's message) is cospec's, in both modes — never a
  // bare wrapped-call exit code.
  {
    argv: ['new', 'broken', 'x'],
    command: 'new',
    setup: withBrokenSchema,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: (tool, root, run) => {
      textRefusal(tool, root, run)
      expect(run.stderr, tool).toMatch(BROKEN_REASON_TEXT)
      expect(run.stderr, tool).not.toContain('wrapped OpenSpec call')
      expect(run.stderr, tool).not.toContain('✖')
    },
  },
  {
    argv: ['new', 'broken', 'x', '--json'],
    command: 'new',
    setup: withBrokenSchema,
    cospecOnly: { outcome: 'parsed', exit: 1 },
    check: (tool, root, run) => {
      nothingWritten(tool, root)
      expect(documentCount(run.stdout), run.stdout).toBe(1)
      const doc = JSON.parse(run.stdout) as {
        change: null
        status: { severity: string; code: string; message: string }[]
      }
      expect(doc.change).toBeNull()
      expect(doc.status).toHaveLength(1)
      expect(doc.status[0]!.severity).toBe('error')
      expect(doc.status[0]!.code).toBe('change_error')
      expect(doc.status[0]!.message).toMatch(BROKEN_REASON)
      expect(doc.status[0]!.message).not.toContain('wrapped OpenSpec call')
      expect(run.stderr).toBe('')
    },
  },
  {
    argv: ['new', 'feat', 'x', '--initiative', 'i'],
    command: 'new',
    userSchema: 'data',
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "cospec new: unknown option '--initiative'",
    check: textRefusal,
  },
  {
    argv: ['new', 'feat', 'x', '--areas', 'a', '--json'],
    command: 'new',
    userSchema: 'data',
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
    cospecStderr: "cospec new: unknown option '--areas'",
    check: textRefusal,
  },
]

/**
 * A required positional given nothing is commander's `missing required
 * argument '<name>'`, raised after the scan's unknown options and before too
 * many arguments or the action, so before an action-level `--store-path`
 * refusal and a root check: text in both modes, never a document, exit 1.
 * cospec answers it in its own format, the usage on the next line. Where the
 * upstream command declares the same required positional (`feedback
 * <message>`, `__complete <type>`) the row is the binary's; `new`, `apply`
 * and `migrate` are cospec's own, and upstream's `archive [change-name]` is
 * optional where cospec requires it, so those rows state cospec's answer;
 * `instructions [artifact]` is optional in both. `check-commit`'s message file stays
 * optional: an advisory hook never refuses.
 */
function missingArgument(command: string, name: string, usage: string): string {
  return `cospec ${command}: missing required argument '${name}'\ncospec ${command}: usage — ${usage}\n`
}

const MISSING_ARGUMENT_ROWS: readonly Row[] = [
  // `new change <name> --store-path /x` (probed) is `missing required argument 'name'`.
  ...[
    ['new', '--store-path', '/x'],
    ['new', 'feat', '--store-path', '/x'],
    ['new', 'feat', '--store-path', '/x', '--json'],
    ['new', '--json', '--store-path', '/x'],
  ].map(
    (argv): Row => ({
      argv,
      command: 'new',
      cospecOnly: { outcome: 'missing-argument', exit: 1 },
      cospecStderr: `cospec new: missing required argument '${argv[1] === 'feat' ? 'slug' : 'type'}'\n${NEW_USAGE}`,
      check: textRefusal,
    }),
  ),
  // The compound `"<type>: <description>"` fills the slug, so the redirect answers.
  {
    argv: ['new', 'feat: add a thing', '--store-path', '/x'],
    command: 'new',
    cospecOnly: { outcome: 'store-path', exit: 1 },
    check: textRefusal,
  },
  // A missing value still outranks it, help too, and an unknown option.
  {
    argv: ['new', 'feat', '--store-path'],
    command: 'new',
    cospecOnly: { outcome: 'store-path', exit: 1 },
  },
  { argv: ['new', 'feat', '--help'], command: 'new', cospecOnly: { outcome: 'help:new', exit: 0 } },
  {
    argv: ['new', 'feat', '--bogus', '--store-path', '/x'],
    command: 'new',
    cospecOnly: { outcome: 'unknown-option', exit: 1 },
  },
  ...[['apply', '--json'], ['apply'], ['apply', '--allow-soft']].map(
    (argv): Row => ({
      argv,
      command: 'apply',
      cospecOnly: { outcome: 'missing-argument', exit: 1 },
      cospecStderr: missingArgument('apply', 'change', 'cospec apply <change>'),
      check: textRefusal,
    }),
  ),
  // `apply` never declares `--store-path`: an unknown option, reported first.
  {
    argv: ['apply', '--store-path', '/x'],
    command: 'apply',
    cospecOnly: { outcome: 'store-path', exit: 1 },
  },
  ...[['migrate'], ['migrate', '--json']].map(
    (argv): Row => ({
      argv,
      command: 'migrate',
      cospecOnly: { outcome: 'missing-argument', exit: 1 },
      cospecStderr: missingArgument('migrate', 'slug', 'cospec migrate <slug>'),
      check: textRefusal,
    }),
  ),
  ...[
    ['archive', '--store-path', '/x'],
    ['archive', '--store-path', '/x', '--json'],
    ['archive', '--json'],
    ['archive', '-y'],
  ].map(
    (argv): Row => ({
      argv,
      command: 'archive',
      cospecOnly: { outcome: 'missing-argument', exit: 1 },
      cospecStderr: missingArgument('archive', 'change', 'cospec archive <change>'),
      check: textRefusal,
    }),
  ),
  // Upstream's `instructions [artifact]` is optional: its action answers a
  // missing artifact or change itself, one document under `--json`.
  ...[
    ['instructions', '--change', 'x'],
    ['instructions', '--change', 'x', '--json'],
    ['instructions', '--store-path', '/x'],
    ['instructions', '--json'],
  ].map((argv): Row => ({ argv, command: 'instructions' })),
  {
    argv: ['feedback'],
    command: 'feedback',
    cospecStderr: missingArgument('feedback', 'message', 'cospec feedback <message>'),
    check: textRefusal,
  },
  { argv: ['feedback', '--body', 'b'], command: 'feedback', check: textRefusal },
  { argv: ['feedback', '--store-path', '/x'], command: 'feedback', check: textRefusal },
  {
    argv: ['__complete'],
    command: '__complete',
    cospecStderr: missingArgument('__complete', 'source', 'cospec __complete <source>'),
    check: textRefusal,
  },
  { argv: ['__complete', '--store-path', '/x'], command: '__complete', check: textRefusal },
  { argv: ['check-commit'], command: 'check-commit', cospecOnly: { outcome: 'parsed', exit: 0 } },
]

/**
 * Upstream's program level takes `--no-color` out of the argv before the
 * command parses, wherever it sits before the first `--`: it is never a
 * value, so the flag before it takes the next token or is left without one.
 * Past a `--` that a value-taking flag took as its value, the program level
 * has stopped: `--no-color` and `--version` there are the command's unknown
 * options, while the command's own flags (`--json`, `--help`) still apply.
 */
const PROGRAM_LEVEL_ROWS: readonly Row[] = [
  { argv: ['status', '--change', '--no-color'], command: 'status' },
  { argv: ['status', '--change', '--no-color', 'c1'], command: 'status' },
  { argv: ['templates', '--schema', '--no-color'], command: 'templates' },
  { argv: ['show', 'c1', '--type', '--no-color'], command: 'show' },
  { argv: ['init', '--tools', '--no-color'], command: 'init', check: nothingWritten },
  {
    argv: ['store', 'setup', 's1', '--path', '--no-color'],
    command: 'store',
    check: nothingWritten,
  },
  { argv: ['list', '--store', '--no-color'], command: 'list' },
  { argv: ['show', 'c1', '--store', '--no-color'], command: 'show' },
  { argv: ['list', '--store-path', '--no-color'], command: 'list' },
  { argv: ['status', '--change', '--', '--help'], command: 'status' },
  { argv: ['instructions', 'proposal', '--change', '--', '--json'], command: 'instructions' },
  { argv: ['status', '--change', '--', '--version'], command: 'status' },
  { argv: ['status', '--change', '--', '--no-color'], command: 'status' },
  { argv: ['show', 'c1', '--type', '--', '--json'], command: 'show' },
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

/**
 * `--store-path` takes a value only where the upstream command declares its
 * hidden `--store-path <path>` (the rows marked `declaresStorePath`).
 * Elsewhere — `init`, `update`, `completion`, `feedback` upstream, and every
 * cospec-only command — it is an unknown option that takes nothing: refused in
 * scan order like any other (an earlier unknown option first), outranked by
 * help, and never a document under `--json`, because commander's refusal
 * comes before any output.
 */
const UNDECLARED_STORE_PATH_ROWS: readonly Row[] = [
  { argv: ['init', '--store-path', '--help'], command: 'init' },
  { argv: ['init', '--store-path=x', '--help'], command: 'init' },
  { argv: ['init', '--help', '--store-path'], command: 'init' },
  { argv: ['init', '--store-path', 'x'], command: 'init', cospecStderr: REDIRECT },
  { argv: ['init', '--store-path'], command: 'init', cospecStderr: REDIRECT },
  { argv: ['init', '--store-path', '--bogus'], command: 'init', cospecStderr: REDIRECT },
  { argv: ['init', '--bogus', '--store-path'], command: 'init' },
  { argv: ['init', '--store-path', '--json'], command: 'init', cospecStderr: REDIRECT },
  { argv: ['update', '--store-path', '--help'], command: 'update' },
  { argv: ['completion', '--store-path', '--help'], command: 'completion' },
  { argv: ['feedback', '--store-path', '--help'], command: 'feedback' },
  { argv: ['feedback', 'msg', '--store-path'], command: 'feedback', cospecStderr: REDIRECT },
  // A forward row that does not declare it: the binary's plain refusal, no document.
  { argv: ['store', 'list', '--store-path', '--json'], command: 'store', cospecStderr: REDIRECT },
  { argv: ['workset', 'list', '--json', '--store-path'], command: 'workset' },
  { argv: ['templates', '--json', '--store-path', 'x'], command: 'templates' },
  { argv: ['config', 'list', '--json', '--store-path', 'x'], command: 'config' },
  // A terminal-handover leaf answers without spawning, the same way.
  {
    argv: ['config', 'edit', '--store-path', '/x', '--json'],
    command: 'config',
    cospecStderr: REDIRECT,
    check: nothingEdited,
  },
  {
    argv: ['workset', 'open', 'w1', '--store-path', '--json'],
    command: 'workset',
    cospecStderr: REDIRECT,
  },
  // A cospec-only command has no upstream declaration either.
  {
    argv: ['apply', '--store-path', '--help'],
    command: 'apply',
    cospecOnly: { outcome: 'help:apply', exit: 0 },
  },
  {
    argv: ['check-commit', '--store-path', '--help'],
    command: 'check-commit',
    cospecOnly: { outcome: 'help:check-commit', exit: 0 },
  },
  {
    argv: ['apply', 'c1', '--store-path', 'x'],
    command: 'apply',
    cospecOnly: { outcome: 'store-path', exit: 1 },
    cospecStderr: REDIRECT,
  },
]

/**
 * A forward command's ordinary commander refusal — `missing required
 * argument` included — is the binary's answer, relayed as is, never reported
 * as a wrapped-call failure (and never a document under `--json`).
 */
const FORWARD_REFUSAL_ROWS: readonly Row[] = [
  {
    argv: ['store', 'unregister'],
    command: 'store',
    cospecStderr: "error: missing required argument 'id'",
  },
  {
    argv: ['store', 'remove'],
    command: 'store',
    cospecStderr: "error: missing required argument 'id'",
  },
  { argv: ['store', 'unregister', '--json'], command: 'store' },
  { argv: ['store', 'remove', '--json'], command: 'store' },
]

/**
 * Commander splits a short-option cluster (`-yh`) only when its first letter
 * is an option the parsing command declares: a boolean takes the rest as the
 * next token, a value-taking one as its value. `-h` never starts a split (help
 * is not among commander's options), and `-V` is the program's own, which the
 * program level finds in any `-V…` cluster before a `--`.
 */
const SHORT_CLUSTER_ROWS: readonly Row[] = [
  { argv: ['archive', 'c', '-yh'], command: 'archive' },
  { argv: ['archive', '-yh'], command: 'archive' },
  { argv: ['archive', 'c', '-yy'], command: 'archive' },
  { argv: ['archive', 'c', '-yV'], command: 'archive', cospecStderr: "unknown option '-V'\n" },
  { argv: ['archive', 'c', '-yx'], command: 'archive', cospecStderr: "unknown option '-x'\n" },
  { argv: ['archive', 'c', '-hy'], command: 'archive' },
  { argv: ['archive', 'c', '-xy'], command: 'archive' },
  { argv: ['archive', 'c', '-Vh'], command: 'archive' },
  { argv: ['list', '-yh'], command: 'list' },
  { argv: ['list', '-Vh'], command: 'list' },
  { argv: ['list', '-hV'], command: 'list' },
  { argv: ['list', '--', '-Vh'], command: 'list' },
  { argv: ['store', 'list', '-Vh'], command: 'store' },
  // A forward row's declared boolean short splits too: `-h` is cospec's help,
  // never the binary's own help screen relayed.
  { argv: ['config', 'reset', '-yh'], command: 'config' },
  { argv: ['config', 'reset', '--all', '-yh'], command: 'config' },
  { argv: ['show', 'c1', '-rh'], command: 'show' },
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

/**
 * Commander's implicit program-level `help [command]`: the program's help, or
 * a command's (hidden ones included), on stdout; program help on stderr and
 * exit 1 for anything else, `help` itself included. Its options and excess
 * operands are ignored, as commander's help command ignores them.
 */
const HELP_COMMAND_ROWS: readonly Row[] = [
  { argv: ['help'], command: 'help' },
  { argv: ['help', 'list'], command: 'help' },
  { argv: ['help', 'config', 'path'], command: 'help' },
  { argv: ['help', 'bogus'], command: 'help' },
  { argv: ['help', 'help'], command: 'help' },
  { argv: ['help', '--bogus'], command: 'help' },
  { argv: ['help', '--', 'list'], command: 'help' },
  // The first option ends its operands: commander files it and the rest as
  // unknown, cospec's globals included (the help command declares none).
  { argv: ['help', '--bogus', 'list'], command: 'help' },
  { argv: ['help', '--json', 'list'], command: 'help' },
  { argv: ['help', '--store', 'list'], command: 'help' },
  { argv: ['help', '--help'], command: 'help' },
  { argv: ['help', 'list', '--help'], command: 'help' },
  { argv: ['help', 'list', 'extra'], command: 'help' },
  { argv: ['help', 'experimental'], command: 'help' },
]

/**
 * A spelling the binary answers and cospec does not yet, owned by a later
 * change in `parity-pending.yaml` (none today).
 */
const PENDING_ROWS: readonly Row[] = []

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
  // The empty id reaches the resolver on a root-selecting row (ledger 5.5).
  {
    argv: ['--store=', 'list'],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
    cospecStderr:
      'cospec: Store id must not be empty\n' +
      'Fix: Use kebab-case with lowercase letters, numbers, and single hyphen separators.\n',
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
  // `--cwd` takes the next token whatever it is: `--store-path` is its value
  // (a directory that does not exist), so `list` runs there and fails.
  {
    argv: ['--cwd', '--store-path', 'list'],
    command: 'list',
    cospecOnly: { outcome: 'parsed', exit: 1 },
  },
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
  // cospec's `--json` is a global on every config row, a superset of the
  // binary's (design D13): an excess argument is refused as too many, where
  // the binary names `--json` as the unknown option. Both exit 1 before
  // anything runs (handover-prevalidation.test.ts pins the binary's half).
  {
    argv: ['config', 'edit', 'extra', '--json'],
    command: 'config',
    cospecOnly: { outcome: 'too-many', exit: 1 },
    check: nothingEdited,
  },
  {
    argv: ['config', 'profile', 'a', 'b', '--json'],
    command: 'config',
    cospecOnly: { outcome: 'too-many', exit: 1 },
  },
  {
    argv: ['config', 'reset', '--all', 'extra', '--json'],
    command: 'config',
    cospecOnly: { outcome: 'too-many', exit: 1 },
  },
  {
    argv: ['archive', 'help'],
    command: 'archive',
    cospecOnly: { outcome: 'help:archive', exit: 0 },
  },
]

/**
 * Rows cospec answers differently from the binary or from the intended
 * cospec-only outcome, keyed by argv, run as `test.failing` until fixed. The
 * refusal-kind comparison exposed 17 (the `--store-path` ordering and phase
 * B's routing of `help` after a global and of a `--` after the command name);
 * the value-position and scan-order rows exposed 5 more (a forward row's
 * pre-decided `--store-path`, and the table parser stopping at the first
 * unknown option or pending flag); the dangling-pending-flag and
 * `--store-path`-value rows, with the document count, exposed 15 more (a
 * pending flag with no value refused as pending, not argument missing; phase
 * B absorbing or intercepting `--store-path`'s value); the threaded-flag and
 * value-position rows exposed 28 more (a wrapper appending `--json`,
 * `--no-color` or `--store <id>` after the user's argv, where a dangling
 * value-taking flag took it and the binary ran; phase B absorbing or
 * intercepting a token that is one of the row's own flags' value); the
 * remaining value-taking flags, the program-level `--no-color` and the `--`
 * taken as a value exposed 20 more (phase B intercepting or absorbing the
 * value of every other declared value-taking flag, `--store` taking a
 * program-level `--no-color` as its value, `store` stripping its
 * `--no-cospec-init` where it is `--path`'s value or an operand after `--`);
 * the `--store` rows on commands that never read it, the forward wrapper
 * guards, the `status --json` refusals and `new` without its schema exposed
 * 38 more (a refused `--store` absorbed and ignored; a wrapper guard
 * answering a dangling value flag, an option before the subcommand or
 * `show`'s unknown option for the binary; `--store-path` taking a help flag
 * as its value where upstream does not declare it; prose where a `--json`
 * caller is owed a document; a missing schema reported as a wrapped-call
 * failure). The round-7 rows exposed 37 more (a `--store-path` that took a
 * value, or answered with a document, a terminal-handover leaf's included, on
 * a row whose upstream command never declares it; `new` checking the wrong
 * user-level schema directory; `status` dropping its positional beside
 * `--change` or `--all`; commander's `missing
 * required argument` unrecognised, so a forward call reported it as a
 * wrapped-call failure and `feedback` worded it its own way; short-option
 * clusters never split). The round-8 rows exposed 4 more (a `--store` typed
 * after `templates` or a `schema` subcommand threaded ahead of the user's
 * argv, so the binary named it before the user's own unknown option or
 * `--store-path`; `new` without its schema answering a `--json` caller in
 * prose). The round-9 rows exposed 7 more (every other `new` refusal answering
 * a `--json` caller in prose). The round-10 rows exposed 6 more (a failed
 * wrapped `new change` answering with its exit code, not the binary's reason,
 * in both modes; a missing slug outside an openspec/ tree answered with the
 * root refusal, not the parse refusal). The round-11 rows exposed 25 more (a
 * required positional given nothing never refused by the table parser, so a
 * trailing `--store-path` redirect, a root check or a module's own wording
 * answered instead of commander's `missing required argument`). The fixes
 * empty this set.
 */
const KNOWN_FAILING: ReadonlySet<string> = new Set<string>([])

async function checkRow(row: Row): Promise<void> {
  const coRoot = freshRoot(row.store, row.userSchema, row.setup)
  const co = await runCospec(row.argv, coRoot)
  const coOutcome = outcome(co, row.command, row.argv)
  const detail = `cospec exit ${co.exitCode}\nstdout: ${co.stdout.slice(0, 200)}\nstderr: ${co.stderr.slice(0, 300)}`
  if (row.cospecOnly !== undefined) {
    expect({ outcome: coOutcome, exit: co.exitCode }, detail).toEqual(row.cospecOnly)
  } else if (row.pending !== undefined) {
    const up = await runUpstream(row.argv, freshRoot(row.store, row.userSchema, row.setup))
    expect({ outcome: outcome(up, row.command, row.argv), exit: up.exitCode }).toEqual(
      row.pending.upstream,
    )
    expect({ outcome: coOutcome, exit: co.exitCode }, detail).toEqual(row.pending.cospec)
  } else {
    const upRoot = freshRoot(row.store, row.userSchema, row.setup)
    const up = await runUpstream(row.argv, upRoot)
    const upDetail = `openspec exit ${up.exitCode}\nstdout: ${up.stdout.slice(0, 200)}\nstderr: ${up.stderr.slice(0, 300)}`
    expect(
      { outcome: coOutcome, exit: co.exitCode, documents: documentCount(co.stdout) },
      `${detail}\n${upDetail}`,
    ).toEqual({
      outcome: outcome(up, row.command, row.argv),
      exit: up.exitCode,
      documents: documentCount(up.stdout),
    })
    row.check?.('openspec', upRoot, up)
  }
  row.check?.('cospec', coRoot, co)
  if (row.cospecStderr !== undefined) expect(co.stderr, detail).toContain(row.cospecStderr)
  // A relayed upstream answer never ships its bare `openspec` remedy.
  expect(co.stdout + co.stderr, detail).not.toContain(UPSTREAM_REDIRECT)
  // Nor the binary's own help screen: cospec prints its own.
  expect(co.stdout, detail).not.toMatch(/^Usage: openspec/m)
}

function register(rows: readonly Row[]): void {
  for (const row of rows) {
    const key = rowKey(row)
    const expectation =
      row.cospecOnly !== undefined
        ? 'cospec-only'
        : row.pending !== undefined
          ? `pending (${row.pending.owner})`
          : 'same'
    const name = `${expectation}: ${key || '(no argv)'}`
    if (KNOWN_FAILING.has(key)) test.failing(name, () => checkRow(row), 30_000)
    else test(name, () => checkRow(row), 30_000)
  }
}

describe('precedence matrix: -V/--version', () => register(VERSION_ROWS))
describe('precedence matrix: -h/--help', () => register(HELP_ROWS))
describe('precedence matrix: unknown options and commands', () => register(UNKNOWN_OPTION_ROWS))
describe('precedence matrix: --store values', () => register(VALUE_ROWS))
describe('precedence matrix: --store-path', () => register(STORE_PATH_ROWS))
describe('precedence matrix: threaded flags', () => register(THREADING_ROWS))
describe('precedence matrix: --store where upstream never declares it', () =>
  register(FORWARD_STORE_ROWS))
describe('precedence matrix: value positions', () => register(VALUE_POSITION_ROWS))
describe('precedence matrix: program-level tokens', () => register(PROGRAM_LEVEL_ROWS))
describe('precedence matrix: --store on a row that never reads it', () =>
  register(STORE_GLOBAL_ROWS))
describe('precedence matrix: forward wrapper guards', () => register(FORWARD_GUARD_ROWS))
describe('precedence matrix: status --json documents', () => register(STATUS_JSON_ROWS))
describe('precedence matrix: new without its schema', () => register(NEW_SCHEMA_ROWS))
describe('precedence matrix: new refusals in both modes', () => register(NEW_REFUSAL_ROWS))
describe('precedence matrix: missing required arguments', () => register(MISSING_ARGUMENT_ROWS))
describe('precedence matrix: status positional with --change or --all', () =>
  register(STATUS_POSITIONAL_ROWS))
describe('precedence matrix: --store-path where upstream never declares it', () =>
  register(UNDECLARED_STORE_PATH_ROWS))
describe('precedence matrix: forward commander refusals', () => register(FORWARD_REFUSAL_ROWS))
describe('precedence matrix: short-option clusters', () => register(SHORT_CLUSTER_ROWS))
describe('precedence matrix: -- terminators', () => register(TERMINATOR_ROWS))
describe('precedence matrix: a bare help token', () => register(HELP_TOKEN_ROWS))
describe('precedence matrix: cospec-only rows', () => register(COSPEC_ONLY_ROWS))
describe('precedence matrix: program-level help [command]', () => register(HELP_COMMAND_ROWS))
describe('precedence matrix: pending spellings', () => register(PENDING_ROWS))

describe('precedence matrix: new with a user-level schema and no $XDG_DATA_HOME', () => {
  test('the binary falls back to ~/.local/share/openspec/schemas, and so does cospec', async () => {
    const root = freshRoot(false, 'data')
    // Unset in the child whatever the suite's own environment holds: the
    // sandbox's value and an ambient one alike.
    const co = await cospec(['new', 'feat', 'h1'], {
      cwd: root,
      env: oracleEnv(root),
      unset: ['XDG_DATA_HOME'],
    })
    expect(co.exitCode, co.stderr).toBe(0)
    expect(readFileSync(join(root, 'openspec/changes/h1/.openspec.yaml'), 'utf8')).toMatch(
      /^schema: feat$/m,
    )
  }, 30_000)
})

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
      ...THREADING_ROWS,
      ...FORWARD_STORE_ROWS,
      ...VALUE_POSITION_ROWS,
      ...PROGRAM_LEVEL_ROWS,
      ...STORE_GLOBAL_ROWS,
      ...FORWARD_GUARD_ROWS,
      ...STATUS_JSON_ROWS,
      ...NEW_SCHEMA_ROWS,
      ...NEW_REFUSAL_ROWS,
      ...MISSING_ARGUMENT_ROWS,
      ...STATUS_POSITIONAL_ROWS,
      ...UNDECLARED_STORE_PATH_ROWS,
      ...FORWARD_REFUSAL_ROWS,
      ...SHORT_CLUSTER_ROWS,
      ...TERMINATOR_ROWS,
      ...HELP_TOKEN_ROWS,
      ...COSPEC_ONLY_ROWS,
      ...HELP_COMMAND_ROWS,
      ...PENDING_ROWS,
    ].map(rowKey)
    expect(new Set(all).size).toBe(all.length)
    // Each pending row's surface is owned in parity-pending.yaml by the same slug.
    const owned = (
      parse(readFileSync(join(import.meta.dir, 'parity-pending.yaml'), 'utf8')) as {
        kind: string
        path?: string[]
        owner: string
      }[]
    ).filter((pe) => pe.kind === 'command')
    for (const row of PENDING_ROWS)
      expect(
        owned.some((pe) => pe.path?.join(' ') === row.argv[0] && pe.owner === row.pending!.owner),
        row.argv.join(' '),
      ).toBe(true)
    expect(all.length).toBeGreaterThanOrEqual(30)
    for (const key of KNOWN_FAILING) expect(all).toContain(key)
  })
})
