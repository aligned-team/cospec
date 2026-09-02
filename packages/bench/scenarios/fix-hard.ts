// `fix-hard` scenario — a multi-file variant of `fix`: three related bugs,
// one per file, each proven by an already-failing test. Opt-in only — see
// `src/matrix.ts`'s `--hard` flag; never included in the default matrix.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'This is a small token-bucket rate limiter split across three files: ' +
  'src/bucket.ts (the core refill/consume math), src/store.ts (a keyed ' +
  'in-memory store of bucket state), and src/limiter.ts (the public ' +
  'RateLimiter facade). Several existing tests are currently failing, ' +
  'rooted in one bug in each of the three files: a refill test in ' +
  'src/bucket.test.ts, a reset test in src/store.test.ts, and multiple ' +
  'rate-limiting tests in src/limiter.test.ts. Find and fix the underlying ' +
  'bug in each of the three files so every existing test passes. Do not ' +
  'change any public function signature or the test files themselves. ' +
  '(bench-ref: BENCH-FIX-HARD-RATE-LIMITER)'

export const fixHardScenario: Scenario = {
  id: 'fix-hard',
  type: 'fix',
  title: 'fix-hard: multi-file rate-limiter bugs',
  prompt: PROMPT,
  fixtureDir: 'fixtures/fix-hard',
  maxTurns: 150,
  completed: async ({ sandbox }) => {
    const result = await spawnIn(['bun', 'test'], sandbox)
    return result.exitCode === 0
  },
  plantedBug: {
    file: 'src/bucket.ts',
    description:
      'isBucketFull checks `tokens > capacity`, which is never true since ' +
      'tokens is always capped at capacity by refill/createBucket — it should ' +
      'be `tokens >= capacity`. Not called by any of the three failing tests, ' +
      'so fixing them never exercises it.',
    detector: 'planted.test.ts',
  },
}
