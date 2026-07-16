// `perf` scenario — optimize a correct-but-slow function. `bench/measure.ts`
// checks both correctness and a speed threshold: the seeded O(n^2) `dedupe`
// misses it; an O(n) rewrite (e.g. backed by a Set) clears it comfortably
// (verified during authoring: ~445ms naive vs ~1ms optimized on this input).

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'The `dedupe` function in src/dedupe.ts (removes duplicate numbers, ' +
  'keeping first-occurrence order) is implemented with an inefficient ' +
  'nested-loop scan and is too slow on large inputs. Rewrite it to be ' +
  'asymptotically faster (e.g. backed by a `Set`) while preserving its ' +
  'exact behavior: same dedup semantics, same first-occurrence order, all ' +
  'existing tests in src/dedupe.test.ts still pass. `bench/measure.ts` ' +
  'checks both correctness and speed on a large input. ' +
  '(bench-ref: BENCH-PERF-DEDUPE)'

export const perfScenario: Scenario = {
  id: 'perf',
  type: 'perf',
  title: 'perf: dedupe optimization',
  prompt: PROMPT,
  fixtureDir: 'fixtures/perf',
  maxTurns: 120,
  completed: async ({ sandbox }) => {
    const tests = await spawnIn(['bun', 'test'], sandbox)
    if (tests.exitCode !== 0) return false

    const bench = await spawnIn(['bun', 'bench/measure.ts'], sandbox)
    return bench.exitCode === 0
  },
}
