// Held-out hidden test suite for the `perf-hard` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
//
// None of the three functions' correctness changes between "not done" and
// "done" — the seeded implementations are already functionally correct, only
// slow — so the discriminating cases are timing checks. Each uses a data
// profile and threshold DIFFERENT from `bench/measure.ts` (the scenario's own
// visible acceptance check: dedupe 15000/7000/150ms, groupBy 20000/9000/80ms,
// search 1500docs/40words/60vocab/200queries/150ms) specifically so an
// implementation special-cased to those exact profiles would not also clear
// these — calibrated empirically (cold, single-shot `bun` process, no JIT
// warmup, this machine): the unmodified implementations took ~1340ms
// (dedupe, 25000/15000 profile), ~375ms (groupBy, 30000/12000 profile), and
// ~815ms (search, 2500 docs/30 words/80 vocab/300 queries); a Set/Map/index
// -backed rewrite takes ~1-10ms on all three. Thresholds sit far below the
// slow numbers and far above the fast ones for margin. The remaining cases
// are non-discriminating regression guards (already true on the unmodified
// fixture) — cheap correctness checks a rewrite must not regress.

import { expect, test } from 'bun:test'

import { dedupe } from '../src/dedupe.ts'
import { groupBy } from '../src/groupBy.ts'
import { searchBatch } from '../src/search.ts'
import type { Doc } from '../src/search.ts'

test('dedupe stays fast on a large input with a large result set (25000 values, range 15000)', () => {
  const input: number[] = []
  for (let i = 0; i < 25000; i += 1) input.push(i % 15000)
  const expectedUnique = new Set(input).size

  const start = performance.now()
  const result = dedupe(input)
  const elapsedMs = performance.now() - start

  expect(new Set(result).size).toBe(result.length)
  expect(result.length).toBe(expectedUnique)
  expect(elapsedMs).toBeLessThan(400)
})

test('groupBy stays fast on a large input (30000 items, range 12000)', () => {
  const items: number[] = []
  for (let i = 0; i < 30000; i += 1) items.push(i % 12000)

  const start = performance.now()
  const groups = groupBy(items, (n) => String(n))
  const elapsedMs = performance.now() - start

  expect(groups.size).toBe(12000)
  expect(elapsedMs).toBeLessThan(150)
})

test('searchBatch stays fast on a larger document/query set (2500 docs, 300 queries)', () => {
  const docs: Doc[] = []
  for (let i = 0; i < 2500; i += 1) {
    const words: string[] = []
    for (let w = 0; w < 30; w += 1) words.push(`term${(i + w) % 80}`)
    docs.push({ id: `d${i}`, text: words.join(' ') })
  }
  const queries: string[] = []
  for (let i = 0; i < 300; i += 1) queries.push(`term${i % 80}`)

  const start = performance.now()
  const result = searchBatch(docs, queries)
  const elapsedMs = performance.now() - start

  expect((result['term0'] ?? []).length).toBeGreaterThan(0)
  expect(elapsedMs).toBeLessThan(300)
})

test('dedupe handles negative numbers and interspersed repeats correctly', () => {
  expect(dedupe([-1, 2, -1, 3, 2])).toEqual([-1, 2, 3])
})

test('dedupe does not mutate the input array', () => {
  const input = [3, 1, 3, 2]
  const before = [...input]
  dedupe(input)
  expect(input).toEqual(before)
})

test('groupBy preserves first-seen group order for a fresh key set', () => {
  const groups = groupBy(['a', 'bb', 'ccc', 'dd', 'e'], (s) => String(s.length))
  expect([...groups.keys()]).toEqual(['1', '2', '3'])
})

test('groupBy puts every item into exactly one group when all keys are equal', () => {
  const groups = groupBy([1, 2, 3, 4], () => 'same')
  expect(groups.size).toBe(1)
  expect(groups.get('same')).toEqual([1, 2, 3, 4])
})

test('searchBatch returns an empty array for a query that matches nothing', () => {
  const docs: Doc[] = [{ id: 'a', text: 'hello world' }]
  const result = searchBatch(docs, ['nope'])
  expect(result['nope']).toEqual([])
})
