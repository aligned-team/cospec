## 1. The change lifecycle runs against a store, not the cwd [critical]

- [x] 1.1 @integration (agent) run the store-aware suite: new/validate/apply/archive --store against a real registered store -> 3 pass, 0 fail (apps/cli/test/integration/store-aware.test.ts)
- [x] 1.2 @integration (agent) assert the blocker gate returns exit 2 and archive fan-out ticks the consumer's blocker box, all in the store -> observed exit 2 then exit 0 after provider archived; consumer spec merged into store
- [x] 1.3 @regression (agent) run the full unit+integration+contract suites for no regressions -> 492 unit + 49 integration + 22 contract pass

## 2. Root resolution is deterministic and fails closed

- [x] 2.1 @integration (agent) an unregistered --store id exits non-zero naming known stores -> observed exit 1, "unknown store 'no-such-store'"
- [x] 2.2 @unit (agent) local resolution and config pointer precedence -> apps/cli/test/unit/core/root.test.ts passes
