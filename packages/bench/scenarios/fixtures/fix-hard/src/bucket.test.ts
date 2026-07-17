import { expect, test } from 'bun:test'

import { createBucket, refill, tryConsume } from './bucket.ts'
import type { BucketConfig } from './types.ts'

const CONFIG: BucketConfig = { capacity: 10, refillPerSecond: 2 }

test('createBucket starts fully topped up', () => {
  expect(createBucket(CONFIG, 0)).toEqual({ tokens: 10, lastRefillMs: 0 })
})

test('createBucket throws for a non-positive capacity', () => {
  expect(() => createBucket({ capacity: 0, refillPerSecond: 1 }, 0)).toThrow()
})

test('refill grants tokens proportional to elapsed time, including fractional seconds', () => {
  const state = refill(CONFIG, { tokens: 0, lastRefillMs: 0 }, 1500)
  expect(state.tokens).toBe(3)
})

test('refill caps at capacity', () => {
  const state = refill(CONFIG, { tokens: 9, lastRefillMs: 0 }, 5000)
  expect(state.tokens).toBe(10)
})

test('refill is a no-op when no time has elapsed', () => {
  const state = refill(CONFIG, { tokens: 4, lastRefillMs: 1000 }, 1000)
  expect(state).toEqual({ tokens: 4, lastRefillMs: 1000 })
})

test('tryConsume succeeds and deducts tokens when enough are available', () => {
  const result = tryConsume(CONFIG, { tokens: 10, lastRefillMs: 0 }, 4, 0)
  expect(result.allowed).toBe(true)
  expect(result.state.tokens).toBe(6)
})

test('tryConsume fails without deducting when not enough tokens are available', () => {
  const result = tryConsume(CONFIG, { tokens: 2, lastRefillMs: 0 }, 4, 0)
  expect(result.allowed).toBe(false)
  expect(result.state.tokens).toBe(2)
})

test('tryConsume throws for a negative cost', () => {
  expect(() => tryConsume(CONFIG, { tokens: 10, lastRefillMs: 0 }, -1, 0)).toThrow()
})
