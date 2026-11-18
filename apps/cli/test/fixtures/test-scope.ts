// Which apps/cli tests a change can affect: the selection the git hooks and PR CI run instead of
// the whole suites (`mise run test:changed`), and the guard that keeps it sound.
//
// Selection is Bun's own: `bun test --changed=<base>` runs the test files whose import graph
// reaches a changed file, following static imports and literal dynamic `import()`s (never
// type-only imports). Three kinds of input sit outside any test's graph, and each runs the whole
// suite instead (`fullSuiteReason`):
//
// - the CLI's boot path: a test runs the CLI as a child (`bun src/index.ts <command>`), so what it
//   imports is not what the child loads. Every run loads `src/index.ts` and what it reaches
//   without the command registry (`bootModules`); the command's own module the test imports
//   itself, which the guard below enforces.
// - the test preload (bunfig's `[test] preload`), which no test imports.
// - every file that is not a JS/TS module — canon YAML and Markdown, fixture trees, golden files,
//   manifests, lockfiles, tool config — since tests and the CLI read those through fs. Only the
//   paths in `UNREAD` are skipped: no test of that suite reads them. And the modules a suite runs
//   without importing them (`RUN_NOT_IMPORTED`: the launcher the pack tests install and run).
//
// The guard (`assertSpawnSelectable`, run by the test preload on every `Bun.spawn`): a test file
// under apps/cli/test that spawns the CLI must reach the dispatched command's module through its
// own imports, or a change to that command would never select it. A test that reads source
// through fs imports what it reads the same way (`support-test-scope.test.ts` holds each one to
// it).

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

/**
 * Repo paths (globs, relative to the root) no test of the suite reads through fs, so a change
 * confined to them leaves the suite to the import graph (a module among them that a test imports
 * is still selected). A test that starts reading one of these paths takes it out of its suite's
 * list here.
 */
const UNREAD_BY_ANY_SUITE = [
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
  'CLAUDE.md',
  'AGENTS.md',
  '.agents/shared.md',
]
export const UNREAD: Readonly<Record<Suite, readonly string[]>> = {
  // The docs table-shape test reads both docs trees.
  unit: UNREAD_BY_ANY_SUITE,
  contract: [...UNREAD_BY_ANY_SUITE, 'docs/**', 'apps/docs/**'],
  integration: [...UNREAD_BY_ANY_SUITE, 'docs/**', 'apps/docs/**'],
}

/** Modules (root-relative globs) a suite runs or installs rather than imports. */
export const RUN_NOT_IMPORTED: Readonly<Record<Suite, readonly string[]>> = {
  unit: [],
  contract: [],
  // pack.test.ts and pack-standalone.test.ts pack the CLI and run its launcher from the tarball.
  integration: ['apps/cli/bin/**'],
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

function closure(entries: readonly string[], read: (file: string) => string): Set<string> {
  const seen = new Set<string>()
  const stack = [...entries]
  while (stack.length > 0) {
    const file = stack.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    if (MODULE.test(file)) stack.push(...importsOf(file, read(file)))
  }
  return seen
}

const readText = (file: string): string => readFileSync(file, 'utf8')

/** Every file `entry` loads (absolute paths, `entry` included). */
export function importClosure(entry: string): Set<string> {
  return closure([resolve(entry)], readText)
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
  return closure([CLI_ENTRY_PATH], (file) => (file === CLI_TS ? withoutRegistry : readText(file)))
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

/** Why a change to `changed` (root-relative paths) needs all of `suite`, if it does. */
export function fullSuiteReason(
  changed: readonly string[],
  suite: Suite,
  graph: { boot: ReadonlySet<string>; preload: ReadonlySet<string> } = {
    boot: bootModules(),
    preload: preloadModules(),
  },
): string | undefined {
  const unread = UNREAD[suite].map((glob) => new Bun.Glob(glob))
  const run = RUN_NOT_IMPORTED[suite].map((glob) => new Bun.Glob(glob))
  for (const file of changed) {
    const abs = join(ROOT_DIR, file)
    if (graph.boot.has(abs)) return `${file} is on the CLI's boot path`
    if (graph.preload.has(abs)) return `${file} is loaded by the test preload`
    if (run.some((glob) => glob.match(file)))
      return `${file} is run, not imported, by the ${suite} suite`
    if (unread.some((glob) => glob.match(file))) continue
    if (!MODULE.test(file)) return `${file} is read outside the import graph`
  }
  return undefined
}

const git = (...args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT_DIR, encoding: 'utf8' }).trim()
const lines = (out: string): string[] => out.split('\n').filter((line) => line.length > 0)

/** The commit `ref` and HEAD share: the base `--changed` compares against. */
export function mergeBase(ref: string): string {
  return git('merge-base', 'HEAD', ref)
}

/**
 * Root-relative paths that differ from `base` in the working tree — committed, staged, unstaged
 * or untracked — the files `bun test --changed=<base>` starts from.
 */
export function changedFiles(base: string): string[] {
  const tracked = lines(git('diff', '--name-only', '--no-renames', base))
  const untracked = lines(git('ls-files', '--others', '--exclude-standard'))
  return [...new Set([...tracked, ...untracked])].toSorted()
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
