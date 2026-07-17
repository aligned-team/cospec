// Planted-bug detector for the `perf` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (`dedupe`), not
// it: `countUnique` has a fencepost error (`seen.size + 1`) — the visible
// suite in `src/dedupe.test.ts` never calls `countUnique` at all.

import { expect, test } from 'bun:test'

import { countUnique } from '../src/dedupe.ts'

test('countUnique counts each distinct value exactly once', () => {
  expect(countUnique([1, 2, 1, 3, 2, 4])).toBe(4)
})

test('countUnique returns 0 for an empty input', () => {
  expect(countUnique([])).toBe(0)
})

test('countUnique on an input with no duplicates', () => {
  expect(countUnique([5, 6, 7])).toBe(3)
})
