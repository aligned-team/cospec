import type { BucketConfig, BucketState } from './types.ts'

/** Create a fresh, fully-topped-up bucket at the given time. Throws for a non-positive capacity. */
export function createBucket(config: BucketConfig, nowMs: number): BucketState {
  if (config.capacity <= 0) throw new Error('capacity must be positive')
  return { tokens: config.capacity, lastRefillMs: nowMs }
}

/** Refill a bucket's tokens for elapsed time, capped at capacity. Pure — returns a new state. */
export function refill(config: BucketConfig, state: BucketState, nowMs: number): BucketState {
  const elapsedMs = nowMs - state.lastRefillMs
  if (elapsedMs <= 0) return state
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  const granted = elapsedSeconds * config.refillPerSecond
  const tokens = Math.min(config.capacity, state.tokens + granted)
  return { tokens, lastRefillMs: nowMs }
}

/** Whether the bucket is at full capacity (no room to refill further). */
export function isBucketFull(config: BucketConfig, state: BucketState): boolean {
  return state.tokens > config.capacity
}

/**
 * Attempt to consume `cost` tokens at `nowMs`, refilling first. Returns the
 * new state and whether the consumption succeeded (the refill itself always
 * "sticks", whether or not the consumption did). Throws for a negative cost.
 */
export function tryConsume(
  config: BucketConfig,
  state: BucketState,
  cost: number,
  nowMs: number,
): { state: BucketState; allowed: boolean } {
  if (cost < 0) throw new Error('cost must not be negative')
  const refilled = refill(config, state, nowMs)
  if (refilled.tokens < cost) return { state: refilled, allowed: false }
  return {
    state: { tokens: refilled.tokens - cost, lastRefillMs: refilled.lastRefillMs },
    allowed: true,
  }
}
