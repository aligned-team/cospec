# rate-limiter-hard-sample

A small token-bucket rate limiter split across three files: `src/bucket.ts`
(core refill/consume math), `src/store.ts` (a keyed in-memory store of bucket
state), and `src/limiter.ts` (the public `RateLimiter` facade).
