// Held-out hidden test suite for the `fix-hard` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Every export already exists on the unmodified fixture (this is a `fix`
// task, not a `feat`), so these are deeper/edge-case checks on the three
// bugs the task must fix — each one fails against the unmodified fixture and
// passes once all three are correctly fixed.

import { expect, test } from 'bun:test'

import { refill, tryConsume } from '../src/bucket.ts'
import { RateLimiter } from '../src/limiter.ts'
import { BucketStore } from '../src/store.ts'
import type { BucketConfig } from '../src/types.ts'

const CONFIG: BucketConfig = { capacity: 10, refillPerSecond: 2 }

test('refill grants exactly refillPerSecond * elapsedSeconds for a non-1000ms interval', () => {
  const state = refill(CONFIG, { tokens: 0, lastRefillMs: 0 }, 2500)
  expect(state.tokens).toBe(5)
})

test('refill accumulates correctly across two successive fractional-second calls', () => {
  const once = refill(CONFIG, { tokens: 0, lastRefillMs: 0 }, 500)
  const twice = refill(CONFIG, once, 1000)
  expect(twice.tokens).toBe(2)
})

test('tryConsume succeeds once a fractional-second refill grants enough tokens', () => {
  const result = tryConsume(CONFIG, { tokens: 0, lastRefillMs: 0 }, 1, 500)
  expect(result.allowed).toBe(true)
  expect(result.state.tokens).toBe(0)
})

test('BucketStore.reset restores the FULL configured capacity, not capacity - 1', () => {
  const store = new BucketStore({ capacity: 7, refillPerSecond: 1 })
  store.set('a', { tokens: 0, lastRefillMs: 0 })
  store.reset('a', 100)
  expect(store.getOrCreate('a', 100)).toEqual({ tokens: 7, lastRefillMs: 100 })
})

test('BucketStore.reset works for a key that was never created before', () => {
  const store = new BucketStore({ capacity: 4, refillPerSecond: 1 })
  store.reset('never-seen', 0)
  expect(store.getOrCreate('never-seen', 0).tokens).toBe(4)
})

test('RateLimiter.allow actually persists consumed tokens across many calls', () => {
  const limiter = new RateLimiter({ capacity: 20, refillPerSecond: 0 })
  let allowedCount = 0
  for (let i = 0; i < 25; i += 1) {
    if (limiter.allow('a', 1, 0)) allowedCount += 1
  }
  expect(allowedCount).toBe(20)
})

test('RateLimiter.allow respects fractional-second refill accumulated across calls', () => {
  const limiter = new RateLimiter({ capacity: 10, refillPerSecond: 2 })
  expect(limiter.allow('a', 10, 0)).toBe(true)
  expect(limiter.allow('a', 1, 250)).toBe(false)
  expect(limiter.allow('a', 1, 500)).toBe(true)
})

test('RateLimiter tracks independent buckets for different keys under refill', () => {
  const limiter = new RateLimiter({ capacity: 3, refillPerSecond: 0 })
  expect(limiter.allow('x', 3, 0)).toBe(true)
  expect(limiter.allow('x', 1, 0)).toBe(false)
  expect(limiter.allow('y', 3, 0)).toBe(true)
  expect(limiter.allow('y', 1, 0)).toBe(false)
})

test('refill at 1750ms and refillPerSecond=4 grants exactly 7, not a floor-truncated 4', () => {
  const state = refill({ capacity: 10, refillPerSecond: 4 }, { tokens: 0, lastRefillMs: 0 }, 1750)
  expect(state.tokens).toBe(7)
})
