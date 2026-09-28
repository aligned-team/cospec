// Terminal-handover pre-validation (change `passthrough-json-and-doctor`,
// ledger 1.5, 1.6, 6.1–6.4, design decisions 2 and 8). `workset open`,
// `config edit`, `config profile` and `config reset --all` hand the terminal
// to the binary with inherited stdio, where nothing cospec relays can respell
// what it prints — so each refuses its argv before any handover, on cospec's
// own streams, as the binary would refuse it.
//
// The refusal matrix runs cospec's dispatcher in-process with `Bun.spawn`
// wrapped: a piped spawn (the version check, a pre-flight) runs for real, and
// a spawn with inherited stdin — a handover — is recorded and never started.
// A refusal is compared with the binary's by kind and subject (the table
// parser answers in cospec's own dialect, `cospec config edit: unknown option
// '--bogus'`, where commander says `error: unknown option '--bogus'`), with
// the exit code and an empty stdout.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { run } from '../../src/cli.ts'
import { respellRemedies } from '../../src/core/remedies.ts'
import { cleanupAll, cospec, hashTree, mkTempRepo, type SpawnResult } from '../fixtures/support.ts'
import { documentCount, refusalKind } from './support/parse-class.ts'
import { oracle, oracleEnv, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

let template: string

beforeAll(async () => {
  template = await scaffoldOracleRoot()
}, 60_000)

/** A bare `openspec` command a user could copy and run outside cospec. */
const BARE_OPENSPEC = /\bopenspec [a-z-]/

function plainRoot(): string {
  const dir = mkTempRepo()
  cpSync(join(template, 'openspec'), join(dir, 'openspec'), { recursive: true })
  return dir
}

function detail(run: SpawnResult): string {
  return `exit ${run.exitCode}\nstdout: ${run.stdout}\nstderr: ${run.stderr}`
}

interface Recorded extends SpawnResult {
  /** Every spawn that inherited stdin: a terminal handover. */
  handovers: string[][]
}

/**
 * `cospec <argv>` through the dispatcher in-process, in `root`'s oracle
 * sandbox, with every handover recorded instead of started.
 */
async function dispatch(argv: string[], root: string): Promise<Recorded> {
  const handovers: string[][] = []
  let stdout = ''
  let stderr = ''
  const originalSpawn = Bun.spawn
  const originalOut = process.stdout.write
  const originalErr = process.stderr.write
  const originalEnv = { ...process.env }
  Object.assign(process.env, oracleEnv(root))
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], opts: { stdin?: unknown }) => {
    if (opts?.stdin !== 'inherit') return originalSpawn(cmd, opts as never)
    handovers.push(cmd)
    return { exited: Promise.resolve(0) }
  }
  process.stdout.write = ((chunk: unknown) => {
    stdout += String(chunk)
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((chunk: unknown) => {
    stderr += String(chunk)
    return true
  }) as typeof process.stderr.write
  try {
    const exitCode = await run(['--cwd', root, ...argv])
    return { exitCode, stdout, stderr, handovers }
  } finally {
    Bun.spawn = originalSpawn
    process.stdout.write = originalOut
    process.stderr.write = originalErr
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key]
    Object.assign(process.env, originalEnv)
  }
}

/** The option a refusal names (`--bogus`, `-z`, `--tool`), or the argument. */
function subject(stderr: string): string | undefined {
  return /'(-[\w-]+|[\w-]+)(?:[ =][^']*)?'/.exec(stderr)?.[1]
}

/** Asserts cospec refused `argv` as the binary did, before any handover. */
async function expectPrevalidated(argv: string[]): Promise<Recorded> {
  const root = plainRoot()
  const up = await oracle(argv, root, { runtime: 'node' })
  const co = await dispatch(argv, root)
  expect(up.exitCode, detail(up)).toBe(1)
  const kind = refusalKind(up, argv[0]!, argv)
  expect(kind, detail(up)).toBeDefined()
  expect(co.handovers, detail(co)).toEqual([])
  expect(co.exitCode, detail(co)).toBe(1)
  expect(co.stdout, detail(co)).toBe('')
  expect(refusalKind(co, argv[0]!, argv), detail(co)).toBe(kind)
  if (kind !== 'store-path' && kind !== 'too-many')
    expect(subject(co.stderr), detail(co)).toBe(subject(up.stderr))
  expect(BARE_OPENSPEC.test(co.stderr), detail(co)).toBe(false)
  return co
}

// --- the refusal matrix (ledger 6.1, 6.2) ----------------------------------------

/**
 * [argv, whether a trailing `--json` keeps it a refusal of the same kind,
 * whether cospec already refused it before this change]. The `--store-path`
 * rows were answered before any handover already (unknown-option-contract
 * design decision 2), and `config profile a b` names a preset, so it was
 * never a handover.
 */
const MATRIX: readonly (readonly [argv: string[], json: boolean, guard?: true])[] = [
  [['workset', 'open', 'x', '--bogus'], true],
  // A trailing `--json` would be `--tool`'s value.
  [['workset', 'open', 'x', '--tool'], false],
  [['workset', 'open'], true],
  [['workset', 'open', 'x', 'y'], true],
  [['workset', 'open', 'x', '-zq'], true],
  [['workset', 'open', 'x', '--store-path', '/p'], true, true],
  [['config', 'edit', '--bogus'], true],
  // Upstream's config leaves declare no `--json`, so the binary names a
  // trailing `--json` as the unknown option ahead of an excess argument,
  // where cospec reads `--json` as its own global flag: those rows run
  // without it.
  [['config', 'edit', 'extra'], false],
  [['config', 'edit', '-zq'], true],
  [['config', 'edit', '--store-path', '/p'], true, true],
  [['config', 'profile', '--bogus'], true],
  [['config', 'profile', 'a', 'b'], false, true],
  [['config', 'profile', '-zq'], true],
  [['config', 'profile', '--store-path', '/p'], true, true],
  [['config', 'reset', '--all', '--bogus'], true],
  [['config', 'reset', '--all', 'extra'], false],
  // Commander splits `-yz` into `-y` and an unknown `-z`.
  [['config', 'reset', '--all', '-yz'], true],
  [['config', 'reset', '--all', '--store-path', '/p'], true, true],
]

describe('a terminal-handover leaf refuses its argv before the handover (ledger 6.1)', () => {
  for (const [argv, json, guard] of MATRIX) {
    for (const withJson of json ? [false, true] : [false]) {
      const full = withJson ? [...argv, '--json'] : argv
      const row = guard === true ? test : test.failing
      row(
        full.join(' '),
        async () => {
          await expectPrevalidated(full)
        },
        30_000,
      )
    }
  }
})

test.failing(
  'config edit --bogus --json: the refusal, no envelope (ledger 6.2)',
  async () => {
    const co = await expectPrevalidated(['config', 'edit', '--bogus', '--json'])
    expect(documentCount(co.stdout)).toBe(0)
  },
  30_000,
)

// --- workset open --json (ledger 1.5, 1.6) ------------------------------------------

describe('workset open --json is refused as the binary refuses it', () => {
  for (const saved of [false, true]) {
    test.failing(
      `workset open ${saved ? '<saved>' : 'x'} --json: one refusal document, nothing opened`,
      async () => {
        const root = plainRoot()
        const member = join(root, 'member')
        mkdirSync(member)
        const name = saved ? 'w1' : 'x'
        if (saved) {
          const created = await oracle(['workset', 'create', 'w1', '--member', member], root)
          expect(created.exitCode, detail(created)).toBe(0)
        }
        const argv = ['workset', 'open', name, '--json']
        const up = await oracle(argv, root)
        const before = hashTree(root)
        const co = await cospec(argv, { cwd: root, env: oracleEnv(root) })
        expect(hashTree(root)).toEqual(before)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(documentCount(co.stdout), detail(co)).toBe(1)
        const doc = JSON.parse(co.stdout) as { status: { code: string; fix: string }[] }
        expect(doc).toEqual(JSON.parse(respellRemedies(up.stdout)) as typeof doc)
        expect(doc.status[0]!.code).toBe('workset_open_json_unsupported')
        expect(doc.status[0]!.fix).toContain('cospec workset list --json')
        expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
      },
      30_000,
    )
  }

  for (const argv of [
    ['workset', 'open', '--json'],
    ['workset', 'open', 'x', '--bogus', '--json'],
  ]) {
    test.failing(
      `${argv.join(' ')}: commander's refusal, before any handover (ledger 1.6)`,
      async () => {
        await expectPrevalidated(argv)
      },
      30_000,
    )
  }
})

// --- a leaf that cannot be interactive runs piped (ledger 6.3, 6.4) -----------------

describe('with no terminal the leaf runs piped and its answer is respelled', () => {
  for (const saved of [false, true]) {
    test.failing(
      `workset open ${saved ? '<saved, no tool>' : '<unsaved>'} with stdin not a TTY`,
      async () => {
        const root = plainRoot()
        const member = join(root, 'member')
        mkdirSync(member)
        if (saved) {
          const created = await oracle(['workset', 'create', 'w1', '--member', member], root)
          expect(created.exitCode, detail(created)).toBe(0)
        }
        const argv = ['workset', 'open', saved ? 'w1' : 'nope']
        const up = await oracle(argv, root)
        const co = await cospec(argv, { cwd: root, env: oracleEnv(root) })
        expect(up.exitCode).toBe(1)
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
        expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
        expect(co.stderr).toContain('cospec workset')
        expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
      },
      30_000,
    )
  }

  test.failing(
    'config profile with stdout piped: the interactive-mode sentence respelled',
    async () => {
      const root = plainRoot()
      const up = await oracle(['config', 'profile'], root)
      const co = await cospec(['config', 'profile'], { cwd: root, env: oracleEnv(root) })
      expect(up.exitCode).toBe(1)
      expect(co.exitCode, detail(co)).toBe(1)
      expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
      expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
      expect(co.stderr).toContain('`cospec config profile core`')
    },
    30_000,
  )
})
