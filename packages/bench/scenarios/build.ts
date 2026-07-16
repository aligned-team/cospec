// `build` scenario — add a missing bundling step to a tiny package. Fixture dir
// is named `build-script` (not `build`) because the repo's root .gitignore
// unanchored-matches any directory literally named `build/` as a build-output
// dir; see the fixture's own note in this file's history for context.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'This package (src/index.ts, a tiny greeting module) has no build step: ' +
  'package.json has no `build` script and there is no bundler config. Add a ' +
  '`build` script to package.json that bundles `src/index.ts` into ' +
  '`dist/index.js` for Node (e.g. `bun build ./src/index.ts --outdir dist ' +
  '--target node`), and make sure running it actually produces ' +
  '`dist/index.js`. (bench-ref: BENCH-BUILD-BUNDLE)'

export const buildScenario: Scenario = {
  id: 'build',
  type: 'build',
  title: 'build: add a bundling step',
  prompt: PROMPT,
  fixtureDir: 'fixtures/build-script',
  maxTurns: 30,
  completed: async ({ sandbox, exists }) => {
    const result = await spawnIn(['bun', 'run', 'build'], sandbox)
    if (result.exitCode !== 0) return false
    return exists('dist/index.js')
  },
}
