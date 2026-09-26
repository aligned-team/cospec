// The unknown-option differential (change `unknown-option-contract`, ledger
// 1.7, 2.2, 2.3, 5.1–5.3): the same argv runs through `cospec` and the pinned
// binary, each in its own copy of one oracle fixture root, and both must give
// the same accept-or-reject answer.
//
// Each run is classed (design decision 7):
//   parse-rejected  stderr carries an unknown-option, argument-missing,
//                   too-many-arguments or `--store-path` refusal (either
//                   dialect: commander's `error: …` or cospec's
//                   `cospec <command>: …`); upstream's `error: unknown command`
//                   for a cospec-native command; a `--store-path` JSON
//                   envelope; or, for a cospec row marked `json: 'refused'`,
//                   its one-document `{ok: false}` `--json` refusal
//   parsed          anything else, whatever the exit code
// Exit codes are compared only when both runs are parse-rejected:
// `validate --type change x` exits 1 in both tools today for different reasons,
// and the class split is what keeps the comparison honest.
//
// Rows carry `expect`:
//   same         both tools land in the same class
//   cospec-only  cospec parses a flag of its own; the binary parse-rejects it
//   pending      cospec refuses with `'<flag>' is not supported yet` and exit 1
//                (the binary is not consulted: the flag is owed to a later change)
//
// Every row above ran through `test.todo` while its command was still off the
// table parser (groups 4-6 un-skipped them one command at a time); by
// close-out every row is a plain `test(...)` and no `test.todo` remains in
// this file (ledger 7.6, tasks 9.2).

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import pkg from '../../package.json'
import { COMMAND_TABLE } from '../../src/core/command-table.ts'
import { cleanupAll, cospec, hashTree, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
import { oracle, oracleEnv, oracleJson, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** A fresh copy of the scaffolded fixture's `openspec/` tree. */
function freshRoot(): string {
  const dir = mkTempRepo()
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  return dir
}

/** The fixture's files, minus the sandboxed HOME the oracle env creates. */
function treeHash(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hashTree(root)).filter(([rel]) => !rel.startsWith('.oracle-home/')),
  )
}

function runCospec(argv: string[], root: string): Promise<SpawnResult> {
  return cospec(argv, { cwd: root, env: oracleEnv(root) })
}

// --- classification ---------------------------------------------------------------

type ParseClass = 'parse-rejected' | 'parsed'

/** Design decision 10: the `table` rows that refuse the global `--json`, read from the table. */
const JSON_REFUSED: ReadonlySet<string> = new Set(
  COMMAND_TABLE.filter((row) => row.parse === 'table' && row.json === 'refused').map(
    (row) => row.name,
  ),
)

const REFUSAL_SHAPES: readonly RegExp[] = [
  /^error: unknown option '/m,
  /^error: option '.+' argument missing$/m,
  /^error: too many arguments/m,
  /^error: unknown command '/m,
  /^cospec [\w-]+(?: [\w-]+)?: unknown option '/m,
  /^cospec [\w-]+(?: [\w-]+)?: option '.+' argument missing$/m,
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

function classify(run: SpawnResult, command: string, argv: readonly string[]): ParseClass {
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

// --- rows ---------------------------------------------------------------------------

interface Row {
  argv: string[]
  /** The command whose row the argv exercises (for refusal text and `--json` refusal). */
  command: string
  expect: 'same' | 'cospec-only' | 'pending'
  /** Text cospec's stderr must contain, beyond the class check. */
  cospecStderr?: string
  /** For a `pending` row, the flag named in the refusal. */
  pendingFlag?: string
  /** Shapes the fixture before the run (and before the tree is hashed). */
  setup?: (root: string) => void
}

/**
 * A change literally named `change`, so `validate --type change x` would find
 * an item to validate if `--type` ever leaked its value into the positional.
 */
function addChangeNamedChange(root: string): void {
  const dir = join(root, 'openspec', 'changes', 'change')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, '.openspec.yaml'),
    'schema: chore\ncreated: 2026-09-25\nschemaVersion: 2\n',
  )
  writeFileSync(
    join(dir, 'proposal.md'),
    '# Proposal\n\n## Why\n\nA fixture change named change.\n\n## What Changes\n\n- Nothing.\n',
  )
}

const unknown = (command: string, option: string): string =>
  `cospec ${command}: unknown option '${option}'`
const missing = (command: string, flag: string, placeholder: string): string =>
  `cospec ${command}: option '${flag} ${placeholder}' argument missing`
const suggest = (flag: string): string => `Did you mean '${flag}'?`

/** Rows on `table` commands the pinned binary also has (ledger 5.1). */
const TABLE_ROWS: readonly Row[] = [
  // init
  {
    argv: ['init', '--bogus', '.'],
    command: 'init',
    expect: 'same',
    cospecStderr: unknown('init', '--bogus'),
  },
  { argv: ['init', '--no-animation', '.'], command: 'init', expect: 'same' },
  {
    argv: ['init', '--harness'],
    command: 'init',
    expect: 'same',
    cospecStderr: missing('init', '--harness', '<list>'),
  },
  { argv: ['init', '--harness', 'none', '.'], command: 'init', expect: 'cospec-only' },
  // update
  {
    argv: ['update', '--bogus'],
    command: 'update',
    expect: 'same',
    cospecStderr: unknown('update', '--bogus'),
  },
  { argv: ['update', '--check'], command: 'update', expect: 'cospec-only' },
  // doctor
  {
    argv: ['doctor', '--bogus'],
    command: 'doctor',
    expect: 'same',
    cospecStderr: unknown('doctor', '--bogus'),
  },
  // new
  {
    argv: ['new', '--bogus'],
    command: 'new',
    expect: 'same',
    cospecStderr: unknown('new', '--bogus'),
  },
  // Upstream has no `new <type>`: it answers `error: unknown command 'feat'`.
  {
    argv: ['new', 'feat', 'x', '--description'],
    command: 'new',
    expect: 'same',
    cospecStderr: missing('new', '--description', '<text>'),
  },
  // validate
  {
    argv: ['validate', '--typo', 'x'],
    command: 'validate',
    expect: 'same',
    cospecStderr: suggest('--type'),
  },
  {
    argv: ['validate', '--bogus'],
    command: 'validate',
    expect: 'same',
    cospecStderr: unknown('validate', '--bogus'),
  },
  { argv: ['validate', '--fast'], command: 'validate', expect: 'cospec-only' },
  // status
  {
    argv: ['status', '--schem', 'custom'],
    command: 'status',
    expect: 'same',
    cospecStderr: suggest('--schema'),
  },
  {
    argv: ['status', '--bogus'],
    command: 'status',
    expect: 'same',
    cospecStderr: unknown('status', '--bogus'),
  },
  {
    argv: ['status', '--change'],
    command: 'status',
    expect: 'same',
    cospecStderr: missing('status', '--change', '<slug>'),
  },
  // list
  {
    argv: ['list', '--bogus'],
    command: 'list',
    expect: 'same',
    cospecStderr: unknown('list', '--bogus'),
  },
  {
    argv: ['list', '--sortt'],
    command: 'list',
    expect: 'same',
    cospecStderr: suggest('--sort'),
  },
  { argv: ['list', '--changes'], command: 'list', expect: 'same' },
  { argv: ['list', '--blocked'], command: 'list', expect: 'cospec-only' },
  // instructions
  {
    argv: ['instructions', 'proposal', '--bogus'],
    command: 'instructions',
    expect: 'same',
    cospecStderr: unknown('instructions', '--bogus'),
  },
  {
    argv: ['instructions', 'proposal', '--change'],
    command: 'instructions',
    expect: 'same',
    cospecStderr: missing('instructions', '--change', '<slug>'),
  },
  {
    argv: ['instructions', 'apply', '--change', 'x', '--allow-soft'],
    command: 'instructions',
    expect: 'cospec-only',
  },
  // archive
  { argv: ['archive', 'c', '-y'], command: 'archive', expect: 'same' },
  { argv: ['archive', 'c', '--yes'], command: 'archive', expect: 'same' },
  {
    argv: ['archive', '--bogus', 'c'],
    command: 'archive',
    expect: 'same',
    cospecStderr: unknown('archive', '--bogus'),
  },
  { argv: ['archive', '--force-incomplete', 'x'], command: 'archive', expect: 'cospec-only' },
  // context
  {
    argv: ['context', '--bogus'],
    command: 'context',
    expect: 'same',
    cospecStderr: unknown('context', '--bogus'),
  },
  {
    argv: ['context', '--code-workspace'],
    command: 'context',
    expect: 'same',
    cospecStderr: missing('context', '--code-workspace', '<path>'),
  },
  // view
  {
    argv: ['view', '--bogus'],
    command: 'view',
    expect: 'same',
    cospecStderr: unknown('view', '--bogus'),
  },
  { argv: ['view', '--json'], command: 'view', expect: 'same' },
  // completion
  {
    argv: ['completion', '--bogus'],
    command: 'completion',
    expect: 'same',
    cospecStderr: unknown('completion', '--bogus'),
  },
  { argv: ['completion', '--json'], command: 'completion', expect: 'same' },
  // feedback: `--upstream --json` refuses before any relay, so no run reaches gh.
  {
    argv: ['feedback', '--bogus', 'm'],
    command: 'feedback',
    expect: 'same',
    cospecStderr: unknown('feedback', '--bogus'),
  },
  {
    argv: ['feedback', 'm', '--body'],
    command: 'feedback',
    expect: 'same',
    cospecStderr: missing('feedback', '--body', '<text>'),
  },
  { argv: ['feedback', 'm', '--upstream', '--json'], command: 'feedback', expect: 'cospec-only' },
  // too many arguments (the BREAKING note names these)
  {
    argv: ['list', 'a'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['validate', 'a', 'b'],
    command: 'validate',
    expect: 'same',
    cospecStderr: 'cospec validate: too many arguments. Expected 1 argument but got 2.',
  },
]

/**
 * Rows on `table` commands the pinned binary does not have. The binary answers
 * `error: unknown command`, so a `same` row asserts both refuse at parse time
 * and `cospecStderr` pins cospec's own refusal.
 */
const NATIVE_ROWS: readonly Row[] = [
  {
    argv: ['apply', '--bogus', 'x'],
    command: 'apply',
    expect: 'same',
    cospecStderr: unknown('apply', '--bogus'),
  },
  { argv: ['apply', '--allow-soft', 'x'], command: 'apply', expect: 'cospec-only' },
  {
    argv: ['migrate', '--bogus', 'x'],
    command: 'migrate',
    expect: 'same',
    cospecStderr: unknown('migrate', '--bogus'),
  },
  {
    argv: ['sync-blockers', '--bogus'],
    command: 'sync-blockers',
    expect: 'same',
    cospecStderr: unknown('sync-blockers', '--bogus'),
  },
  {
    argv: ['sync-blockers', '--change'],
    command: 'sync-blockers',
    expect: 'same',
    cospecStderr: missing('sync-blockers', '--change', '<slug>'),
  },
  { argv: ['sync-blockers', '--check'], command: 'sync-blockers', expect: 'cospec-only' },
  {
    argv: ['check-commit', '--bogus'],
    command: 'check-commit',
    expect: 'same',
    cospecStderr: unknown('check-commit', '--bogus'),
  },
  // Excess positionals main silently ignored (the BREAKING note names these).
  {
    argv: ['sync-blockers', 'demo'],
    command: 'sync-blockers',
    expect: 'same',
    cospecStderr: 'cospec sync-blockers: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['check-commit', 'a', 'b'],
    command: 'check-commit',
    expect: 'same',
    cospecStderr: 'cospec check-commit: too many arguments. Expected 1 argument but got 2.',
  },
  {
    argv: ['__complete', '--bogus', 'changes'],
    command: '__complete',
    expect: 'same',
    cospecStderr: unknown('__complete', '--bogus'),
  },
]

/**
 * Every flag, positional and subcommand the table marks pending on a `table`
 * command (ledger 5.2); `pendingFlag` is the token the refusal names.
 */
const PENDING_ROWS: readonly Row[] = [
  {
    argv: ['init', '--tools', 'claude', '.'],
    command: 'init',
    expect: 'pending',
    pendingFlag: '--tools',
  },
  {
    argv: ['init', '--language', 'fr', '.'],
    command: 'init',
    expect: 'pending',
    pendingFlag: '--language',
  },
  {
    argv: ['init', '--profile', 'core', '.'],
    command: 'init',
    expect: 'pending',
    pendingFlag: '--profile',
  },
  {
    argv: ['init', '--copilot-cloud', '.'],
    command: 'init',
    expect: 'pending',
    pendingFlag: '--copilot-cloud',
  },
  {
    argv: ['init', '--no-copilot-cloud', '.'],
    command: 'init',
    expect: 'pending',
    pendingFlag: '--no-copilot-cloud',
  },
  {
    argv: ['validate', '--type', 'change', 'x'],
    command: 'validate',
    expect: 'pending',
    pendingFlag: '--type',
    setup: addChangeNamedChange,
  },
  {
    argv: ['validate', '--report', 'findings', '--all'],
    command: 'validate',
    expect: 'pending',
    pendingFlag: '--report',
  },
  {
    argv: ['validate', '--concurrency', '4', '--all'],
    command: 'validate',
    expect: 'pending',
    pendingFlag: '--concurrency',
  },
  {
    argv: ['status', '--schema', 'custom'],
    command: 'status',
    expect: 'pending',
    pendingFlag: '--schema',
  },
  {
    argv: ['list', '--sort', 'name'],
    command: 'list',
    expect: 'pending',
    pendingFlag: '--sort',
  },
  {
    argv: ['archive', '--no-validate', 'x'],
    command: 'archive',
    expect: 'pending',
    pendingFlag: '--no-validate',
  },
  {
    argv: ['instructions', 'proposal', '--schema', 'spec-driven', '--change', 'x'],
    command: 'instructions',
    expect: 'pending',
    pendingFlag: '--schema',
  },
  // Pending positionals and subcommands (the BREAKING note names these):
  // `update .` ran against the cwd on main and upstream, but `[path]` is owed
  // to `upstream-spellings`.
  { argv: ['update', '.'], command: 'update', expect: 'pending', pendingFlag: '[path]' },
  {
    argv: ['update', '--force', '.'],
    command: 'update',
    expect: 'pending',
    pendingFlag: '[path]',
  },
  { argv: ['new', 'change', 'x'], command: 'new', expect: 'pending', pendingFlag: 'change' },
  {
    argv: ['completion', 'generate', 'bash'],
    command: 'completion',
    expect: 'pending',
    pendingFlag: 'generate',
  },
  {
    argv: ['completion', 'install'],
    command: 'completion',
    expect: 'pending',
    pendingFlag: 'install',
  },
  {
    argv: ['completion', 'uninstall'],
    command: 'completion',
    expect: 'pending',
    pendingFlag: 'uninstall',
  },
  // Upstream's hidden `__complete` also serves these two types.
  {
    argv: ['__complete', 'schemas'],
    command: '__complete',
    expect: 'pending',
    pendingFlag: 'schemas',
  },
  {
    argv: ['__complete', 'archived-changes'],
    command: '__complete',
    expect: 'pending',
    pendingFlag: 'archived-changes',
  },
]

/**
 * One unknown-option row per `forward` command (ledger 5.3): cospec adds no
 * refusal of its own, so the binary's answer must come back relayed.
 */
const FORWARD_ROWS: readonly Row[] = [
  {
    argv: ['show', 'foo', '--bogus'],
    command: 'show',
    expect: 'same',
    cospecStderr: "error: too many arguments for 'show'",
  },
  { argv: ['show', '--bogus'], command: 'show', expect: 'same' },
  {
    argv: ['templates', '--bogus'],
    command: 'templates',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['schemas', '--bogus'],
    command: 'schemas',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['schema', 'which', '--bogus'],
    command: 'schema',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['store', 'list', '--bogus'],
    command: 'store',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['workset', 'list', '--bogus'],
    command: 'workset',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
  {
    argv: ['config', 'path', '--bogus'],
    command: 'config',
    expect: 'same',
    cospecStderr: "error: unknown option '--bogus'",
  },
]

/**
 * After a `--` terminator every token is an operand, as upstream's commander
 * treats it: cospec's global flags (`--json`, `--no-color`, `-h/--help`,
 * `--cwd`, `--store`) must not be absorbed there, so each excess operand is
 * refused as too many arguments in both tools.
 */
const TERMINATOR_ROWS: readonly Row[] = [
  {
    argv: ['list', '--', '--json'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['list', '--', '--help'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['list', '--', '-h'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['list', '--', '--no-color'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 1.',
  },
  {
    argv: ['list', '--', '--store', 's'],
    command: 'list',
    expect: 'same',
    cospecStderr: 'cospec list: too many arguments. Expected 0 arguments but got 2.',
  },
  {
    argv: ['status', '--', '--cwd', '/x'],
    command: 'status',
    expect: 'same',
    cospecStderr: 'cospec status: too many arguments. Expected 1 argument but got 2.',
  },
  // Forward rows hand the binary the `--` and its operands verbatim.
  {
    argv: ['templates', '--', '--json'],
    command: 'templates',
    expect: 'same',
    cospecStderr: "error: too many arguments for 'templates'",
  },
  {
    argv: ['show', 'foo', '--', '--json'],
    command: 'show',
    expect: 'same',
    cospecStderr: "error: too many arguments for 'show'",
  },
]

/**
 * A global `--store`/`--cwd` given no value is refused as argument missing, as
 * upstream's per-command `--store <id>` is (and upstream refuses `--cwd`, which
 * it does not have, as an unknown option) — never run against the local repo.
 */
const GLOBAL_VALUE_ROWS: readonly Row[] = [
  {
    argv: ['list', '--store'],
    command: 'list',
    expect: 'same',
    cospecStderr: missing('list', '--store', '<id>'),
  },
  {
    argv: ['list', '--help', '--store'],
    command: 'list',
    expect: 'same',
    cospecStderr: missing('list', '--store', '<id>'),
  },
  {
    argv: ['list', '--bogus', '--store'],
    command: 'list',
    expect: 'same',
    cospecStderr: missing('list', '--store', '<id>'),
  },
  {
    argv: ['validate', 'x', '--store'],
    command: 'validate',
    expect: 'same',
    cospecStderr: missing('validate', '--store', '<id>'),
  },
  {
    argv: ['list', '--cwd'],
    command: 'list',
    expect: 'same',
    cospecStderr: missing('list', '--cwd', '<path>'),
  },
]

async function checkRow(row: Row): Promise<void> {
  const coRoot = freshRoot()
  row.setup?.(coRoot)
  const before = treeHash(coRoot)
  const co = await runCospec(row.argv, coRoot)
  const coClass = classify(co, row.command, row.argv)
  const detail = `cospec exit ${co.exitCode}, stderr: ${co.stderr.slice(0, 300)}`

  if (row.expect === 'pending') {
    expect(co.exitCode, detail).toBe(1)
    // Exact streams: a leaked value that reaches a lookup or a report shows up
    // here, not only as different message text.
    expect(co.stdout, 'a pending flag must print nothing on stdout').toBe('')
    expect(co.stderr).toBe(`cospec ${row.command}: '${row.pendingFlag}' is not supported yet\n`)
    expect(treeHash(coRoot), 'a pending flag must be refused before any work').toEqual(before)
    return
  }

  const up = await oracle(row.argv, freshRoot())
  const upClass = classify(up, row.command, row.argv)
  const upDetail = `openspec exit ${up.exitCode}, stderr: ${up.stderr.slice(0, 300)}`

  if (row.expect === 'cospec-only') {
    expect(coClass, detail).toBe('parsed')
    expect(upClass, upDetail).toBe('parse-rejected')
    return
  }

  expect({ cospec: coClass, openspec: upClass }, `${detail}\n${upDetail}`).toEqual({
    cospec: upClass,
    openspec: upClass,
  })
  if (upClass === 'parse-rejected') {
    expect(co.exitCode, detail).toBe(up.exitCode)
    expect(treeHash(coRoot), 'a parse refusal must happen before any work').toEqual(before)
  }
  if (row.cospecStderr !== undefined) expect(co.stderr).toContain(row.cospecStderr)
}

function register(rows: readonly Row[]): void {
  for (const row of rows) {
    const name = `${row.expect}: ${row.argv.join(' ')}`
    test(name, () => checkRow(row), 30_000)
  }
}

describe('unknown-option differential: table commands the binary also has', () => {
  register(TABLE_ROWS)
})

describe('unknown-option differential: cospec-native table commands', () => {
  register(NATIVE_ROWS)
})

describe('unknown-option differential: pending flags', () => {
  register(PENDING_ROWS)
})

describe('unknown-option differential: forward commands relay the binary', () => {
  register(FORWARD_ROWS)
})

describe('unknown-option differential: no global flag is absorbed after --', () => {
  register(TERMINATOR_ROWS)
})

describe('unknown-option differential: --store/--cwd refuse a missing or empty value', () => {
  register(GLOBAL_VALUE_ROWS)

  // Upstream answers an empty store id after parsing (`Store id must not be
  // empty`), so neither run is parse-rejected; both still exit 1 before any work.
  for (const argv of [
    ['list', '--store='],
    ['list', '--store', ''],
  ]) {
    test(`${argv.map((a) => (a === '' ? "''" : a)).join(' ')} exits 1 in both tools`, async () => {
      const root = freshRoot()
      const before = treeHash(root)
      const co = await runCospec(argv, root)
      const up = await oracle(argv, freshRoot())
      expect(up.exitCode, up.stderr).toBe(1)
      expect(up.stderr).toContain('Store id must not be empty')
      expect(co.exitCode, co.stderr).toBe(1)
      expect(co.stderr).toBe("cospec list: option '--store <id>' argument must not be empty\n")
      expect(co.stdout).toBe('')
      expect(treeHash(root)).toEqual(before)
    }, 30_000)
  }
})

// --- --store-path (ledger 2.2, 2.3) ------------------------------------------------

/** Upstream's post-command redirect text, respelled `openspec` → `cospec` and nothing else. */
async function expectedRedirect(): Promise<string> {
  const up = await oracle(['list', '--store-path', '/x'], freshRoot())
  expect(up.exitCode).toBe(1)
  expect(up.stderr).toContain('--store-path is not supported')
  return up.stderr.replaceAll('openspec', 'cospec')
}

describe('unknown-option differential: --store-path is refused with the redirect', () => {
  for (const argv of [
    ['list', '--store-path', '/x'],
    ['list', '--store-path=/x'],
    ['--store-path', '/x', 'list'],
    ['validate', '--store-path', '/x'],
    ['show', 'foo', '--store-path', '/x'],
  ]) {
    test(`${argv.join(' ')} prints upstream's redirect respelled, exits 1`, async () => {
      const text = await expectedRedirect()
      const root = freshRoot()
      const before = treeHash(root)
      const co = await runCospec(argv, root)
      expect(co.exitCode).toBe(1)
      expect(co.stderr).toBe(text)
      expect(co.stderr).not.toContain('openspec')
      expect(co.stdout).toBe('')
      expect(treeHash(root)).toEqual(before)
      // Upstream refuses in every position too (the pre-command form as a
      // plain unknown option), so the differential classes agree.
      const up = await oracle(argv, freshRoot())
      expect(classify(up, 'list', argv)).toBe('parse-rejected')
      expect(classify(co, 'list', argv)).toBe('parse-rejected')
      expect(co.exitCode).toBe(up.exitCode)
    }, 30_000)
  }

  test(`list --json --store-path /x prints one envelope matching upstream's status[0]`, async () => {
    const argv = ['list', '--json', '--store-path', '/x']
    const up = await oracle(argv, freshRoot())
    const co = await runCospec(argv, freshRoot())
    expect(up.exitCode).toBe(1)
    expect(co.exitCode).toBe(1)
    const upDoc = JSON.parse(up.stdout) as { status: Record<string, string>[] }
    const coDoc = JSON.parse(co.stdout) as { status: Record<string, string>[] }
    const respelled = Object.fromEntries(
      Object.entries(upDoc.status[0]!).map(([k, v]) => [k, v.replaceAll('openspec', 'cospec')]),
    )
    expect(coDoc.status[0]).toEqual(respelled)
    expect(coDoc.status[0]!['code']).toBe('store_path_not_supported')
    expect(coDoc.status[0]!['target']).toBe('store.id')
    expect(co.stdout).not.toContain('openspec')
  }, 30_000)
})

// --- -V/--version in any position ---------------------------------------------------

describe('unknown-option differential: -V/--version is honoured in any position', () => {
  // Upstream's program-level `-V, --version` wins after any subcommand, over
  // help, an unknown option and `--store-path`; each tool prints its own
  // version, exits 0, and does no work.
  for (const argv of [
    ['list', '--version'],
    ['list', '-V'],
    ['validate', 'x', '--version'],
    ['status', '-V'],
    ['view', '--version'],
    ['archive', 'x', '-V'],
    ['show', 'x', '--version'],
    ['--version', 'list'],
    ['list', '--bogus', '--version'],
    ['list', '--help', '-V'],
    ['list', '--json', '--version'],
    ['list', '--store-path', '/x', '--version'],
  ]) {
    test(`${argv.join(' ')} prints the version and exits 0 in both tools`, async () => {
      const root = freshRoot()
      const before = treeHash(root)
      const co = await runCospec(argv, root)
      const up = await oracle(argv, freshRoot())
      expect(up.exitCode, up.stderr).toBe(0)
      expect(up.stdout).toMatch(/^\d+\.\d+\.\d+\n$/)
      expect(co.exitCode, co.stderr).toBe(0)
      expect(co.stdout).toBe(`${pkg.version}\n`)
      expect(co.stderr).toBe('')
      expect(treeHash(root)).toEqual(before)
    }, 30_000)
  }

  test('a --version after a -- terminator is an operand, not a version request', async () => {
    const argv = ['list', '--', '--version']
    const co = await runCospec(argv, freshRoot())
    const up = await oracle(argv, freshRoot())
    expect(up.exitCode).toBe(1)
    expect(co.exitCode).toBe(1)
    expect(co.stdout).not.toBe(`${pkg.version}\n`)
    expect(classify(co, 'list', argv)).toBe(classify(up, 'list', argv))
  }, 30_000)
})

// --- classifier sanity -------------------------------------------------------------

function refusedRun(stderr: string, stdout = ''): SpawnResult {
  return { stdout, stderr, exitCode: 1 }
}

describe('unknown-option differential: the classifier', () => {
  test('recognises both dialects of each refusal shape', () => {
    for (const stderr of [
      "error: unknown option '--bogus'\n",
      "error: option '--sort <order>' argument missing\n",
      "error: too many arguments for 'show'. Expected 1 argument but got 2.\n",
      "error: unknown command 'apply'\n",
      "cospec list: unknown option '--bogus'\nDid you mean '--specs'?\n",
      "cospec status: option '--change <slug>' argument missing\n",
      'cospec show: too many arguments. Expected 1 argument but got 2.\n',
      '✖ Error: --store-path is not supported. Register the path …\n',
    ])
      expect(classify(refusedRun(stderr), 'list', [])).toBe('parse-rejected')
  })

  test('classes ordinary failures and pending refusals as parsed', () => {
    for (const stderr of [
      "cospec archive: unknown change 'c'\n",
      "cospec: unknown command '/x'\n",
      "cospec validate: '--type' is not supported yet\n",
      "✖ Error: Change 'c' not found.\n",
    ])
      expect(classify(refusedRun(stderr), 'archive', [])).toBe('parsed')
  })

  test('a --json refusal envelope counts only on a json-refused row', () => {
    const envelope = JSON.stringify({ version: 1, command: 'view', ok: false, message: 'x' })
    expect(classify(refusedRun('', envelope), 'view', ['view', '--json'])).toBe('parse-rejected')
    expect(classify(refusedRun('', envelope), 'view', ['view'])).toBe('parsed')
    const other = JSON.stringify({ version: 1, command: 'list', ok: false, message: 'x' })
    expect(classify(refusedRun('', other), 'list', ['list', '--json'])).toBe('parsed')
  })
})

// --- the oracle itself (ledger 5.4) ------------------------------------------------

describe('upstream oracle', () => {
  test('oracleJson returns the exit code and the one parsed document', async () => {
    const run = await oracleJson(['list', '--json'], template)
    expect(run.exitCode).toBe(0)
    expect(run.json).toMatchObject({ changes: [], root: { source: 'nearest' } })
  })

  test('oracleJson throws on a stdout that is not one JSON document', async () => {
    await expect(oracleJson(['list'], template)).rejects.toThrow('did not print one JSON document')
  })
})
