import { tryConsume } from './bucket.ts'
import { BucketStore } from './store.ts'
import type { BucketConfig } from './types.ts'

/** Public facade: a keyed token-bucket rate limiter. */
export class RateLimiter {
  private readonly store: BucketStore

  constructor(private readonly config: BucketConfig) {
    this.store = new BucketStore(config)
  }

  /** Attempt to consume `cost` tokens from `key`'s bucket at `nowMs`. */
  allow(key: string, cost: number, nowMs: number): boolean {
    const state = this.store.getOrCreate(key, nowMs)
    const result = tryConsume(this.config, state, cost, nowMs)
    return result.allowed
  }

  reset(key: string, nowMs: number): void {
    this.store.reset(key, nowMs)
  }
}
