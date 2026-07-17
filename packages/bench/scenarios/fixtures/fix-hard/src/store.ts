import { createBucket } from './bucket.ts'
import type { BucketConfig, BucketState } from './types.ts'

/** A keyed in-memory store of bucket state, one bucket per key. */
export class BucketStore {
  private readonly buckets = new Map<string, BucketState>()

  constructor(private readonly config: BucketConfig) {}

  /** Return the existing bucket for `key`, or create and store a fresh one at `nowMs`. */
  getOrCreate(key: string, nowMs: number): BucketState {
    const existing = this.buckets.get(key)
    if (existing !== undefined) return existing
    const created = createBucket(this.config, nowMs)
    this.buckets.set(key, created)
    return created
  }

  set(key: string, state: BucketState): void {
    this.buckets.set(key, state)
  }

  /** Reset `key`'s bucket back to a fresh, fully-topped-up state at `nowMs`. */
  reset(key: string, nowMs: number): void {
    this.buckets.set(key, { tokens: this.config.capacity - 1, lastRefillMs: nowMs })
  }

  has(key: string): boolean {
    return this.buckets.has(key)
  }
}
