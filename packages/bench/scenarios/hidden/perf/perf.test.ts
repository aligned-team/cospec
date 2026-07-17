// Held-out hidden test suite for the `perf` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
//
// `dedupe`'s correctness never changes between "not done" and "done" here —
// the seeded nested-loop implementation is already functionally correct, only
// slow — so the ONLY invariant that can discriminate "task done" is speed.
// The two timing cases below use data profiles and size/threshold numbers
// DIFFERENT from `bench/measure.ts` (the scenario's own visible acceptance
// check, N=15000/range=7500/150ms) specifically so an implementation
// special-cased to that one profile would not also clear these — calibrated
// empirically (cold, single-shot `bun` process, no JIT warmup, this
// machine): the unmodified nested-loop implementation took ~1000-1400ms on
// the 20000/12000 profile and ~360-395ms on the fully-unique 10000 profile; a
// Set-backed rewrite takes ~1ms on both. Thresholds sit far below the slow
// numbers and far above the fast ones for margin. The remaining two cases are
// non-discriminating regression guards (already true on the unmodified
// fixture) — cheap correctness checks that a rewrite must not regress.

import { expect, test } from 'bun:test'

import { dedupe } from '../src/dedupe.ts'

test('dedupe stays fast on a large input with a large result set (20000 values, range 12000)', () => {
  const input: number[] = []
  for (let i = 0; i < 20000; i += 1) input.push(i % 12000)
  const expectedUnique = new Set(input).size

  const start = performance.now()
  const result = dedupe(input)
  const elapsedMs = performance.now() - start

  expect(new Set(result).size).toBe(result.length)
  expect(result.length).toBe(expectedUnique)
  expect(elapsedMs).toBeLessThan(400)
})

test('dedupe stays fast on a large fully-unique input (10000 distinct values)', () => {
  const input: number[] = []
  for (let i = 0; i < 10000; i += 1) input.push(i)

  const start = performance.now()
  const result = dedupe(input)
  const elapsedMs = performance.now() - start

  expect(result).toEqual(input)
  expect(elapsedMs).toBeLessThan(200)
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
