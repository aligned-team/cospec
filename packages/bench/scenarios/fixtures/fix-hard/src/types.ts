export interface BucketConfig {
  capacity: number
  refillPerSecond: number
}

export interface BucketState {
  tokens: number
  lastRefillMs: number
}
