// The test selection the hooks and PR CI run (test/fixtures/test-scope.ts): which changes need a
// whole suite, and the preload guard that keeps `bun test --changed` from missing a test that
// spawns the CLI. This file must never import a command module: the guard rows below rely on its
// own imports reaching none.

import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
  pushedFiles,
  ROOT_DIR,
  stagedFiles,
  SUITES,
  testsReaching,
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

describe("the command registry stays out of the commands' graph", () => {
  // cli.ts's registry imports every command, so a command that imported anything from cli.ts
  // would reach all the others, and a test of one command would be selected by a change to any.
  test('no command module reaches src/cli.ts', () => {
    const reaching = [...commandModules()]
      .filter(([, module]) => importClosure(module).has(cli('src/cli.ts')))
      .map(([name]) => name)
    expect(reaching).toEqual([])
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
    ['apps/cli/bin/cospec.js', 'integration', 'run, not imported, by the integration suite'],
    ['apps/cli/bin/cospec.js', 'unit', undefined],
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

/** What a test reads of apps/cli's source through fs rather than by importing it. */
type Reads = { readonly globs: readonly string[] } | { readonly none: string }

/**
 * Every test whose code builds a relative path into apps/cli/src (outside canon and the vendored
 * bundle, which are not modules and run whole suites anyway): what it reads — globs under
 * apps/cli (for a test that copies src and runs the copy, the command modules it runs) — or why
 * the path reads no source.
 */
const SOURCE_READERS: Readonly<Record<string, Reads>> = {
  'test/contract/glob.test.ts': { globs: ['src/core/glob.ts'] },
  // Copies src and runs only `update` from the copy.
  'test/contract/profiles.test.ts': { globs: ['src/commands/update.ts'] },
  'test/integration/completion-install.test.ts': {
    none: 'the CLI entry it spawns, which the spawn guard checks',
  },
  'test/unit/commands/archive-refusals.test.ts': { globs: ['src/commands/archive.ts'] },
  'test/unit/commands/no-legacy-parser.test.ts': { globs: ['src/commands/*.ts'] },
  'test/unit/core/change.test.ts': {
    globs: ['src/core/change.ts', 'src/commands/new.ts', 'src/core/change-metadata.ts'],
  },
  'test/unit/core/command-table.test.ts': { globs: ['src/commands/*.ts'] },
  'test/unit/core/scenario-gate.test.ts': { globs: ['src/commands/*.ts'] },
  'test/unit/harness/adapters.test.ts': { none: 'a resolution base for the pinned package' },
  'test/unit/harness/no-tool-branches.test.ts': {
    globs: ['src/commands/*.ts', 'src/harness/*.ts'],
  },
  'test/unit/harness/render.test.ts': { none: 'a resolution base for the pinned package' },
  'test/unit/rules/tasks.test.ts': { globs: ['src/core/rules/tasks.ts'] },
  'test/unit/rules/views.test.ts': { globs: ['src/core/rules/*.ts'] },
  'test/unit/support-test-scope-dispatch.test.ts': {
    none: 'registry paths it resolves to compare',
  },
  'test/unit/support-test-scope.test.ts': { none: 'an import path in an expected message' },
}

const IMPORT_LINE = /^\s*(import\b|export\b.*\bfrom\b|\} from\b)|\bimport\(/
const SRC_PATH =
  /['"`](?:\.\.\/)+src(?:\/(?!canon\b|vendor\b)[^'"`]*)?['"`]|'\.\.',\s*'\.\.',\s*(?:'\.\.',\s*)?'src'/

describe('a test that reads source through fs imports it', () => {
  test('every test that builds a path into src is listed with what it reads', async () => {
    const found: string[] = []
    for (const file of new Bun.Glob('test/**/*.test.ts').scanSync(CLI_DIR)) {
      const lines = (await Bun.file(cli(file)).text()).split('\n')
      if (lines.some((line) => !IMPORT_LINE.test(line) && SRC_PATH.test(line))) found.push(file)
    }
    expect(found.toSorted()).toEqual(Object.keys(SOURCE_READERS).toSorted())
  })

  test.each(Object.entries(SOURCE_READERS))('%s reaches what it reads', (file, reads) => {
    const reach = importClosure(cli(file))
    // The boot path runs every suite whole, so a test need not reach it.
    const boot = bootModules()
    const wanted =
      'none' in reads
        ? []
        : reads.globs.flatMap((glob) => [...new Bun.Glob(glob).scanSync(CLI_DIR)].map(cli))
    expect(wanted.filter((module) => !reach.has(module) && !boot.has(module))).toEqual([])
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

/** A scratch clone of a scratch bare remote, its `main` pushed. */
function scratchClone(): { work: string; git: (...args: string[]) => string; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'cospec-push-'))
  const run = (cwd: string, ...args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  run(root, 'init', '-q', '--bare', '-b', 'main', 'remote.git')
  run(root, 'init', '-q', '-b', 'main', 'work')
  const work = join(root, 'work')
  const git = (...args: string[]): string =>
    run(
      work,
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.invalid',
      '-c',
      'commit.gpgsign=false',
      ...args,
    )
  git('remote', 'add', 'origin', join(root, 'remote.git'))
  return { work, git, done: () => rmSync(root, { recursive: true, force: true }) }
}

const ZERO = '0'.repeat(40)

describe('what a push changes', () => {
  test('a ref the remote has: from its sha there, deletions included', () => {
    const { work, git, done } = scratchClone()
    try {
      writeFileSync(join(work, 'a.txt'), 'a')
      git('add', '-A')
      git('commit', '-qm', 'base')
      git('push', '-q', 'origin', 'main')
      const remoteSha = git('rev-parse', 'HEAD')
      unlinkSync(join(work, 'a.txt'))
      writeFileSync(join(work, 'b.txt'), 'b')
      git('add', '-A')
      git('commit', '-qm', 'next')
      const line = `refs/heads/main ${git('rev-parse', 'HEAD')} refs/heads/main ${remoteSha}`
      expect(pushedFiles([line], 'origin', work)).toEqual({ files: ['a.txt', 'b.txt'] })
    } finally {
      done()
    }
  })

  test('a new branch stacked on a pushed one: from the commits the remote already has', () => {
    const { work, git, done } = scratchClone()
    try {
      writeFileSync(join(work, 'a.txt'), 'a')
      git('add', '-A')
      git('commit', '-qm', 'base')
      git('push', '-q', 'origin', 'main')
      git('checkout', '-qb', 'feature')
      writeFileSync(join(work, 'feature.txt'), 'f')
      git('add', '-A')
      git('commit', '-qm', 'feature')
      git('push', '-q', 'origin', 'feature')
      git('checkout', '-qb', 'stacked')
      writeFileSync(join(work, 'stacked.txt'), 's')
      git('add', '-A')
      git('commit', '-qm', 'stacked')
      const head = git('rev-parse', 'HEAD')
      expect(
        pushedFiles([`refs/heads/stacked ${head} refs/heads/stacked ${ZERO}`], 'origin', work),
      ).toEqual({ files: ['stacked.txt'] })
      // A new name for a commit the remote has, and a deleted ref, change nothing.
      const feature = git('rev-parse', 'feature')
      expect(
        pushedFiles([`refs/heads/alias ${feature} refs/heads/alias ${ZERO}`], 'origin', work),
      ).toEqual({ files: [] })
      expect(
        pushedFiles([`(delete) ${ZERO} refs/heads/feature ${feature}`], 'origin', work),
      ).toEqual({ files: [] })
    } finally {
      done()
    }
  })

  test('a force push: from the sha the remote had', () => {
    const { work, git, done } = scratchClone()
    try {
      writeFileSync(join(work, 'a.txt'), 'a')
      git('add', '-A')
      git('commit', '-qm', 'base')
      const base = git('rev-parse', 'HEAD')
      writeFileSync(join(work, 'b.txt'), 'b')
      git('add', '-A')
      git('commit', '-qm', 'first')
      git('push', '-q', 'origin', 'main')
      const pushed = git('rev-parse', 'HEAD')
      git('reset', '-q', '--hard', base)
      writeFileSync(join(work, 'c.txt'), 'c')
      git('add', '-A')
      git('commit', '-qm', 'rewritten')
      const line = `refs/heads/main ${git('rev-parse', 'HEAD')} refs/heads/main ${pushed}`
      expect(pushedFiles([line], 'origin', work)).toEqual({ files: ['b.txt', 'c.txt'] })
    } finally {
      done()
    }
  })

  test('a remote with none of the pushed history cannot be told from it', () => {
    const { work, git, done } = scratchClone()
    try {
      writeFileSync(join(work, 'a.txt'), 'a')
      git('add', '-A')
      git('commit', '-qm', 'base')
      const line = `refs/heads/main ${git('rev-parse', 'HEAD')} refs/heads/main ${ZERO}`
      expect(pushedFiles([line], 'origin', work)).toEqual({
        unknown: 'origin has none of the history refs/heads/main pushes',
      })
    } finally {
      done()
    }
  })
})

describe('what a commit changes', () => {
  test('the staged paths, deletions included, not the unstaged ones', () => {
    const { work, git, done } = scratchClone()
    try {
      for (const name of ['a.txt', 'b.txt', 'c.txt']) writeFileSync(join(work, name), name)
      git('add', '-A')
      git('commit', '-qm', 'base')
      unlinkSync(join(work, 'a.txt'))
      writeFileSync(join(work, 'b.txt'), 'b2')
      git('add', '-A')
      writeFileSync(join(work, 'c.txt'), 'c2')
      expect(stagedFiles(work)).toEqual(['a.txt', 'b.txt'])
    } finally {
      done()
    }
  })
})

describe('the tests a change reaches', () => {
  test('the test files whose imports reach a changed module, and a changed test itself', () => {
    const unit = testsReaching('unit', ['apps/cli/src/commands/feedback.ts'])
    expect(unit).toContain('test/unit/commands/feedback-format.test.ts')
    expect(unit).not.toContain('test/unit/docs/table-shape.test.ts')
    expect(testsReaching('unit', ['apps/cli/test/unit/docs/table-shape.test.ts'])).toEqual([
      'test/unit/docs/table-shape.test.ts',
    ])
    expect(testsReaching('contract', ['apps/docs/guide/index.md'])).toEqual([])
  })

  test('a pre-push run reads the remote and the refs from stdin', () => {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    }).trim()
    const run = Bun.spawnSync(
      [process.execPath, cli('test/fixtures/run-changed.ts'), '--push', 'unit'],
      {
        cwd: CLI_DIR,
        stdin: new TextEncoder().encode(
          `origin https://example.invalid/x.git\nrefs/heads/x ${head} refs/heads/x ${head}\n`,
        ),
      },
    )
    expect(new TextDecoder().decode(run.stdout)).toContain(
      'test:changed unit: 0 test file(s) the push to origin reach (0 changed file(s))',
    )
    expect(run.exitCode).toBe(0)
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
