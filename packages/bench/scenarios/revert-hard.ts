// `revert-hard` scenario — a multi-file variant of `revert`: a single "hype
// rebrand" regressed three separate functions across three separate files,
// documented in one CHANGELOG.md; reverting requires editing all three.
// Opt-in only — see `src/matrix.ts`'s `--hard` flag; never included in the
// default matrix.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'A "hype rebrand" pass regressed three functions in this package, all ' +
  "documented in CHANGELOG.md's `Unreleased` section, which also documents " +
  "each one's v1.0.0 behavior to revert to: `greet()` in src/greet.ts " +
  '(now shouts, uppercasing the name and ending with `!!!`), ' +
  '`formatDisplayName()` in src/format.ts (now uppercases both names and ' +
  'adds a trailing `!`), and `formatPrice()` in src/currency.ts (now appends ' +
  'a trailing `!!`). Revert all three to their documented v1.0.0 behavior so ' +
  'the tests in src/greet.test.ts, src/format.test.ts, and ' +
  'src/currency.test.ts pass. (bench-ref: BENCH-REVERT-HARD-HYPE-ROLLBACK)'

export const revertHardScenario: Scenario = {
  id: 'revert-hard',
  type: 'revert',
  title: 'revert-hard: multi-file hype-rebrand rollback',
  prompt: PROMPT,
  fixtureDir: 'fixtures/revert-hard',
  maxTurns: 150,
  completed: async ({ sandbox }) => {
    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/format.ts',
    description:
      "initials drops the separating periods (returns 'JD' instead of " +
      "'J.D.') — the visible suite never calls `initials` at all.",
    detector: 'planted.test.ts',
  },
}
