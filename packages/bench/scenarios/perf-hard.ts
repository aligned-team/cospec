// `perf-hard` scenario — a multi-file variant of `perf`: three correct-but-slow
// functions across three files, each with its own asymptotic bottleneck.
// `bench/measure.ts` checks correctness and independent speed thresholds for
// all three. Opt-in only — see `src/matrix.ts`'s `--hard` flag; never
// included in the default matrix.

import { spawnIn } from '../src/sandbox.ts'
import type { Scenario } from './types.ts'

const PROMPT =
  'Three functions here are asymptotically slow on large inputs: `dedupe` in ' +
  'src/dedupe.ts (removes duplicate numbers, keeping first-occurrence order — ' +
  'implemented with a nested-loop scan), `groupBy` in src/groupBy.ts (groups ' +
  'items by a key function, preserving first-seen group order — implemented ' +
  'by linearly re-scanning the groups built so far for every item), and ' +
  '`searchBatch` in src/search.ts (for each query term, returns the ids of ' +
  'docs containing that exact word — implemented by re-tokenizing and ' +
  're-scanning every doc for every query). Rewrite all three to be ' +
  'asymptotically faster (e.g. Set/Map-backed, or a term index built once) ' +
  "while preserving each one's exact behavior and existing tests in " +
  'src/dedupe.test.ts, src/groupBy.test.ts, and src/search.test.ts. ' +
  '`bench/measure.ts` checks both correctness and an independent speed ' +
  'threshold for each of the three. (bench-ref: BENCH-PERF-HARD-TRIPLE)'

export const perfHardScenario: Scenario = {
  id: 'perf-hard',
  type: 'perf',
  title: 'perf-hard: multi-file triple optimization',
  prompt: PROMPT,
  fixtureDir: 'fixtures/perf-hard',
  maxTurns: 150,
  completed: async ({ sandbox }) => {
    const tests = await spawnIn(['bun', 'test'], sandbox)
    if (tests.exitCode !== 0) return false

    const bench = await spawnIn(['bun', 'bench/measure.ts'], sandbox)
    return bench.exitCode === 0
  },
  plantedBug: {
    file: 'src/groupBy.ts',
    description:
      'countGroups has a fencepost error (`seen.size + 1`) — the visible ' +
      'suite never calls `countGroups` at all.',
    detector: 'planted.test.ts',
  },
}
