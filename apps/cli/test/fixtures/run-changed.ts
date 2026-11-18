// `mise run test:changed -- [--base <ref>] <suite>...` — run the part of each apps/cli test suite
// (unit, contract, integration) that the changes since `<ref>` (default HEAD, so the uncommitted
// ones) can affect: `bun test --changed` from the commit HEAD and `<ref>` share, or the whole
// suite when a change sits outside the import graph (test/fixtures/test-scope.ts). The git hooks
// and PR CI run this; pushes to main, the merge queue and releases run every suite whole.

import {
  changedFiles,
  CLI_DIR,
  fullSuiteReason,
  mergeBase,
  type Suite,
  SUITES,
} from './test-scope.ts'

const USAGE = 'usage: run-changed.ts [--base <ref>] <unit|contract|integration>...'

function parse(argv: readonly string[]): { ref: string; suites: Suite[] } | string {
  let ref = 'HEAD'
  const suites: Suite[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--base') {
      const value = argv[++i]
      if (value === undefined || value.length === 0) return '--base needs a ref'
      ref = value
    } else if ((SUITES as readonly string[]).includes(arg)) suites.push(arg as Suite)
    else return `unknown argument '${arg}'`
  }
  return suites.length === 0 ? 'name at least one suite' : { ref, suites }
}

const parsed = parse(Bun.argv.slice(2))
if (typeof parsed === 'string') {
  console.error(`test:changed: ${parsed}\n${USAGE}`)
  process.exit(2)
}
const { ref, suites } = parsed
const base = mergeBase(ref)
const changed = changedFiles(base)
let failed = 0
for (const suite of suites) {
  const reason = fullSuiteReason(changed, suite)
  const scope = reason === undefined ? [`--changed=${base}`] : []
  console.log(
    reason === undefined
      ? `test:changed ${suite}: the tests ${changed.length} changed file(s) since ${base.slice(0, 12)} reach`
      : `test:changed ${suite}: the whole suite — ${reason}`,
  )
  const run = Bun.spawnSync(
    [process.execPath, 'test', `./test/${suite}`, '--timeout', '30000', ...scope],
    { cwd: CLI_DIR, stdio: ['inherit', 'inherit', 'inherit'] },
  )
  if (run.exitCode !== 0 && failed === 0) failed = run.exitCode ?? 1
}
process.exit(failed)
