import { expect, test } from 'bun:test'

import { RateLimiter } from './limiter.ts'
import type { BucketConfig } from './types.ts'

const CONFIG: BucketConfig = { capacity: 3, refillPerSecond: 0 }

test('allow permits requests up to capacity and then denies further ones', () => {
  const limiter = new RateLimiter(CONFIG)
  expect(limiter.allow('a', 1, 0)).toBe(true)
  expect(limiter.allow('a', 1, 0)).toBe(true)
  expect(limiter.allow('a', 1, 0)).toBe(true)
  expect(limiter.allow('a', 1, 0)).toBe(false)
})

test('allow tracks separate buckets per key', () => {
  const limiter = new RateLimiter(CONFIG)
  expect(limiter.allow('a', 3, 0)).toBe(true)
  expect(limiter.allow('a', 1, 0)).toBe(false)
  expect(limiter.allow('b', 1, 0)).toBe(true)
})

test('reset restores a key to full capacity', () => {
  const limiter = new RateLimiter(CONFIG)
  limiter.allow('a', 3, 0)
  expect(limiter.allow('a', 1, 0)).toBe(false)
  limiter.reset('a', 0)
  expect(limiter.allow('a', 3, 0)).toBe(true)
})
