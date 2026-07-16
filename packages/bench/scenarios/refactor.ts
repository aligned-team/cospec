// `refactor` scenario — behavior-preserving deduplication of copy-pasted
// validation logic.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const DUPLICATED_LITERAL = 'must be a non-empty string'

const PROMPT =
  'src/validators.ts has the same non-empty-string guard duplicated across ' +
  '`validateEmail`, `validateUsername`, and `validatePassword` (the ' +
  `literal reason string \`'${DUPLICATED_LITERAL}'\` is copy-pasted three ` +
  'times). Refactor to remove the duplication — e.g. extract a shared ' +
  "helper — without changing any function's observable behavior. All " +
  'existing tests in src/validators.test.ts must keep passing. ' +
  '(bench-ref: BENCH-REFACTOR-VALIDATORS)'

export const refactorScenario: Scenario = {
  id: 'refactor',
  type: 'refactor',
  title: 'refactor: deduplicate validators',
  prompt: PROMPT,
  fixtureDir: 'fixtures/refactor',
  maxTurns: 120,
  completed: async ({ sandbox, readFile }) => {
    const src = await readFile('src/validators.ts')
    if (src === undefined) return false
    const occurrences = src.split(DUPLICATED_LITERAL).length - 1
    if (occurrences === 0 || occurrences >= 3) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
}
