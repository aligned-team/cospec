// Which apps/cli tests a change can affect: the selection the git hooks and PR CI run instead of
// the whole suites (`mise run test:changed`), and the guard that keeps it sound.
//
// A change is a list of files: what a commit stages, what a push changes on each ref, or what a
// branch changes from a base (`stagedFiles`, `pushedFiles`, `changedFiles`). Each changed file
// selects, per suite (`selectTests`):
//
// - the test files whose import graph reaches it, by the rules `bun test --changed` follows:
//   static imports and literal dynamic `import()`s, never type-only ones. Canon files are in the
//   graph: `canon/embedded.ts` imports each with `{ type: 'file' }`;
// - the test files that read it through fs: those `FS_READERS` lists (directly, or through a
//   support module they import), and those that name its fixture tree (`fixtureUses`);
// - nothing, for a path no test reads (`UNREAD`);
// - the whole suite, for an input every test depends on — the CLI's boot path (a test runs the
//   CLI as a child, whose boot it never imports: `bootModules`), the test preload, and
//   `GLOBAL_INPUTS` — and for a non-module file nothing is known to read.
//
// The guards: the test preload refuses a CLI spawn from a test file whose imports never reach the
// dispatched command (`assertSpawnSelectable`), and `support-test-scope.test.ts` fails on a file
// that builds a path into the repository without a `FS_READERS` entry.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

export type Suite = 'unit' | 'contract' | 'integration'
export const SUITES: readonly Suite[] = ['unit', 'contract', 'integration']

/** apps/cli. */
export const CLI_DIR = resolve(import.meta.dir, '../..')
/** The repository root. */
export const ROOT_DIR = resolve(CLI_DIR, '../..')
/** apps/cli/src/index.ts — the entry every test spawns the CLI through. */
export const CLI_ENTRY_PATH = join(CLI_DIR, 'src/index.ts')

const CLI_TS = join(CLI_DIR, 'src/cli.ts')
const PRELOAD = join(CLI_DIR, 'test/fixtures/isolate-machine-state.ts')
const MODULE = /\.(?:[cm]?[jt]sx?)$/

/** Inputs every test depends on (root-relative globs): a change to one runs every suite whole. */
export const GLOBAL_INPUTS: readonly string[] = [
  'package.json',
  'bun.lock',
  'bunfig.toml',
  'mise.toml',
  'mise.lock',
  'tsconfig.json',
  'tsconfig.base.json',
  'apps/cli/package.json',
  'apps/cli/bunfig.toml',
  'apps/cli/mise.toml',
  'apps/cli/tsconfig.json',
]

/**
 * Repository paths (root-relative globs) no test reads through fs, beyond what `FS_READERS`
 * says: a change confined to them selects only those readers, and the tests whose imports reach
 * a module among them.
 */
export const UNREAD: readonly string[] = [
  'openspec/changes/**',
  'openspec/specs/**',
  'packages/**',
  'e2e/**',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/pr-title.yml',
  '.github/actions/**',
  'scripts/hooks/**',
  'scripts/mise-tasks/**',
  'hk.pkl',
  '.oxlintrc.json',
  'cog.toml',
  'commitlint.config.mjs',
  'communique.toml',
  '.editorconfig',
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  '.agents/shared.md',
]

/** The files `cospec update` manages in this repository, which reading it checks. */
const MANAGED = [
  'openspec/config.yaml',
  'openspec/.cospec-manifest.json',
  'openspec/schemas/**',
  '.claude/**',
  '.agents/skills/**',
  '.codex/**',
  '.opencode/**',
  '.github/agents/**',
  '.github/prompts/**',
  '.github/skills/**',
  '.github/instructions/**',
  '.github/copilot-instructions.md',
  '.github/workflows/copilot-setup-steps.yml',
]

/** What the package tarball holds besides the source the pack tests' `cli.ts` import reaches. */
const PACKAGED = [
  'apps/cli/bin/**',
  'apps/cli/npm/**',
  'apps/cli/README.md',
  'apps/cli/LICENSE',
  'apps/cli/THIRD-PARTY-LICENSES.md',
]

export type FsReads = { readonly reads: readonly string[] } | { readonly none: string }

/**
 * Every file under apps/cli/test (a test, or a module tests import) whose code builds a path into
 * the repository: the repository paths (root-relative globs) it reads through fs, or why the
 * path reads nothing. A support module's reads select every test whose imports reach it.
 * `support-test-scope.test.ts` fails on a file that builds such a path without an entry here.
 */
export const FS_READERS: Readonly<Record<string, FsReads>> = {
  'test/contract/archive-no-validate.test.ts': {
    reads: ['apps/cli/test/contract/parity-pending.yaml'],
  },
  'test/contract/archive-preflight-dedupe.test.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/cli-surface.test.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/fixtures.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/glob.test.ts': { reads: ['apps/cli/src/core/glob.ts', 'openspec/schemas/**'] },
  'test/contract/harness-matrix.test.ts': {
    reads: ['apps/cli/test/unit/__golden__/harness-render/**'],
  },
  'test/contract/nested-detector.test.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/parity-close-out.test.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/precedence-matrix.test.ts': {
    reads: ['openspec/schemas/**', 'apps/cli/test/contract/parity-pending.yaml'],
  },
  // It also copies src and runs `update` from the copy, which its import of update.ts reaches.
  'test/contract/profiles.test.ts': { reads: ['apps/cli/src/canon/workflows/apply.md'] },
  'test/contract/reachability.test.ts': {
    reads: ['apps/cli/src/canon/parity/**', 'apps/cli/test/contract/parity-pending.yaml'],
  },
  'test/contract/readdir-order.test.ts': { reads: ['apps/cli/src/vendor/openspec.bundle.js.tpl'] },
  'test/contract/support/upstream-init-capture.ts': {
    reads: ['apps/cli/test/fixtures/upstream-init/**'],
  },
  'test/contract/upstream-init-fixtures.test.ts': {
    reads: ['apps/cli/test/fixtures/upstream-init/**'],
  },
  'test/contract/validation-parity.test.ts': { reads: ['openspec/schemas/**'] },
  'test/contract/version-tripwire.test.ts': {
    reads: ['apps/cli/package.json', 'mise.toml', 'mise.lock'],
  },
  'test/fixtures/support.ts': {
    none: 'the CLI entry it spawns (the spawn guard checks those), and the fixture tree a caller names (`fixtureUses`)',
  },
  'test/fixtures/test-scope.ts': { none: 'the selector itself' },
  'test/integration/completion-install.test.ts': {
    none: 'the CLI entry it spawns, which the spawn guard checks',
  },
  // `scripts/generate-self update --check` over this repository: what it manages, and the root
  // config files whose legacy OpenSpec block it looks for.
  'test/integration/generate-self-home.test.ts': {
    reads: [
      'scripts/generate-self',
      ...MANAGED,
      'CLAUDE.md',
      'CLINE.md',
      'CODEBUDDY.md',
      'COSTRICT.md',
      'QODER.md',
      'IFLOW.md',
      'AGENTS.md',
      'QWEN.md',
    ],
  },
  'test/integration/harness-wiring.test.ts': {
    reads: ['apps/cli/test/integration/__golden__/harness-wiring/**'],
  },
  'test/integration/pack-standalone.test.ts': { reads: PACKAGED },
  'test/integration/pack.test.ts': { reads: PACKAGED },
  'test/integration/verification-format.test.ts': { reads: ['bunfig.toml'] },
  'test/unit/canon-render.test.ts': { reads: ['apps/cli/src/canon/workflows/**'] },
  'test/unit/canon/workflow-references.test.ts': { reads: ['apps/cli/src/canon/workflows/**'] },
  'test/unit/commands/apply-relay-guard.test.ts': {
    reads: ['apps/cli/src/canon/apply-instruction.yaml'],
  },
  'test/unit/commands/archive-refusals.test.ts': { reads: ['apps/cli/src/commands/archive.ts'] },
  'test/unit/commands/no-legacy-parser.test.ts': { reads: ['apps/cli/src/commands/*.ts'] },
  'test/unit/core/change.test.ts': {
    reads: [
      'apps/cli/src/core/change.ts',
      'apps/cli/src/commands/new.ts',
      'apps/cli/src/core/change-metadata.ts',
    ],
  },
  'test/unit/core/command-table.test.ts': { reads: ['apps/cli/src/commands/*.ts'] },
  'test/unit/core/scenario-gate.test.ts': { reads: ['apps/cli/src/commands/*.ts'] },
  'test/unit/docs/table-shape.test.ts': { reads: ['docs/**/*.md', 'apps/docs/**/*.md'] },
  'test/unit/harness-render.test.ts': {
    reads: ['apps/cli/test/unit/__golden__/harness-render/**'],
  },
  'test/unit/harness/adapters.test.ts': { none: 'a resolution base for the pinned package' },
  'test/unit/harness/full-set-golden.test.ts': {
    reads: ['apps/cli/test/unit/__golden__/harness-render/**', ...MANAGED],
  },
  'test/unit/harness/mise-merge.test.ts': { reads: ['apps/cli/src/canon/gate/mise.toml.tpl'] },
  'test/unit/harness/no-tool-branches.test.ts': {
    reads: ['apps/cli/src/commands/*.ts', 'apps/cli/src/harness/*.ts'],
  },
  'test/unit/harness/render-delivery.test.ts': { reads: ['apps/cli/src/canon/workflows/**'] },
  'test/unit/harness/render.test.ts': {
    reads: ['apps/cli/test/unit/__golden__/harness-render/opencode/**'],
  },
  'test/unit/harness/workflow-set.test.ts': {
    reads: ['apps/cli/src/canon/parity/aliases.yaml'],
  },
  'test/unit/rules/tasks.test.ts': { reads: ['apps/cli/src/core/rules/tasks.ts'] },
  'test/unit/rules/views.test.ts': { reads: ['apps/cli/src/core/rules/*.ts'] },
  'test/unit/schemas/schema-compose.test.ts': { reads: ['apps/cli/test/unit/schemas/golden/**'] },
  'test/unit/support-machine-isolation.test.ts': {
    reads: ['bunfig.toml', 'apps/cli/bunfig.toml', 'packages/bench/bunfig.toml', 'e2e/bunfig.toml'],
  },
  'test/unit/support-test-scope-dispatch.test.ts': {
    none: 'registry paths it resolves to compare',
  },
}

function resolveImport(from: string, specifier: string): string | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolve(dirname(from), specifier)
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, 'index.ts'),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return undefined
}

const transpilers = {
  ts: new Bun.Transpiler({ loader: 'ts' }),
  tsx: new Bun.Transpiler({ loader: 'tsx' }),
  js: new Bun.Transpiler({ loader: 'js' }),
  jsx: new Bun.Transpiler({ loader: 'jsx' }),
}
function loaderOf(file: string): keyof typeof transpilers {
  // ts, tsx, mts, cts, js, jsx, mjs, cjs
  const ext = file.slice(file.lastIndexOf('.') + 1)
  if (ext === 'tsx' || ext === 'jsx') return ext
  return ext.endsWith('ts') ? 'ts' : 'js'
}

/** The relative imports `source` (the text of module `file`) loads, as `--changed` follows them. */
function importsOf(file: string, source: string): string[] {
  return transpilers[loaderOf(file)]
    .scanImports(source)
    .map((imp) => resolveImport(file, imp.path))
    .filter((path): path is string => path !== undefined)
}

function closure(entries: readonly string[], importsFor: (file: string) => string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [...entries]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (MODULE.test(file)) stack.push(...importsFor(file))
  }
  return seen
}

const readText = (file: string): string => readFileSync(file, 'utf8')

// One scan per file per process: a selection walks every test file's graph, and they overlap.
const scanned = new Map<string, string[]>()
function importsOnDisk(file: string): string[] {
  let found = scanned.get(file)
  if (found === undefined) {
    found = existsSync(file) ? importsOf(file, readText(file)) : []
    scanned.set(file, found)
  }
  return found
}

/** Every file `entry` loads (absolute paths, `entry` included). */
export function importClosure(entry: string): Set<string> {
  return closure([resolve(entry)], importsOnDisk)
}

// The file names Bun's test runner picks up.
const TEST_FILE = new Bun.Glob('**/*{.test,_test,.spec,_spec}.{ts,tsx,js,jsx,mjs,cjs}')

/** The test files of `suite`, relative to apps/cli. */
export function testFiles(suite: Suite): string[] {
  return [...TEST_FILE.scanSync(join(CLI_DIR, 'test', suite))]
    .map((file) => `test/${suite}/${file.split(sep).join('/')}`)
    .toSorted()
}

// `mkTempRepo({ fixture: 'x', … })` and `copyFixture('x', …)`: a fixture tree a file copies.
const FIXTURE_USE = /\bmkTempRepo\(\{[^}]*\bfixture:\s*'([\w-]+)'|\bcopyFixture\(\s*'([\w-]+)'/g

/** Each file under apps/cli/test (relative to apps/cli) that names a fixture tree, and the trees. */
export function fixtureUses(): Map<string, string[]> {
  const uses = new Map<string, string[]>()
  for (const file of new Bun.Glob('test/**/*.ts').scanSync(CLI_DIR)) {
    const names = [...readText(join(CLI_DIR, file)).matchAll(FIXTURE_USE)].map((m) => m[1] ?? m[2]!)
    if (names.length > 0) uses.set(file.split(sep).join('/'), [...new Set(names)])
  }
  return uses
}

/** Every reader of a path through fs: a file under apps/cli/test, and the globs it reads. */
function fsReaders(): { file: string; reads: Bun.Glob[] }[] {
  const readers = Object.entries(FS_READERS).flatMap(([file, entry]) =>
    'reads' in entry ? [{ file, reads: entry.reads.map((glob) => new Bun.Glob(glob)) }] : [],
  )
  for (const [file, names] of fixtureUses())
    readers.push({
      file,
      reads: names.map((name) => new Bun.Glob(`apps/cli/test/fixtures/${name}/**`)),
    })
  return readers
}

const matches = (globs: readonly string[], file: string): boolean =>
  globs.some((glob) => new Bun.Glob(glob).match(file))

export type Selection = { readonly whole: string } | { readonly tests: readonly string[] }

/** What `changed` (root-relative paths) selects of `suite`: its test files, or the whole suite. */
export function selectTests(suite: Suite, changed: readonly string[]): Selection {
  const boot = bootModules()
  const preload = preloadModules()
  const readers = fsReaders()
  const suiteTests = testFiles(suite).map((file) => ({
    file,
    reach: importClosure(join(CLI_DIR, file)),
  }))
  // Everything any test imports: a non-module file in it has a reader through the graph.
  const imported = new Set<string>()
  for (const s of SUITES)
    for (const file of testFiles(s))
      for (const m of importClosure(join(CLI_DIR, file))) imported.add(m)
  const selected = new Set<string>()
  for (const file of changed) {
    const abs = join(ROOT_DIR, file)
    if (boot.has(abs)) return { whole: `${file} is on the CLI's boot path` }
    if (preload.has(abs)) return { whole: `${file} is loaded by the test preload` }
    if (matches(GLOBAL_INPUTS, file)) return { whole: `${file} is an input every test depends on` }
    const readBy = readers
      .filter((r) => r.reads.some((glob) => glob.match(file)))
      .map((r) => r.file)
    for (const { file: test, reach } of suiteTests) {
      if (reach.has(abs) || readBy.some((r) => r === test || reach.has(join(CLI_DIR, r))))
        selected.add(test)
    }
    const known =
      MODULE.test(file) || imported.has(abs) || readBy.length > 0 || matches(UNREAD, file)
    if (!known) return { whole: `nothing is known to read ${file}` }
  }
  return { tests: [...selected].toSorted() }
}

// `export const COMMAND_MODULES = { … }` in src/cli.ts: one literal `import()` per command.
const REGISTRY = /^export const COMMAND_MODULES\b[^\n]*\{\n([\s\S]*?)^\}\n/m
const REGISTRY_ROW = /^\s*'?([\w-]+)'?: \(\) => import\('(\.\/commands\/[\w-]+\.ts)'\),$/gm

function registryBlock(): { block: RegExpExecArray; text: string } {
  const text = readText(CLI_TS)
  const block = REGISTRY.exec(text)
  if (block === null) throw new Error(`test-scope: no COMMAND_MODULES registry in ${CLI_TS}`)
  return { block, text }
}

/** The command registry: each command name and the module (absolute path) it loads. */
export function commandModules(): Map<string, string> {
  const rows = [...registryBlock().block[1]!.matchAll(REGISTRY_ROW)]
  return new Map(rows.map((row) => [row[1]!, resolve(dirname(CLI_TS), row[2]!)]))
}

/**
 * What every CLI run loads, whichever command it dispatches: the closure of src/index.ts with
 * src/cli.ts read without its command registry (its other imports, static and dynamic, stay).
 */
export function bootModules(): Set<string> {
  const { block, text } = registryBlock()
  const withoutRegistry = text.slice(0, block.index) + text.slice(block.index + block[0].length)
  return closure([CLI_ENTRY_PATH], (file) =>
    file === CLI_TS ? importsOf(file, withoutRegistry) : importsOnDisk(file),
  )
}

/** What every `bun test` run in apps/cli loads before any test file: the preload's closure. */
export function preloadModules(): Set<string> {
  return importClosure(PRELOAD)
}

/**
 * The command a CLI argv (the tokens after the entry) dispatches, the way `run` in src/cli.ts
 * reads it: `undefined` when the run stops at the program level (version, help, a refused or
 * valueless global option, no command).
 */
export function dispatchedCommand(args: readonly string[]): string | undefined {
  const terminator = args.indexOf('--')
  const beforeTerminator = terminator === -1 ? args : args.slice(0, terminator)
  if (beforeTerminator.some((tok) => tok === '--version' || tok.startsWith('-V'))) return undefined
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!
    if (tok === '--') return args[i + 1]
    if (tok === '--json' || tok === '--no-color') continue
    if (tok === '--cwd' || tok === '--store') i++
    else if (tok.startsWith('--cwd=') || tok.startsWith('--store=')) continue
    else if (tok.length > 1 && tok.startsWith('-')) return undefined
    else return tok
  }
  return undefined
}

const gitIn = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const lines = (out: string): string[] => out.split('\n').filter((line) => line.length > 0)

/** The commit `ref` and HEAD share. */
export function mergeBase(ref: string, cwd = ROOT_DIR): string {
  return gitIn(cwd, 'merge-base', 'HEAD', ref)
}

/**
 * Root-relative paths that differ from `base` in the working tree — committed, staged, unstaged
 * or untracked, deletions included.
 */
export function changedFiles(base: string, cwd = ROOT_DIR): string[] {
  const tracked = lines(gitIn(cwd, 'diff', '--name-only', '--no-renames', base))
  const untracked = lines(gitIn(cwd, 'ls-files', '--others', '--exclude-standard'))
  return [...new Set([...tracked, ...untracked])].toSorted()
}

/** What the commit about to be made changes: the staged paths, deletions included. */
export function stagedFiles(cwd = ROOT_DIR): string[] {
  return lines(gitIn(cwd, 'diff', '--cached', '--name-only', '--no-renames')).toSorted()
}

const ZERO_SHA = /^0+$/

/** What a push changes, or why its changes cannot be told apart from the whole history. */
export type PushChange = { readonly files: readonly string[] } | { readonly unknown: string }

/**
 * What a push changes, from what git hands a pre-push hook: the `remote`, and one
 * `<local ref> <local sha> <remote ref> <remote sha>` line per ref. A ref the remote has moves
 * from its sha there; a new one from the newest commits the remote already has (on a stacked
 * branch, the branch it was cut from); a deleted one changes nothing. Deletions count.
 */
export function pushedFiles(
  refLines: readonly string[],
  remote: string,
  cwd = ROOT_DIR,
): PushChange {
  const files = new Set<string>()
  for (const line of refLines) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/)
    if (localSha === undefined || remoteSha === undefined || ZERO_SHA.test(localSha)) continue
    let bases: string[]
    if (!ZERO_SHA.test(remoteSha) && hasCommit(remoteSha, cwd)) bases = [remoteSha]
    else {
      const walk = lines(
        gitIn(cwd, 'rev-list', '--boundary', localSha, '--not', `--remotes=${remote}`),
      )
      bases = walk.filter((entry) => entry.startsWith('-')).map((entry) => entry.slice(1))
      if (bases.length === 0 && walk.length > 0)
        return {
          unknown: `${remote} has none of the history ${line.trim().split(/\s+/)[0]} pushes`,
        }
    }
    for (const base of bases)
      for (const file of lines(gitIn(cwd, 'diff', '--name-only', '--no-renames', base, localSha)))
        files.add(file)
  }
  return { files: [...files].toSorted() }
}

/** Whether `sha` names a commit this clone has: one the remote holds but nobody fetched does not. */
function hasCommit(sha: string, cwd: string): boolean {
  const probe = Bun.spawnSync(['git', 'cat-file', '-e', `${sha}^{commit}`], {
    cwd,
    stderr: 'ignore',
  })
  if (probe.exitCode === null) throw new Error(`git cat-file did not run in ${cwd}`)
  return probe.exitCode === 0
}

const closures = new Map<string, Set<string>>()

/**
 * Throws when the running test file (`Bun.main`), if it lives under apps/cli/test, spawns the CLI
 * entry for a command whose module its imports never reach.
 */
export function assertSpawnSelectable(argv: readonly unknown[], testFile = Bun.main): void {
  if (!testFile.startsWith(join(CLI_DIR, 'test') + sep)) return
  const at = argv.indexOf(CLI_ENTRY_PATH)
  if (at === -1) return
  const command = dispatchedCommand(argv.slice(at + 1).map(String))
  const module = command === undefined ? undefined : commandModules().get(command)
  if (module === undefined) return
  let reach = closures.get(testFile)
  if (reach === undefined) {
    reach = importClosure(testFile)
    closures.set(testFile, reach)
  }
  if (reach.has(module)) return
  let specifier = relative(dirname(testFile), module).split(sep).join('/')
  if (!specifier.startsWith('.')) specifier = `./${specifier}`
  throw new Error(
    `${relative(ROOT_DIR, testFile)} runs \`cospec ${command}\` but never imports ` +
      `${relative(ROOT_DIR, module)}, so \`bun test --changed\` would not select it when that ` +
      `command changes. Add \`import '${specifier}'\` to the test file.`,
  )
}
