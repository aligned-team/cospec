// `fix` scenario — repair a bug proven by an already-failing test.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  "There's a bug in `truncate` in src/strings.ts: " +
  "`truncate('hello world', 5)` should return `'hello…'` but currently " +
  'returns a string with an extra character before the ellipsis. Fix ' +
  '`truncate` so the existing tests in src/strings.test.ts pass. ' +
  '(bench-ref: BENCH-FIX-TRUNCATE)'

export const fixScenario: Scenario = {
  id: 'fix',
  type: 'fix',
  title: 'fix: truncate off-by-one',
  prompt: PROMPT,
  fixtureDir: 'fixtures/fix',
  maxTurns: 120,
  completed: async ({ sandbox }) => {
    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
}
