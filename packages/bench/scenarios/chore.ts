// `chore` scenario — routine maintenance with no behavior/source change: pin an
// engines field and patch .gitignore.

import type { Scenario } from './types.ts'

const PROMPT =
  "This package's package.json doesn't declare its minimum Bun version, " +
  'even though README.md says it requires Bun >= 1.3. Also, `.gitignore` is ' +
  'missing an entry for the `dist/` build-output directory. Add ' +
  '`"engines": { "bun": ">=1.3.0" }` to package.json, and add a `dist/` line ' +
  'to `.gitignore`. Purely maintenance — no source or behavior changes. ' +
  '(bench-ref: BENCH-CHORE-ENGINES)'

interface PackageJsonShape {
  engines?: { bun?: string }
}

export const choreScenario: Scenario = {
  id: 'chore',
  type: 'chore',
  title: 'chore: pin the Bun engines field',
  prompt: PROMPT,
  fixtureDir: 'fixtures/chore',
  maxTurns: 30,
  completed: async ({ readFile }) => {
    const pkgText = await readFile('package.json')
    if (pkgText === undefined) return false
    let pkg: PackageJsonShape
    try {
      pkg = JSON.parse(pkgText) as PackageJsonShape
    } catch {
      return false
    }
    const enginesOk = /1\.3/.test(pkg.engines?.bun ?? '')

    const gitignore = await readFile('.gitignore')
    const gitignoreOk = gitignore !== undefined && /^dist\/?\s*$/m.test(gitignore)

    return enginesOk && gitignoreOk
  },
}
