// The test selection the hooks and PR CI run (test/fixtures/test-scope.ts): what each change
// selects, the declared fs readers that keep it whole, and the preload guard that keeps the
// selection from missing a test that spawns the CLI. This file must never import a command module: the guard rows below rely on its
// own imports reaching none.

import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { bunTestArgs, parseArgs } from '../fixtures/run-changed.ts'
import {
  assertSpawnSelectable,
  bootModules,
  changedFiles,
  CLI_DIR,
  CLI_ENTRY_PATH,
  commandModules,
  fixtureUses,
  FS_READERS,
  importClosure,
  mergeBase,
  preloadModules,
  pushedFiles,
  ROOT_DIR,
  type Selection,
  selectTests,
  stagedFiles,
  type Suite,
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

const GOLDEN =
  'apps/cli/test/unit/__golden__/harness-render/claude/.claude/commands/cospec/apply.md'

describe('what a change selects', () => {
  const rows: [string, Suite, Selection | ((got: Selection) => void)][] = [
    // A docs page selects the one test that reads the docs trees, in no other suite.
    ['docs/release.md', 'unit', { tests: ['test/unit/docs/table-shape.test.ts'] }],
    ['docs/release.md', 'contract', { tests: [] }],
    ['apps/docs/guide/index.md', 'integration', { tests: [] }],
    // A golden file selects the tests that compare against it, whichever suite they are in.
    [
      GOLDEN,
      'unit',
      {
        tests: ['test/unit/harness-render.test.ts', 'test/unit/harness/full-set-golden.test.ts'],
      },
    ],
    [GOLDEN, 'contract', { tests: ['test/contract/harness-matrix.test.ts'] }],
    // A fixture tree selects the tests that name it.
    [
      'apps/cli/test/fixtures/plain/openspec/config.yaml',
      'unit',
      (got) => expect(got).toEqual({ tests: fixtureTests('plain', 'unit') }),
    ],
    // A capture file selects the tests whose imports reach the module that reads the captures.
    [
      'apps/cli/test/fixtures/upstream-init/claude.json',
      'contract',
      (got) => {
        expect('tests' in got && got.tests).toContain('test/contract/harness-matrix.test.ts')
        expect('tests' in got && got.tests).toContain(
          'test/contract/upstream-init-fixtures.test.ts',
        )
      },
    ],
    // A root config file `cospec update` reads selects the test that runs it over the repository.
    ['CLAUDE.md', 'integration', { tests: ['test/integration/generate-self-home.test.ts'] }],
    ['CLAUDE.md', 'unit', { tests: [] }],
    // The launcher is run from the tarball, never imported.
    [
      'apps/cli/bin/cospec.js',
      'integration',
      {
        tests: ['test/integration/pack-standalone.test.ts', 'test/integration/pack.test.ts'],
      },
    ],
    // Canon is in the graph (canon/embedded.ts imports every file), and read by some tests too.
    [
      'apps/cli/src/canon/workflows/apply.md',
      'unit',
      (got) => {
        expect('tests' in got && got.tests).toContain('test/unit/canon-render.test.ts')
        expect('tests' in got && got.tests).toContain('test/unit/harness/render.test.ts')
      },
    ],
    [
      'apps/cli/src/commands/feedback.ts',
      'unit',
      (got) => {
        expect('tests' in got && got.tests).toContain('test/unit/commands/feedback-format.test.ts')
        expect('tests' in got && got.tests).toContain('test/unit/commands/no-legacy-parser.test.ts')
        expect('tests' in got && got.tests).not.toContain('test/unit/docs/table-shape.test.ts')
      },
    ],
    ['openspec/changes/some-change/proposal.md', 'contract', { tests: [] }],
    ['apps/cli/src/cli.ts', 'unit', { whole: "apps/cli/src/cli.ts is on the CLI's boot path" }],
    [
      'apps/cli/test/fixtures/machine-isolation.ts',
      'integration',
      { whole: 'apps/cli/test/fixtures/machine-isolation.ts is loaded by the test preload' },
    ],
    ['mise.toml', 'contract', { whole: 'mise.toml is an input every test depends on' }],
    ['bun.lock', 'unit', { whole: 'bun.lock is an input every test depends on' }],
    [
      'apps/cli/src/canon/not-a-real-file.yaml',
      'unit',
      { whole: 'nothing is known to read apps/cli/src/canon/not-a-real-file.yaml' },
    ],
  ]
  test.each(rows)('%s for %s', (file, suite, want) => {
    const got = selectTests(suite, [file])
    if (typeof want === 'function') want(got)
    else expect(got).toEqual(want)
  })

  test('a changed test file selects itself', () => {
    expect(selectTests('unit', ['apps/cli/test/unit/docs/table-shape.test.ts'])).toEqual({
      tests: ['test/unit/docs/table-shape.test.ts'],
    })
  })
})

/** The `suite` test files that name fixture `name`, or import a module that does. */
function fixtureTests(name: string, suite: Suite): string[] {
  const users = [...fixtureUses()].filter(([, names]) => names.includes(name)).map(([f]) => f)
  return [...new Bun.Glob(`test/${suite}/**/*.test.ts`).scanSync(CLI_DIR)]
    .filter((file) => {
      const reach = importClosure(cli(file))
      return users.some((user) => user === file || reach.has(cli(user)))
    })
    .toSorted()
}

const IMPORT_LINE = /^\s*(import\b|export\b.*\bfrom\b|\} from\b)|\bimport\(/
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/
// A path built from this file's own location, or from the repository root.
const REPO_PATH =
  /\b(?:join|resolve)\(\s*import\.meta\.dir\b|new URL\([^)]*import\.meta\.url|fileURLToPath\(import\.meta\.url\)|\bREPO_ROOT\b|\bREPO\b|\bFIXTURES_DIR\b|\bFIXTURE_DIR\b|\b(?:join|resolve)\(\s*here\b/

describe('every file that builds a repository path says what it reads', () => {
  test('FS_READERS lists exactly the files under test that build one', () => {
    const found = [...new Bun.Glob('test/**/*.ts').scanSync(CLI_DIR)]
      .filter((file) =>
        readFileSync(cli(file), 'utf8')
          .split('\n')
          .some(
            (line) => !IMPORT_LINE.test(line) && !COMMENT_LINE.test(line) && REPO_PATH.test(line),
          ),
      )
      .filter((file) => file !== 'test/unit/support-test-scope.test.ts')
    expect(found.toSorted()).toEqual(Object.keys(FS_READERS).toSorted())
  })

  test('every glob a reader declares matches a file in the repository', () => {
    for (const [file, entry] of Object.entries(FS_READERS)) {
      if (!('reads' in entry)) continue
      for (const glob of entry.reads) {
        // Copilot files are managed only when a repository opts in, and this one has not.
        if (
          glob.startsWith('.github/') ||
          /\b(?:CLINE|CODEBUDDY|COSTRICT|QODER|IFLOW|QWEN)\.md$|LICENSE$|\.codex\/\*\*$/.test(glob)
        )
          continue
        const hits = [...new Bun.Glob(glob).scanSync({ cwd: ROOT_DIR, dot: true })]
        expect(hits, `${file}: ${glob}`).not.toEqual([])
      }
    }
  })
})

describe('fixture trees', () => {
  test('every fixture a test copies is named by a literal, so its readers are known', () => {
    for (const file of new Bun.Glob('test/**/*.ts').scanSync(CLI_DIR)) {
      if (file === 'test/fixtures/support.ts') continue
      const text = readFileSync(cli(file), 'utf8')
      for (const call of text.matchAll(/\bmkTempRepo\(\{[^}]*\}/g))
        if (/\bfixture:/.test(call[0])) expect(call[0], file).toMatch(/\bfixture:\s*'[\w-]+'/)
      for (const call of text.matchAll(/\bcopyFixture\(\s*([^,)]+)/g))
        expect(call[1]!.trim(), file).toMatch(/^'[\w-]+'$/)
    }
  })

  test('each fixture tree has the tests that name it as readers', () => {
    const named = [...fixtureUses().values()].flat()
    for (const name of ['fresh', 'plain', 'vanilla-openspec']) expect(named).toContain(name)
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

const gitAt = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/** A scratch clone of a scratch bare remote, its `main` pushed. */
function scratchClone(): { work: string; git: (...args: string[]) => string; done: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'cospec-push-'))
  gitAt(root, 'init', '-q', '--bare', '-b', 'main', 'remote.git')
  gitAt(root, 'init', '-q', '-b', 'main', 'work')
  const work = join(root, 'work')
  const git = (...args: string[]): string =>
    gitAt(
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

describe('the runner', () => {
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

  test('runs each suite in parallel, with no flag of its own after the timeout', () => {
    const options = parseArgs(['--base', 'abc', 'contract', 'unit'])
    expect(options).toEqual({
      source: { kind: 'base', ref: 'abc' },
      suites: ['contract', 'unit'],
      parallel: true,
      forward: [],
    })
    if (typeof options === 'string') throw new Error(options)
    expect(bunTestArgs(options, ['./test/contract'])).toEqual([
      'test',
      './test/contract',
      '--parallel',
      '--timeout',
      '30000',
    ])
  })

  test('--no-parallel drops --parallel, and what follows -- reaches bun test as it is', () => {
    const options = parseArgs([
      '--no-parallel',
      'contract',
      '--',
      '--shard=2/4',
      '--timings=a.json',
      'unit',
    ])
    expect(options).toEqual({
      source: { kind: 'base', ref: 'HEAD' },
      suites: ['contract'],
      parallel: false,
      forward: ['--shard=2/4', '--timings=a.json', 'unit'],
    })
    if (typeof options === 'string') throw new Error(options)
    expect(bunTestArgs(options, ['./test/contract/a.test.ts'])).toEqual([
      'test',
      './test/contract/a.test.ts',
      '--timeout',
      '30000',
      '--shard=2/4',
      '--timings=a.json',
      'unit',
    ])
  })

  test('a suite named only after -- is no suite', () => {
    expect(parseArgs(['--', 'unit'])).toBe('name at least one suite')
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
