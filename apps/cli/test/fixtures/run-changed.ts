// `mise run test:changed -- [--base <ref> | --staged | --push] <suite>...` — run the part of each
// apps/cli test suite (unit, contract, integration) that a change can affect: the test files whose
// import graph reaches a changed file, or the whole suite when a change sits outside the graph
// (test/fixtures/test-scope.ts). The change is one of:
//
//   --base <ref>  what differs from the commit HEAD and <ref> share, committed or not (the
//                 default, HEAD, is what is uncommitted); PR CI passes the PR's base
//   --staged      what the commit about to be made changes (the pre-commit hook)
//   --push        what a push changes, read from stdin: a `<remote> <url>` line, then the
//                 `<local ref> <local sha> <remote ref> <remote sha>` lines git hands a pre-push
//                 hook (hk passes them on as `hook_args` and `hook_stdin`)

import {
  changedFiles,
  CLI_DIR,
  fullSuiteReason,
  mergeBase,
  type PushChange,
  pushedFiles,
  stagedFiles,
  type Suite,
  SUITES,
  testsReaching,
} from './test-scope.ts'

const USAGE =
  'usage: run-changed.ts [--base <ref> | --staged | --push] <unit|contract|integration>...'

type Source = { kind: 'base'; ref: string } | { kind: 'staged' } | { kind: 'push' }

function parse(argv: readonly string[]): { source: Source; suites: Suite[] } | string {
  let source: Source = { kind: 'base', ref: 'HEAD' }
  const suites: Suite[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--base') {
      const value = argv[++i]
      if (value === undefined || value.length === 0) return '--base needs a ref'
      source = { kind: 'base', ref: value }
    } else if (arg === '--staged') source = { kind: 'staged' }
    else if (arg === '--push') source = { kind: 'push' }
    else if ((SUITES as readonly string[]).includes(arg)) suites.push(arg as Suite)
    else return `unknown argument '${arg}'`
  }
  return suites.length === 0 ? 'name at least one suite' : { source, suites }
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

const parsed = parse(Bun.argv.slice(2))
if (typeof parsed === 'string') {
  console.error(`test:changed: ${parsed}\n${USAGE}`)
  process.exit(2)
}
const { what, ...changed } = await change(parsed.source)
let failed = 0
for (const suite of parsed.suites) {
  const reason = 'unknown' in changed ? changed.unknown : fullSuiteReason(changed.files, suite)
  let targets: string[]
  if (reason !== undefined) {
    console.log(`test:changed ${suite}: the whole suite — ${reason}`)
    targets = [`./test/${suite}`]
  } else {
    const files = 'files' in changed ? changed.files : []
    targets = testsReaching(suite, files).map((file) => `./${file}`)
    console.log(
      `test:changed ${suite}: ${targets.length} test file(s) ${what} reach (${files.length} changed file(s))`,
    )
    if (targets.length === 0) continue
  }
  const run = Bun.spawnSync([process.execPath, 'test', ...targets, '--timeout', '30000'], {
    cwd: CLI_DIR,
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  if (run.exitCode !== 0 && failed === 0) failed = run.exitCode ?? 1
}
process.exit(failed)
