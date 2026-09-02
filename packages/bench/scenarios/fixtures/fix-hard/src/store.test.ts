import { expect, test } from 'bun:test'

import { BucketStore } from './store.ts'
import type { BucketConfig } from './types.ts'

const CONFIG: BucketConfig = { capacity: 10, refillPerSecond: 2 }

test('getOrCreate creates a fresh bucket for an unknown key', () => {
  const store = new BucketStore(CONFIG)
  expect(store.getOrCreate('a', 0)).toEqual({ tokens: 10, lastRefillMs: 0 })
})

test('getOrCreate returns the same stored bucket on a second call', () => {
  const store = new BucketStore(CONFIG)
  const first = store.getOrCreate('a', 0)
  store.set('a', { tokens: 3, lastRefillMs: 0 })
  expect(store.getOrCreate('a', 100)).toEqual({ tokens: 3, lastRefillMs: 0 })
  expect(first).toEqual({ tokens: 10, lastRefillMs: 0 })
})

test('reset restores a key to a fully-topped-up bucket', () => {
  const store = new BucketStore(CONFIG)
  store.set('a', { tokens: 1, lastRefillMs: 0 })
  store.reset('a', 500)
  expect(store.getOrCreate('a', 500)).toEqual({ tokens: 10, lastRefillMs: 500 })
})

test('has reports whether a key has ever been created', () => {
  const store = new BucketStore(CONFIG)
  expect(store.has('a')).toBe(false)
  store.getOrCreate('a', 0)
  expect(store.has('a')).toBe(true)
})
