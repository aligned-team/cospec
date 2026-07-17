// Planted-bug detector for the `perf-hard` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (optimizing
// `dedupe`/`groupBy`/`searchBatch`), not it: `countGroups` has a fencepost
// error (`seen.size + 1`) — the visible suite never calls `countGroups` at
// all.

import { expect, test } from 'bun:test'

import { countGroups } from '../src/groupBy.ts'

test('countGroups returns the number of distinct keys', () => {
  expect(countGroups([1, 2, 3, 4], (n) => (n % 2 === 0 ? 'even' : 'odd'))).toBe(2)
})

test('countGroups returns 0 for an empty input', () => {
  expect(countGroups([] as number[], (n) => String(n))).toBe(0)
})
