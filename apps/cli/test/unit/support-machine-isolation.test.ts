// The guard behind `fixtures/isolate-machine-state.ts`: whatever suite a `bun test` run holds, the
// machine-global config it reads is a sandbox's, never the real home's (CLAUDE.md: tests run over
// a private HOME/XDG sandbox). It runs in the unit suite, so a run that loses the preload fails
// here by name instead of failing an init test over the profile of whoever ran it.

import { describe, expect, test } from 'bun:test'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { runOpenspec } from '../../src/core/openspec.ts'
import { readGlobalConfigDocument } from '../../src/core/root.ts'
import {
  assertGlobalConfigOffRealHome,
  globalConfigPath,
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
