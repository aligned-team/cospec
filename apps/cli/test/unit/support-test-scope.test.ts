// The test selection the hooks and PR CI run (test/fixtures/test-scope.ts): which changes need a
// whole suite, and the preload guard that keeps `bun test --changed` from missing a test that
// spawns the CLI. This file must never import a command module: the guard rows below rely on its
// own imports reaching none.

import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

import {
  assertSpawnSelectable,
  bootModules,
  changedFiles,
  CLI_DIR,
  CLI_ENTRY_PATH,
  commandModules,
  fullSuiteReason,
  importClosure,
  mergeBase,
  preloadModules,
  ROOT_DIR,
  SUITES,
  UNREAD,
} from '../fixtures/test-scope.ts'

const cli = (path: string): string => join(CLI_DIR, path)

describe('the import graph', () => {
  test('a closure follows static and literal dynamic imports, never type-only ones', () => {
    const reach = importClosure(cli('src/cli.ts'))
    expect(reach.has(cli('src/cli.ts'))).toBe(true)
    expect(reach.has(cli('src/core/command-table.ts'))).toBe(true)
    // Only the registry's literal `import()` reaches a command module from cli.ts.
    expect(reach.has(cli('src/commands/validate.ts'))).toBe(true)
  })

  test('the boot path is the entry without the command registry', () => {
    const boot = bootModules()
    for (const path of ['src/index.ts', 'src/cli.ts', 'src/core/command-table.ts', 'package.json'])
      expect(boot.has(cli(path))).toBe(true)
    // The completion tip's own `import()` outside the registry loads this one on any command.
    expect(boot.has(cli('src/commands/completion.ts'))).toBe(true)
    for (const [name, module] of commandModules()) {
      if (name !== 'completion') expect(boot.has(module)).toBe(false)
    }
  })

  test('the preload closure is the isolation preload and what it imports', () => {
    const preload = preloadModules()
    expect(preload.has(cli('test/fixtures/isolate-machine-state.ts'))).toBe(true)
    expect(preload.has(cli('test/fixtures/test-scope.ts'))).toBe(true)
  })
})

describe('fullSuiteReason', () => {
  test.each([
    ['apps/cli/src/core/validate.ts', 'contract', undefined],
    ['apps/cli/test/contract/store.test.ts', 'contract', undefined],
    ['apps/cli/src/cli.ts', 'unit', "apps/cli/src/cli.ts is on the CLI's boot path"],
    ['apps/cli/src/vendor/openspec.bundle.js.tpl', 'integration', 'is on the CLI'],
    ['apps/cli/test/fixtures/machine-isolation.ts', 'unit', 'loaded by the test preload'],
    ['apps/cli/src/canon/schemas/feat/meta.yaml', 'contract', 'read outside the import graph'],
    ['apps/cli/test/fixtures/greenfield/openspec/config.yaml', 'unit', 'outside the import graph'],
    ['bun.lock', 'integration', 'bun.lock is read outside the import graph'],
    ['mise.toml', 'unit', 'outside the import graph'],
    ['openspec/changes/some-change/proposal.md', 'contract', undefined],
    ['.github/workflows/ci.yml', 'integration', undefined],
    ['docs/architecture.md', 'contract', undefined],
    ['docs/architecture.md', 'unit', 'outside the import graph'],
    ['apps/docs/guide/index.md', 'unit', 'outside the import graph'],
  ] as const)('%s for %s', (file, suite, reason) => {
    const got = fullSuiteReason([file], suite)
    if (reason === undefined) expect(got).toBeUndefined()
    else expect(got).toContain(reason)
  })

  test('the first file that needs the whole suite names the reason', () => {
    expect(
      fullSuiteReason(
        ['openspec/specs/x/spec.md', 'apps/cli/src/core/root.ts', 'bun.lock'],
        'unit',
      ),
    ).toBe("apps/cli/src/core/root.ts is on the CLI's boot path")
  })

  test('no suite skips a path under apps/cli, which the tests and the CLI read', () => {
    for (const suite of SUITES) {
      for (const glob of UNREAD[suite]) expect(glob.startsWith('apps/cli')).toBe(false)
    }
  })
})

describe('changed files', () => {
  test('the base is the commit HEAD and the ref share', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT_DIR, encoding: 'utf8' })
    expect(mergeBase('HEAD')).toBe(head.trim())
  })

  test('the list is root-relative, sorted and unique', () => {
    const files = changedFiles(mergeBase('HEAD'))
    expect(files).toEqual([...new Set(files)].toSorted())
    for (const file of files) expect(file.startsWith('/')).toBe(false)
  })
})

const entry = (...args: string[]): string[] => [process.execPath, CLI_ENTRY_PATH, ...args]

describe('the spawn guard', () => {
  const here = import.meta.path

  test('a CLI spawn for a command the test file never imports is refused', () => {
    expect(() => assertSpawnSelectable(entry('--no-color', 'validate'), here)).toThrow(
      "Add `import '../../src/commands/validate.ts'` to the test file.",
    )
  })

  test('a run that never dispatches a command needs no import', () => {
    for (const args of [['--version'], ['--help'], ['--bogus', 'validate'], ['nope'], []])
      expect(() => assertSpawnSelectable(entry(...args), here)).not.toThrow()
  })

  test('a spawn that is not the CLI entry is not checked', () => {
    expect(() => assertSpawnSelectable(['git', 'status'], here)).not.toThrow()
  })

  test('a file outside apps/cli/test is not checked', () => {
    const outside = join(ROOT_DIR, 'packages/bench/test/unit/example.test.ts')
    expect(() => assertSpawnSelectable(entry('validate'), outside)).not.toThrow()
  })

  test('a file whose imports reach the module passes', () => {
    expect(() =>
      assertSpawnSelectable(entry('validate'), cli('test/unit/cli.test.ts')),
    ).not.toThrow()
  })

  test('the test preload applies it to every Bun.spawn', () => {
    expect(() => Bun.spawn(entry('archive', 'x'))).toThrow('never imports apps/cli/src/commands/')
    expect(() => Bun.spawnSync({ cmd: entry('status') })).toThrow('never imports')
  })
})
