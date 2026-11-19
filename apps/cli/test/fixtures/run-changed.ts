// `mise run test:changed -- [--base <ref> | --staged | --push] [--no-parallel] <suite>...
// [-- <bun test flag>...]` — run the part of each apps/cli test suite (unit, contract,
// integration) that a change can affect: the test files whose import graph reaches a changed file
// or that read it through fs, or the whole suite for an input every test depends on
// (test/fixtures/test-scope.ts). The change is one of:
//
//   --base <ref>  what differs from the commit HEAD and <ref> share, committed or not (the
//                 default, HEAD, is what is uncommitted); PR CI passes the PR's base
//   --staged      what the commit about to be made changes (the pre-commit hook)
//   --push        what a push changes, read from stdin: a `<remote> <url>` line, then the
//                 `<local ref> <local sha> <remote ref> <remote sha>` lines git hands a pre-push
//                 hook (hk passes them on as `hook_args` and `hook_stdin`)
//
// Each suite's files run with `--parallel` unless `--no-parallel` is given: CI runs them one at a
// time, since a runner has too few cores for the subprocess-heavy files to share. Flags after `--`
// go to every `bun test` run as they are (CI's `--shard` and `--timings`).

import {
  changedFiles,
  CLI_DIR,
  mergeBase,
  type PushChange,
  pushedFiles,
  selectTests,
  stagedFiles,
  type Suite,
  SUITES,
} from './test-scope.ts'

const USAGE =
  'usage: run-changed.ts [--base <ref> | --staged | --push] [--no-parallel] ' +
  '<unit|contract|integration>... [-- <bun test flag>...]'

export type Source = { kind: 'base'; ref: string } | { kind: 'staged' } | { kind: 'push' }

export interface Options {
  source: Source
  suites: Suite[]
  parallel: boolean
  forward: string[]
}

/** The runner's options, or why `argv` is not a valid invocation. */
export function parseArgs(argv: readonly string[]): Options | string {
  let source: Source = { kind: 'base', ref: 'HEAD' }
  const suites: Suite[] = []
  let parallel = true
  let forward: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--') {
      forward = argv.slice(i + 1)
      break
    }
    if (arg === '--no-parallel') parallel = false
    else if (arg === '--base') {
      const value = argv[++i]
      if (value === undefined || value.length === 0) return '--base needs a ref'
      source = { kind: 'base', ref: value }
    } else if (arg === '--staged') source = { kind: 'staged' }
    else if (arg === '--push') source = { kind: 'push' }
    else if ((SUITES as readonly string[]).includes(arg)) suites.push(arg as Suite)
    else return `unknown argument '${arg}'`
  }
  return suites.length === 0 ? 'name at least one suite' : { source, suites, parallel, forward }
}

async function change(source: Source): Promise<{ what: string } & PushChange> {
  switch (source.kind) {
    case 'base': {
      const base = mergeBase(source.ref)
      return { what: `the changes since ${base.slice(0, 12)}`, files: changedFiles(base) }
    }
    case 'staged':
      return { what: 'the staged changes', files: stagedFiles() }
    case 'push': {
      const input = (await Bun.stdin.text()).split('\n').filter((line) => line.trim() !== '')
      const remote = input.at(0)?.trim().split(/\s+/).at(0) ?? 'origin'
      return { what: `the push to ${remote}`, ...pushedFiles(input.slice(1), remote) }
    }
  }
}

/** The `bun test` argv (after the executable) that runs `targets` under `options`. */
export function bunTestArgs(options: Options, targets: readonly string[]): string[] {
  return [
    'test',
    ...targets,
    ...(options.parallel ? ['--parallel'] : []),
    '--timeout',
    '30000',
    ...options.forward,
  ]
}

async function main(): Promise<number> {
  const parsed = parseArgs(Bun.argv.slice(2))
  if (typeof parsed === 'string') {
    console.error(`test:changed: ${parsed}\n${USAGE}`)
    return 2
  }
  const { what, ...changed } = await change(parsed.source)
  let failed = 0
  for (const suite of parsed.suites) {
    const selection: ReturnType<typeof selectTests> =
      'unknown' in changed ? { whole: changed.unknown } : selectTests(suite, changed.files)
    let targets: string[]
    if ('whole' in selection) {
      console.log(`test:changed ${suite}: the whole suite — ${selection.whole}`)
      targets = [`./test/${suite}`]
    } else {
      targets = selection.tests.map((file) => `./${file}`)
      const files = 'files' in changed ? changed.files.length : 0
      console.log(
        `test:changed ${suite}: ${targets.length} test file(s) ${what} reach (${files} changed file(s))`,
      )
      if (targets.length === 0) continue
    }
    const run = Bun.spawnSync([process.execPath, ...bunTestArgs(parsed, targets)], {
      cwd: CLI_DIR,
      stdio: ['inherit', 'inherit', 'inherit'],
    })
    if (run.exitCode !== 0 && failed === 0) failed = run.exitCode ?? 1
  }
  return failed
}

if (import.meta.main) process.exit(await main())
