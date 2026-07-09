## 1. "unknown store" hint names cospec commands [critical]

- [x] 1.1 @regression (agent) run a store-backed command with a bogus `--store <id>` and capture stderr -> ran `cospec status --change nonexistent --store bogus-id-xyz`; stderr is `cospec: unknown store 'bogus-id-xyz' — register it with 'cospec store register <path>' or check 'cospec store ls'. Registered stores: probe-store` — matches `cospec store register`/`cospec store ls`, no bare `openspec store` phrasing
- [x] 1.2 @unit (agent) run the existing `store-aware.test.ts` "unknown store id" test unmodified -> `bun test apps/cli/test/integration/store-aware.test.ts` -> 3 pass, 0 fail, 20 expect() calls

## 2. Docs stay in sync

- [x] 2.1 @manual (agent) grep `apps/docs/concepts/stores.md` for the unknown-store example block -> line 114 reads `cospec: unknown store 'bogus-id' — register it with 'cospec store register <path>' or check 'cospec store ls'. Registered stores: platform` — no stale `openspec store register`/`ls` reference remains
