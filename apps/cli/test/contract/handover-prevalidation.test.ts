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
import { chmodSync, cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import { CTRL_C, CTRL_D, type PtyKey, type PtyRun, ptyRun, terminalText } from './support/pty.ts'
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

/** Extra environment for one pty run. */
interface PtyOptions {
  key?: PtyKey
  env?: Record<string, string>
}

/**
 * `root`'s sandbox as a user's terminal has it: no `CI` and no
 * `OPEN_SPEC_INTERACTIVE`, either of which makes `workset open` (the binary's
 * `isInteractive`, and cospec's port of it) run non-interactively — `CI` is
 * set on every CI runner, where a pty row would otherwise take another
 * branch than on a developer's machine.
 */
function terminalEnv(root: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { ...oracleEnv(root), ...extra }
  delete env.CI
  delete env.OPEN_SPEC_INTERACTIVE
  return env
}

/** The binary under Node on a pseudo-terminal; its first-run completions tip off, as cospec's spawns have it. */
function ptyUpstream(argv: string[], root: string, opts: PtyOptions = {}): Promise<PtyRun> {
  return ptyRun([NODE, openspecBinPath(), ...argv], {
    cwd: root,
    env: terminalEnv(root, { OPENSPEC_NO_COMPLETIONS: '1', ...opts.env }),
    key: opts.key,
  })
}

function ptyCospec(argv: string[], root: string, opts: PtyOptions = {}): Promise<PtyRun> {
  return ptyRun([process.execPath, CLI_ENTRY, ...argv], {
    cwd: root,
    env: terminalEnv(root, opts.env),
    key: opts.key,
  })
}

/** The `node` the rows run the binary under, resolved once, so a narrowed PATH still finds it. */
const NODE = Bun.which('node') ?? 'node'

/**
 * A PATH whose one opener is a `code` in `root` that does nothing: `workset
 * open`'s scan (`code`, `cursor`, `claude`, `codex` on PATH) finds exactly
 * it on every machine, a CI runner (none installed) and a developer's (any
 * installed) alike, so a saved workset's `Open with:` menu is drawn the same.
 */
function openerPath(root: string): string {
  const bin = join(root, '.opener-bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(join(bin, 'code'), '#!/bin/sh\nexit 0\n')
  chmodSync(join(bin, 'code'), 0o755)
  return [bin, dirname(NODE), '/usr/bin', '/bin'].join(':')
}

/** A saved workset `w1` in `root`, with one member directory. */
async function saveWorkset(root: string): Promise<void> {
  const member = join(root, 'member')
  mkdirSync(member)
  const created = await oracle(['workset', 'create', 'w1', '--member', member], root)
  expect(created.exitCode, detail(created)).toBe(0)
}

/** The text each leaf's first prompt draws, and so when a key is pressed at it. */
const PROMPT: Record<string, string> = {
  'config reset --all': 'Reset all configuration to defaults?',
  'config profile': 'What do you want to configure?',
  'workset open w1': 'Open with:',
}

/** `send` pressed at `argv`'s first prompt. */
function at(argv: string[], send: string): PtyKey {
  const after = PROMPT[argv.join(' ')]
  if (after === undefined) throw new Error(`no prompt text for ${argv.join(' ')}`)
  return { after, send }
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
  test('config --scope project profile: the binary’s refusal, respelled', async () => {
    const root = plainRoot()
    const argv = ['config', '--scope', 'project', 'profile']
    const up = await ptyUpstream(argv, root)
    const co = await ptyCospec(argv, root)
    expect(up.exitCode, ptyDetail(up)).toBe(1)
    expect(co.exitCode, ptyDetail(co)).toBe(1)
    expect(terminalText(co.output), ptyDetail(co)).toBe(respellRemedies(terminalText(up.output)))
  }, 30_000)
})

describe('a prompt cancelled at the keyboard (Ctrl-C, Ctrl-D) is cancelled as the binary cancels it', () => {
  // Both keys cancel the binary's prompt under Node on macOS and Linux alike
  // (130 and its cancellation line): Ctrl-C through inquirer's own SIGINT
  // handler, Ctrl-D by closing readline, which only the handover preload
  // answers under Bun (design D15). A terminal hangup is not pinned: the
  // binary under Node answers it differently per OS (ledger 16.2).
  for (const [keyName, send] of [
    ['Ctrl-C', CTRL_C],
    ['Ctrl-D', CTRL_D],
  ] as const)
    for (const argv of [
      ['config', 'reset', '--all'],
      ['config', 'profile'],
      ['workset', 'open', 'w1'],
    ]) {
      test(`${argv.join(' ')}, ${keyName}: the binary’s cancellation line and its exit code`, async () => {
        // Two roots: `workset open` writes its `.code-workspace` before it
        // prompts, so each run's writes are compared, not a shared tree.
        const [upRoot, coRoot] = [plainRoot(), plainRoot()]
        const env = async (root: string): Promise<Record<string, string>> => {
          if (argv[0] !== 'workset') return {}
          await saveWorkset(root)
          return { PATH: openerPath(root) }
        }
        const [upEnv, coEnv] = [await env(upRoot), await env(coRoot)]
        const upBefore = treeHash(upRoot)
        const coBefore = treeHash(coRoot)
        const up = await ptyUpstream(argv, upRoot, { key: at(argv, send), env: upEnv })
        const co = await ptyCospec(argv, coRoot, { key: at(argv, send), env: coEnv })
        const upChanged = changedPaths(upBefore, treeHash(upRoot))
        if (argv[0] === 'config') expect(upChanged).toEqual([])
        expect(changedPaths(coBefore, treeHash(coRoot))).toEqual(upChanged)
        expect(up.exitCode, ptyDetail(up)).toBe(130)
        expect(co.exitCode, ptyDetail(co)).toBe(up.exitCode)
        expect(terminalText(co.output), ptyDetail(co)).toBe(
          respellRemedies(terminalText(up.output)),
        )
      }, 30_000)
    }
})

// --- a handover whose output reader has exited ----------------------------------------

/**
 * `cmd` on a terminal, through `sh`, with one output stream a pipe whose
 * reader (`true`) exits at once — `cospec workset open w1 | head -0` — and the
 * other stream, and `cmd`'s exit code (`[rc=N]`), on the terminal. stdin stays
 * the terminal, so a handover leaf still hands over.
 */
function ptyClosed(
  closed: 'stdout' | 'stderr',
  cmd: string[],
  root: string,
  env: Record<string, string>,
): Promise<PtyRun> {
  const script =
    closed === 'stdout'
      ? '{ { "$@"; echo "[rc=$?]" >&3; } | true; } 3>&2'
      : '{ { "$@" 2>&1 1>&3; echo "[rc=$?]" >&3; } | true; } 3>&1'
  return ptyRun(['/bin/sh', '-c', script, 'sh', ...cmd], { cwd: root, env })
}

/** A saved workset `w1` whose first member folder is gone: `workset open` skips it on stderr. */
async function saveWorksetMissingPrimary(root: string): Promise<void> {
  const [gone, kept] = [join(root, 'gone'), join(root, 'member')]
  for (const dir of [gone, kept]) mkdirSync(dir)
  const created = await oracle(
    ['workset', 'create', 'w1', '--member', gone, '--member', kept],
    root,
  )
  expect(created.exitCode, detail(created)).toBe(0)
  rmSync(gone, { recursive: true })
}

describe('a handover whose stdout or stderr reader has exited runs as the binary runs', () => {
  // The binary under Node ignores a console write that fails because the
  // stream's reader has gone (EPIPE): Node's console swallows it. Under Bun
  // the preload routes the console through the process streams, so it must
  // swallow it the same way, or the handover crashes (exit 1, Bun's crash
  // report on the terminal) where the binary carries on.
  const cases: [label: string, closed: 'stdout' | 'stderr', argv: string[], editor?: string][] = [
    ['workset open w1 --tool code', 'stdout', ['workset', 'open', 'w1', '--tool', 'code']],
    [
      'workset open w1 --tool code, its primary skipped',
      'stderr',
      ['workset', 'open', 'w1', '--tool', 'code'],
    ],
    ['config edit, EDITOR=false', 'stderr', ['config', 'edit'], 'false'],
  ]
  for (const [label, closed, argv, editor] of cases)
    test(`${label}, ${closed} closed`, async () => {
      const [upRoot, coRoot] = [plainRoot(), plainRoot()]
      const env = async (root: string): Promise<Record<string, string>> => {
        if (editor !== undefined) return terminalEnv(root, { EDITOR: editor })
        if (closed === 'stderr') await saveWorksetMissingPrimary(root)
        else await saveWorkset(root)
        return terminalEnv(root, { PATH: openerPath(root) })
      }
      const [upEnv, coEnv] = [await env(upRoot), await env(coRoot)]
      const up = await ptyClosed(closed, [NODE, openspecBinPath(), ...argv], upRoot, {
        ...upEnv,
        OPENSPEC_NO_COMPLETIONS: '1',
      })
      const co = await ptyClosed(closed, [process.execPath, CLI_ENTRY, ...argv], coRoot, coEnv)
      expect(terminalText(up.output), ptyDetail(up)).toContain(
        `[rc=${argv[0] === 'config' ? 1 : 0}]`,
      )
      expect(co.exitCode, ptyDetail(co)).toBe(up.exitCode)
      expect(terminalText(co.output), ptyDetail(co)).toBe(respellRemedies(terminalText(up.output)))
    }, 30_000)
})

// --- review round 3: a cache directory cospec cannot write ----------------------------

/** The paths whose content differs between two tree hashes, sorted. */
function changedPaths(before: Record<string, string>, after: Record<string, string>): string[] {
  const paths = new Set([...Object.keys(before), ...Object.keys(after)])
  return [...paths].filter((path) => before[path] !== after[path]).toSorted()
}

/**
 * Runs `fn` with `root`'s sandboxed cache directory read-only (`chmod 555`),
 * so the handover preload cannot land in cospec's cache.
 */
async function withReadOnlyCache<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const cache = oracleEnv(root).XDG_CACHE_HOME!
  chmodSync(cache, 0o555)
  try {
    expect(() => mkdirSync(join(cache, 'probe'))).toThrow()
    return await fn()
  } finally {
    chmodSync(cache, 0o755)
  }
}

describe.skipIf(process.getuid?.() === 0)(
  'with the cache directory read-only, every handover runs as the binary runs',
  () => {
    // Each prompt is cancelled with Ctrl-D, the key only the preload answers
    // under Bun (design D15); `config edit` runs `EDITOR=true`, prompting
    // nothing.
    const cases: [argv: string[], saved: boolean][] = [
      [['config', 'reset', '--all'], false],
      [['config', 'profile'], false],
      [['config', 'edit'], false],
      [['workset', 'open', 'w1'], true],
    ]
    for (const [argv, saved] of cases) {
      test(`${argv.join(' ')} on a terminal`, async () => {
        const [upRoot, coRoot] = [plainRoot(), plainRoot()]
        const opts = (root: string): PtyOptions => ({
          key: argv[0] === 'config' && argv[1] === 'edit' ? undefined : at(argv, CTRL_D),
          env: saved ? { PATH: openerPath(root) } : {},
        })
        const [upOpts, coOpts] = [opts(upRoot), opts(coRoot)]
        if (saved) for (const root of [upRoot, coRoot]) await saveWorkset(root)
        const upBefore = treeHash(upRoot)
        const coBefore = treeHash(coRoot)
        const up = await withReadOnlyCache(upRoot, () => ptyUpstream(argv, upRoot, upOpts))
        const co = await withReadOnlyCache(coRoot, () => ptyCospec(argv, coRoot, coOpts))
        expect(co.exitCode, ptyDetail(co)).toBe(up.exitCode)
        expect(terminalText(co.output), ptyDetail(co)).toBe(
          respellRemedies(terminalText(up.output)),
        )
        // The files the binary writes (`config edit` its config, `workset
        // open` its `.code-workspace`), and no others.
        expect(changedPaths(coBefore, treeHash(coRoot))).toEqual(
          changedPaths(upBefore, treeHash(upRoot)),
        )
      }, 30_000)
    }

    test('config reset --all with stdin empty, not a terminal', async () => {
      const root = plainRoot()
      const argv = ['config', 'reset', '--all']
      const before = treeHash(root)
      const up = await withReadOnlyCache(root, () =>
        piped(['node', openspecBinPath(), ...argv], root, undefined),
      )
      const co = await withReadOnlyCache(root, () =>
        piped([process.execPath, CLI_ENTRY, ...argv], root, undefined),
      )
      expect(treeHash(root)).toEqual(before)
      expect(up.exitCode, detail(up)).toBe(130)
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
      expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
    }, 30_000)
  },
)

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

/** The sandbox's global config, as `config reset --all` resets it. */
function globalConfig(root: string): string {
  return join(root, '.oracle-home', '.config', 'openspec', 'config.json')
}

/** A global config `config reset --all` changes when it resets. */
const CUSTOM_CONFIG = '{\n  "profile": "custom",\n  "featureFlags": {}\n}\n'

/**
 * `cmd` in `root`, its stdin fed by the shell `feeder` (`echo y |`, `</dev/null`),
 * telemetry off (as cospec runs the binary).
 */
async function fed(feeder: string, cmd: string[], root: string): Promise<SpawnResult> {
  const script = feeder.startsWith('<') ? `exec "$@" ${feeder}` : `${feeder} exec "$@"`
  const env: Record<string, string> = { ...oracleEnv(root), OPENSPEC_NO_COMPLETIONS: '1' }
  const proc = Bun.spawn(['sh', '-c', script, 'sh', ...cmd], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env,
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

/** The last line a run printed: its answer (`Reset cancelled.`, `Configuration reset to defaults`). */
function lastLine(text: string): string | undefined {
  return text.trimEnd().split('\n').at(-1)
}

/** A sandbox root whose global config `config reset --all` changes when it resets. */
function seededRoot(): string {
  const root = plainRoot()
  mkdirSync(dirname(globalConfig(root)), { recursive: true })
  writeFileSync(globalConfig(root), CUSTOM_CONFIG)
  return root
}

/** Whether `config reset --all` in `root` reset its seeded global config. */
function wasReset(root: string): boolean {
  return readFileSync(globalConfig(root), 'utf8') !== CUSTOM_CONFIG
}

describe('config reset --all with stdin piped, not a terminal: cospec forwards it (design D14)', () => {
  // Parity rows: the binary with telemetry off, as cospec runs it. A closed
  // input cancels; an answer that arrives after the prompt is taken; a stream
  // that never stops (`yes`) answers it. A late answer waits 3s, not the 1s of
  // a hand probe: cospec must have its prompt drawn first (a cold transpile,
  // the version check, the child's own start), which a slow CI runner can take
  // longer than a second to do.
  const cases: [feeder: string, exitCode: number, reset: boolean][] = [
    ['</dev/null', 130, false],
    ['(sleep 3; echo y) |', 0, true],
    ['(sleep 3; echo n) |', 0, false],
    ['yes |', 0, true],
  ]
  for (const [feeder, exitCode, reset] of cases) {
    test(`${feeder} cospec config reset --all: as the binary answers`, async () => {
      const argv = ['config', 'reset', '--all']
      const [upRoot, coRoot] = [seededRoot(), seededRoot()]
      const up = await fed(feeder, ['node', openspecBinPath(), ...argv], upRoot)
      const co = await fed(feeder, [process.execPath, CLI_ENTRY, ...argv], coRoot)
      expect(up.exitCode, detail(up)).toBe(exitCode)
      expect(wasReset(upRoot)).toBe(reset)
      expect(co.exitCode, detail(co)).toBe(up.exitCode)
      expect(readFileSync(globalConfig(coRoot), 'utf8')).toBe(
        readFileSync(globalConfig(upRoot), 'utf8'),
      )
      expect(co.stderr, detail(co)).toBe(respellRemedies(up.stderr))
      // `yes` answers every redraw the prompt makes before it closes, a count
      // no run fixes, under Node as under cospec: its answer line is compared.
      if (feeder === 'yes |') expect(lastLine(co.stdout), detail(co)).toBe(lastLine(up.stdout))
      else expect(co.stdout, detail(co)).toBe(respellRemedies(up.stdout))
    }, 30_000)
  }

  // Declared rows: an answer already waiting on the pipe when the prompt is
  // drawn. The binary's answer to it depends on timing (ledger 13.3, design
  // D14); cospec forwards it unmodified to the binary running under Bun,
  // whose confirm takes it.
  const typedAhead: [feeder: string, reset: boolean, answer: string][] = [
    ['echo y |', true, 'Configuration reset to defaults'],
    ['echo n |', false, 'Reset cancelled.'],
  ]
  for (const [feeder, reset, answer] of typedAhead) {
    test(`${feeder} cospec config reset --all: cospec's declared answer, exit 0`, async () => {
      const root = seededRoot()
      const co = await fed(feeder, [process.execPath, CLI_ENTRY, 'config', 'reset', '--all'], root)
      expect(co.exitCode, detail(co)).toBe(0)
      expect(wasReset(root)).toBe(reset)
      expect(lastLine(co.stdout) ?? '', detail(co)).toEndWith(answer)
      expect(co.stderr, detail(co)).toBe('')
    }, 30_000)
  }

  // No contract case here for the binary's telemetry-default timing: under
  // Node the binary's first-run telemetry work delays its prompt past the
  // waiting answer, which it then takes, but that race depends on how long
  // the telemetry call takes on a given runner, so asserting it differs from
  // the telemetry-off answer flakes on CI. The observation is recorded as
  // evidence, not an assertion, in ledger 13.3 and design D14.
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
    ['config', 'path', 'extra', '--json'],
    ['config', 'get', 'a', 'b', '--json'],
    ['config', 'set', 'a', 'b', 'c', '--json'],
    ['config', 'unset', 'a', 'b', '--json'],
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
