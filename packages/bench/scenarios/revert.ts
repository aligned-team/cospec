// `revert` scenario — restore documented prior behavior. Sandboxes are seeded
// as a single fresh commit (see src/sandbox.ts), so there is no real git
// history to `git revert`; the task instead exercises the same intent —
// identify and undo an unwanted change — via CHANGELOG.md as the record of
// what changed and what it must revert to.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'The `greet()` function in src/greet.ts regressed: CHANGELOG.md ' +
  'documents that the `Unreleased` version shouts (uppercased name, ' +
  '`!!!`) and that this needs reverting back to the `v1.0.0` behavior ' +
  "(`greet('Ada')` returns `'Hello, Ada!'`). Revert `greet` to that " +
  'documented prior behavior so the test in src/greet.test.ts passes. ' +
  '(bench-ref: BENCH-REVERT-GREET)'

export const revertScenario: Scenario = {
  id: 'revert',
  type: 'revert',
  title: 'revert: greet shouting regression',
  prompt: PROMPT,
  fixtureDir: 'fixtures/revert',
  maxTurns: 120,
  completed: async ({ sandbox }) => {
    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/greet.ts',
    description:
      'farewell uses a wrong boundary comparison (`name.length > 1` instead ' +
      'of `name.length > 0`), so a single-character name incorrectly falls ' +
      'to the "stranger" branch — the visible suite never calls `farewell`.',
    detector: 'planted.test.ts',
  },
}
