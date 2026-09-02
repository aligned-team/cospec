// `refactor-hard` scenario — a multi-file variant of `refactor`: the same
// duplicated guard, copy-pasted across THREE SEPARATE FILES rather than
// three functions in one file, so removing the duplication requires editing
// all three plus (typically) adding a new shared module. Opt-in only — see
// `src/matrix.ts`'s `--hard` flag; never included in the default matrix.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const DUPLICATED_LITERAL = 'must be a non-empty string'

const PROMPT =
  'src/email.ts, src/username.ts, and src/password.ts each independently ' +
  `duplicate the same non-empty-string guard (the literal reason string ` +
  `\`'${DUPLICATED_LITERAL}'\` is copy-pasted across all three files). ` +
  'Refactor to remove the duplication across these three files — e.g. ' +
  'extract a shared helper into a new module and import it from all three ' +
  "— without changing any function's observable behavior. All existing " +
  'tests in src/email.test.ts, src/username.test.ts, and ' +
  'src/password.test.ts must keep passing. ' +
  '(bench-ref: BENCH-REFACTOR-HARD-VALIDATORS)'

export const refactorHardScenario: Scenario = {
  id: 'refactor-hard',
  type: 'refactor',
  title: 'refactor-hard: deduplicate validators across files',
  prompt: PROMPT,
  fixtureDir: 'fixtures/refactor-hard',
  maxTurns: 150,
  completed: async ({ sandbox, readFile }) => {
    const files = await Promise.all(
      ['src/email.ts', 'src/username.ts', 'src/password.ts'].map((rel) => readFile(rel)),
    )
    if (files.some((f) => f === undefined)) return false
    const occurrences = files
      .map((f) => (f ?? '').split(DUPLICATED_LITERAL).length - 1)
      .reduce((a, b) => a + b, 0)
    // Must have been de-duplicated: fewer than the original 3 independent
    // hardcoded occurrences (one per file).
    if (occurrences >= 3) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/age.ts',
    description:
      'validateAge rejects the boundary value 120 (`age >= 120` instead of ' +
      '`age > 120`) — the visible suite never calls `validateAge` at all.',
    detector: 'planted.test.ts',
  },
}
