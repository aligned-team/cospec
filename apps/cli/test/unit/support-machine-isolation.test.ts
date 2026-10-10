// The guard behind `fixtures/isolate-machine-state.ts`: whatever suite a `bun test` run holds, the
// machine-global config it reads is a sandbox's, never the real home's (CLAUDE.md: tests run over
// a private HOME/XDG sandbox). It runs in the unit suite, so a run that loses the preload fails
// here by name instead of failing an init test over the profile of whoever ran it.

import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runOpenspec } from '../../src/core/openspec.ts'
import { readGlobalConfigDocument } from '../../src/core/root.ts'
import {
  assertGlobalConfigOffRealHome,
  globalConfigPath,
  hostToolEnv,
  isUnder,
  REAL_HOMES_KEY,
  realHomes,
} from '../fixtures/machine-isolation.ts'

const preloaded = (globalThis as { [REAL_HOMES_KEY]?: readonly string[] })[REAL_HOMES_KEY]
const homes = preloaded ?? realHomes({})

describe('the test run is off the real home', () => {
  test('the bunfig preload ran', () => {
    expect(preloaded).toBeDefined()
    expect(process.env.OPENSPEC_NO_COMPLETIONS).toBe('1')
  })

  test('the environment resolves the global config under the temporary directory', () => {
    const path = globalConfigPath(process.env)
    expect(isUnder(path, tmpdir())).toBe(true)
    for (const home of homes) expect(isUnder(path, home)).toBe(false)
    expect(() => assertGlobalConfigOffRealHome(process.env, homes)).not.toThrow()
  })

  test('os.homedir() and the XDG directories lie off the real home', () => {
    const dirs = [
      homedir(),
      process.env.XDG_CONFIG_HOME,
      process.env.XDG_DATA_HOME,
      process.env.XDG_STATE_HOME,
      process.env.CODEX_HOME,
    ]
    for (const dir of dirs) {
      expect(dir).toBeDefined()
      for (const home of homes) expect(isUnder(dir!, home)).toBe(false)
    }
  })

  test('the path the binary prints for an in-process read is off the real home', async () => {
    const result = await runOpenspec(['config', 'path'], {
      cwd: tmpdir(),
      expect: { exitCodes: [0] },
    })
    const printed = result.stdout.trim()
    expect(printed.endsWith(join('openspec', 'config.json'))).toBe(true)
    for (const home of homes) expect(isUnder(printed, home)).toBe(false)
    expect(await readGlobalConfigDocument(tmpdir())).toBeUndefined()
  })
})

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes).trim()
const text = async (proc: ReturnType<typeof Bun.spawn>): Promise<string> =>
  (await new Response(proc.stdout as ReadableStream).text()).trim()
const printHome = ['sh', '-c', 'printf %s "$HOME"']

describe('a child process is off the real home', () => {
  // Bun starts a child with the environment the process STARTED with unless the call passes `env`
  // (a bare `Bun.spawnSync(['sh', '-c', 'echo $HOME'])` prints the real HOME after the preload
  // assigned `process.env.HOME`), so `bun add`, `npm pack` and `git init` would read `~/.npmrc` and
  // `~/.gitconfig` and fill the real package-manager caches.
  test('Bun.spawnSync without env sees the sandbox HOME, in both call forms', () => {
    const home = process.env.HOME!
    for (const real of homes) expect(isUnder(home, real)).toBe(false)
    expect(decode(Bun.spawnSync(printHome).stdout)).toBe(home)
    expect(decode(Bun.spawnSync({ cmd: printHome }).stdout)).toBe(home)
    expect(decode(Bun.spawnSync(printHome, { env: undefined }).stdout)).toBe(home)
  })

  test('Bun.spawn without env sees the sandbox HOME, in both call forms', async () => {
    const home = process.env.HOME!
    expect(await text(Bun.spawn(printHome, { stdout: 'pipe' }))).toBe(home)
    expect(await text(Bun.spawn({ cmd: printHome, stdout: 'pipe' }))).toBe(home)
  })

  test('a call that passes its own env keeps it', () => {
    const explicit = join(tmpdir(), 'cospec-explicit-home')
    const out = Bun.spawnSync(printHome, { env: { ...process.env, HOME: explicit } })
    expect(decode(out.stdout)).toBe(explicit)
    expect(decode(Bun.spawnSync({ cmd: printHome, env: { HOME: explicit } }).stdout)).toBe(explicit)
  })

  test('a child sees an environment change made after the preload', () => {
    const before = process.env.HOME
    process.env.HOME = join(tmpdir(), 'cospec-reassigned-home')
    try {
      expect(decode(Bun.spawnSync(printHome).stdout)).toBe(process.env.HOME)
    } finally {
      process.env.HOME = before
    }
  })
})

describe('hostToolEnv', () => {
  test('puts the started HOME back for a host tool and leaves the sandbox in place', () => {
    const env = hostToolEnv()
    const started = (globalThis as { [k: symbol]: Record<string, string | undefined> })[
      Symbol.for('cospec.test.started-env')
    ]!
    expect(env.HOME).toBe(started.HOME)
    expect(env.XDG_CONFIG_HOME).toBe(started.XDG_CONFIG_HOME)
    expect(env.HOME).not.toBe(process.env.HOME)
    expect(isUnder(process.env.HOME!, tmpdir())).toBe(true)
    expect(decode(Bun.spawnSync(printHome, { env }).stdout)).toBe(started.HOME ?? '')
  })
})

describe('every test root loads the preload and cleans up after it', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
  const roots = ['.', 'apps/cli', 'packages/bench', 'e2e']

  // Bun reads only the bunfig in its working directory, so each directory a mise task runs
  // `bun test` from must name the preload itself. The probe runs a bare `bun test` there.
  test.each(roots)('bun test from %s', (root) => {
    const scratch = mkdtempSync(join(tmpdir(), 'cospec-probe-'))
    try {
      const probe = join(scratch, 'probe.test.ts')
      writeFileSync(
        probe,
        [
          "import { expect, test } from 'bun:test'",
          "import { tmpdir } from 'node:os'",
          "import { join } from 'node:path'",
          "test('runs over the sandbox', () => {",
          "  expect(process.env.HOME).toStartWith(join(tmpdir(), 'cospec-test-machine-'))",
          "  const out = Bun.spawnSync(['sh', '-c', 'printf %s \"$HOME\"'])",
          '  expect(new TextDecoder().decode(out.stdout)).toBe(process.env.HOME!)',
          '})',
          '',
        ].join('\n'),
      )
      const tmp = join(scratch, 'tmp')
      mkdirSync(tmp)
      const result = Bun.spawnSync([process.execPath, 'test', probe], {
        cwd: join(repo, root),
        env: { ...process.env, TMPDIR: tmp },
      })
      expect(`${decode(result.stdout)}${decode(result.stderr)}`).toContain('1 pass')
      expect(result.exitCode).toBe(0)
      expect(readdirSync(tmp)).toEqual([])
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})

describe('the guard itself', () => {
  const home = join(tmpdir(), 'cospec-fake-real-home')

  test('refuses a global config under a real home, by XDG_CONFIG_HOME or by HOME', () => {
    expect(() =>
      assertGlobalConfigOffRealHome({ XDG_CONFIG_HOME: join(home, '.config') }, [home]),
    ).toThrow(/real home/u)
    expect(() => assertGlobalConfigOffRealHome({ HOME: home }, [home])).toThrow(/real home/u)
    expect(() =>
      assertGlobalConfigOffRealHome({ XDG_CONFIG_HOME: '', HOME: home }, [home]),
    ).toThrow(/real home/u)
  })

  test('accepts one outside it', () => {
    expect(() =>
      assertGlobalConfigOffRealHome({ XDG_CONFIG_HOME: join(tmpdir(), 'elsewhere') }, [home]),
    ).not.toThrow()
  })

  test('isUnder matches a directory, not a name that merely starts with it', () => {
    expect(isUnder(join(home, 'a'), home)).toBe(true)
    expect(isUnder(home, home)).toBe(true)
    expect(isUnder(`${home}-two`, home)).toBe(false)
  })

  test('a home that holds the temporary directory is not a real home', () => {
    expect(realHomes({ HOME: tmpdir() })).not.toContain(tmpdir())
  })
})
