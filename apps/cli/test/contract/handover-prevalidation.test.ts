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
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { run } from '../../src/cli.ts'
import { respellRemedies } from '../../src/core/remedies.ts'
import {
  CLI_ENTRY,
  cleanupAll,
  cospec,
  hashTree,
  mkTempRepo,
  openspecBinPath,
  type SpawnResult,
} from '../fixtures/support.ts'
import { documentCount, refusalKind } from './support/parse-class.ts'
import { type PtyRun, ptyRun, terminalText } from './support/pty.ts'
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

/** The fixture's files, minus the runtime's own cache under the sandboxed HOME. */
function treeHash(root: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(hashTree(root)).filter(([rel]) => !rel.startsWith('.oracle-home/.cache/')),
  )
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

/** [argv, whether a trailing `--json` keeps it a refusal of the same kind]. */
const MATRIX: readonly (readonly [argv: string[], json: boolean])[] = [
  [['workset', 'open', 'x', '--bogus'], true],
  // A trailing `--json` would be `--tool`'s value.
  [['workset', 'open', 'x', '--tool'], false],
  [['workset', 'open'], true],
  [['workset', 'open', 'x', 'y'], true],
  [['workset', 'open', 'x', '-zq'], true],
  [['workset', 'open', 'x', '--store-path', '/p'], true],
  [['config', 'edit', '--bogus'], true],
  // Upstream's config leaves declare no `--json`, so the binary names a
  // trailing `--json` as the unknown option ahead of an excess argument,
  // where cospec reads `--json` as its own global flag: those rows run
  // without it.
  [['config', 'edit', 'extra'], false],
  [['config', 'edit', '-zq'], true],
  [['config', 'edit', '--store-path', '/p'], true],
  [['config', 'profile', '--bogus'], true],
  [['config', 'profile', 'a', 'b'], false],
  [['config', 'profile', '-zq'], true],
  [['config', 'profile', '--store-path', '/p'], true],
  [['config', 'reset', '--all', '--bogus'], true],
  [['config', 'reset', '--all', 'extra'], false],
  // Commander splits `-yz` into `-y` and an unknown `-z`.
  [['config', 'reset', '--all', '-yz'], true],
  [['config', 'reset', '--all', '--store-path', '/p'], true],
]

describe('a terminal-handover leaf refuses its argv before the handover (ledger 6.1)', () => {
  for (const [argv, json] of MATRIX) {
    for (const withJson of json ? [false, true] : [false]) {
      const full = withJson ? [...argv, '--json'] : argv
      test(
        full.join(' '),
        async () => {
          await expectPrevalidated(full)
        },
        30_000,
      )
    }
  }
})

test('config edit --bogus --json: the refusal, no envelope (ledger 6.2)', async () => {
  const co = await expectPrevalidated(['config', 'edit', '--bogus', '--json'])
  expect(documentCount(co.stdout)).toBe(0)
}, 30_000)

// --- workset open --json (ledger 1.5, 1.6) ------------------------------------------

describe('workset open --json is refused as the binary refuses it', () => {
  for (const saved of [false, true]) {
    test(`workset open ${saved ? '<saved>' : 'x'} --json: one refusal document, nothing opened`, async () => {
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
      const before = treeHash(root)
      const co = await cospec(argv, { cwd: root, env: oracleEnv(root) })
      expect(treeHash(root)).toEqual(before)
      expect(co.exitCode, detail(co)).toBe(1)
      expect(documentCount(co.stdout), detail(co)).toBe(1)
      const doc = JSON.parse(co.stdout) as { status: { code: string; fix: string }[] }
      expect(doc).toEqual(JSON.parse(respellRemedies(up.stdout)) as typeof doc)
      expect(doc.status[0]!.code).toBe('workset_open_json_unsupported')
      expect(doc.status[0]!.fix).toContain('cospec workset list --json')
      expect(BARE_OPENSPEC.test(co.stdout + co.stderr), detail(co)).toBe(false)
    }, 30_000)
  }

  for (const argv of [
    ['workset', 'open', '--json'],
    ['workset', 'open', 'x', '--bogus', '--json'],
  ]) {
    test(`${argv.join(' ')}: commander's refusal, before any handover (ledger 1.6)`, async () => {
      await expectPrevalidated(argv)
    }, 30_000)
  }
})

// --- a leaf that cannot be interactive runs piped (ledger 6.3, 6.4) -----------------

describe('with no terminal the leaf runs piped and its answer is respelled', () => {
  for (const saved of [false, true]) {
    test(`workset open ${saved ? '<saved, no tool>' : '<unsaved>'} with stdin not a TTY`, async () => {
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
    }, 30_000)
  }

  test('config profile with stdout piped: the interactive-mode sentence respelled', async () => {
    const root = plainRoot()
    const up = await oracle(['config', 'profile'], root)
    const co = await cospec(['config', 'profile'], { cwd: root, env: oracleEnv(root) })
    expect(up.exitCode).toBe(1)
    expect(co.exitCode, detail(co)).toBe(1)
    expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
    expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
    expect(co.stderr).toContain('`cospec config profile core`')
  }, 30_000)
})

// --- review round 2: on a terminal, rows against the binary under Node -----------------

/** The binary under Node on a pseudo-terminal; its first-run completions tip off, as cospec's spawns have it. */
function ptyUpstream(argv: string[], root: string): Promise<PtyRun> {
  return ptyRun(['node', openspecBinPath(), ...argv], {
    cwd: root,
    env: { ...oracleEnv(root), OPENSPEC_NO_COMPLETIONS: '1' },
  })
}

function ptyCospec(argv: string[], root: string): Promise<PtyRun> {
  return ptyRun([process.execPath, CLI_ENTRY, ...argv], { cwd: root, env: oracleEnv(root) })
}

function ptyDetail(pty: PtyRun): string {
  return `exit ${pty.exitCode}\noutput: ${JSON.stringify(pty.output)}`
}

/** The sandbox's saved-worksets file, as `workset list` reads it. */
function worksetsFile(root: string): string {
  return join(root, '.oracle-home', '.local', 'share', 'openspec', 'worksets', 'worksets.yaml')
}

function writeWorksets(root: string, body: string): void {
  mkdirSync(dirname(worksetsFile(root)), { recursive: true })
  writeFileSync(worksetsFile(root), body)
}

describe('on a terminal, a workset the binary refuses is answered as it refuses it', () => {
  const cases: [label: string, body: string][] = [
    ['an unreadable worksets file', 'version: 2\nworksets: {}\n'],
    [
      'a member path no stat can read',
      'version: 1\nworksets:\n  w1:\n    members:\n      - name: m\n        path: "/a\\0b"\n',
    ],
  ]
  for (const [label, body] of cases) {
    test(`workset open w1 with ${label}`, async () => {
      const root = plainRoot()
      writeWorksets(root, body)
      const up = await ptyUpstream(['workset', 'open', 'w1'], root)
      const co = await ptyCospec(['workset', 'open', 'w1'], root)
      expect(up.exitCode, ptyDetail(up)).toBe(1)
      expect(co.exitCode, ptyDetail(co)).toBe(1)
      expect(terminalText(co.output), ptyDetail(co)).toBe(respellRemedies(terminalText(up.output)))
      expect(BARE_OPENSPEC.test(co.output), ptyDetail(co)).toBe(false)
    }, 30_000)
  }
})

describe('on a terminal, config profile hands over only when the binary would prompt', () => {
  test.failing(
    'config --scope project profile: the binary’s refusal, respelled',
    async () => {
      const root = plainRoot()
      const argv = ['config', '--scope', 'project', 'profile']
      const up = await ptyUpstream(argv, root)
      const co = await ptyCospec(argv, root)
      expect(up.exitCode, ptyDetail(up)).toBe(1)
      expect(co.exitCode, ptyDetail(co)).toBe(1)
      expect(terminalText(co.output), ptyDetail(co)).toBe(respellRemedies(terminalText(up.output)))
    },
    30_000,
  )
})

describe('a prompt whose terminal input ends (Ctrl-D) is cancelled as the binary cancels it', () => {
  for (const argv of [
    ['config', 'reset', '--all'],
    ['config', 'profile'],
  ]) {
    test(`${argv.join(' ')}: the binary’s cancellation line and its exit code`, async () => {
      const root = plainRoot()
      const before = treeHash(root)
      const up = await ptyUpstream(argv, root)
      expect(treeHash(root)).toEqual(before)
      const co = await ptyCospec(argv, root)
      expect(treeHash(root)).toEqual(before)
      expect(up.exitCode, ptyDetail(up)).toBe(130)
      expect(co.exitCode, ptyDetail(co)).toBe(up.exitCode)
      expect(terminalText(co.output), ptyDetail(co)).toBe(respellRemedies(terminalText(up.output)))
    }, 30_000)
  }
})

/** `argv` with `input` on a piped stdin (or none), outside any terminal. */
async function piped(cmd: string[], root: string, input: string | undefined): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, {
    cwd: root,
    stdin: input === undefined ? 'ignore' : new Blob([input]),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...oracleEnv(root), OPENSPEC_NO_COMPLETIONS: '1' },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

describe('config reset --all with no terminal on stdin exits as the binary exits', () => {
  for (const input of [undefined, 'y\n']) {
    // Handed over under the preload, an empty stdin is cancelled already; an
    // answer waiting on the pipe still reaches the confirm under Bun.
    const row = input === undefined ? test : test.failing
    row(
      `stdin ${input === undefined ? 'empty' : 'piped “y”'}: cancelled, nothing reset`,
      async () => {
        const root = plainRoot()
        const argv = ['config', 'reset', '--all']
        const before = treeHash(root)
        const up = await piped(['node', openspecBinPath(), ...argv], root, input)
        expect(treeHash(root)).toEqual(before)
        const co = await piped([process.execPath, CLI_ENTRY, ...argv], root, input)
        expect(treeHash(root)).toEqual(before)
        expect(up.exitCode, detail(up)).toBe(130)
        expect(co.exitCode, detail(co)).toBe(up.exitCode)
        expect(terminalText(co.stdout), detail(co)).toBe(terminalText(respellRemedies(up.stdout)))
        expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
      },
      30_000,
    )
  }
})

// --- review round 2: `config <leaf> <extra-arg> --json` (design D13) --------------------

describe('config <leaf> <extra> --json: cospec’s --json is its own global flag (design D13)', () => {
  // The binary's config leaves declare no `--json`, so it names `--json` as
  // the unknown option; cospec reads it as its global flag and refuses the
  // excess argument. Both refuse before anything runs, exit 1.
  for (const argv of [
    ['config', 'edit', 'extra', '--json'],
    ['config', 'profile', 'a', 'b', '--json'],
    ['config', 'reset', '--all', 'extra', '--json'],
  ]) {
    test(
      argv.join(' '),
      async () => {
        const root = plainRoot()
        const up = await oracle(argv, root, { runtime: 'node' })
        const co = await dispatch(argv, root)
        expect(up.exitCode, detail(up)).toBe(1)
        expect(refusalKind(up, 'config', argv), detail(up)).toBe('unknown-option')
        expect(subject(up.stderr)).toBe('--json')
        expect(co.handovers, detail(co)).toEqual([])
        expect(co.exitCode, detail(co)).toBe(1)
        expect(co.stdout, detail(co)).toBe('')
        expect(refusalKind(co, 'config', argv), detail(co)).toBe('too-many')
      },
      30_000,
    )
  }
})
