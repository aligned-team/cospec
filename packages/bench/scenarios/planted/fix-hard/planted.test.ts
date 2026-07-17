// Planted-bug detector for the `fix-hard` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (the three
// refill/store/limiter bugs), not it: `isBucketFull` checks
// `tokens > capacity`, which is never true since tokens is always capped at
// capacity — it should be `tokens >= capacity`. None of the three failing
// tests the task fixes call it.

import { expect, test } from 'bun:test'

import { isBucketFull } from '../src/bucket.ts'
import type { BucketConfig } from '../src/types.ts'

const CONFIG: BucketConfig = { capacity: 10, refillPerSecond: 2 }

test('isBucketFull is true when tokens exactly equal capacity', () => {
  expect(isBucketFull(CONFIG, { tokens: 10, lastRefillMs: 0 })).toBe(true)
})

test('isBucketFull is false when tokens are below capacity', () => {
  expect(isBucketFull(CONFIG, { tokens: 9, lastRefillMs: 0 })).toBe(false)
})
