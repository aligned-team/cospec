// `test` scenario — add coverage to an existing, unmodified function.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'The function `priceRange` in src/priceRange.ts (returns the min/max of ' +
  'a list of prices, or `null` for an empty list) has no test coverage at ' +
  'all. Add unit tests in a new src/priceRange.test.ts covering at least: ' +
  'a normal case with several prices, a single-price array, and the ' +
  'empty-array case. Do not change the implementation in ' +
  'src/priceRange.ts. (bench-ref: BENCH-TEST-PRICERANGE)'

const TEST_CASE = /\btest\(|\bit\(/g

export const testScenario: Scenario = {
  id: 'test',
  type: 'test',
  title: 'test: cover priceRange',
  prompt: PROMPT,
  fixtureDir: 'fixtures/test',
  maxTurns: 70,
  completed: async ({ sandbox, exists, readFile }) => {
    if (!(await exists('src/priceRange.test.ts'))) return false
    const testSrc = await readFile('src/priceRange.test.ts')
    if (testSrc === undefined || (testSrc.match(TEST_CASE) ?? []).length < 3) return false

    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
}
