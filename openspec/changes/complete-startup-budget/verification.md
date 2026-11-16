# Verification

## 1. The timing script

- [x] 1.1 @unit (agent) `bun test test/unit/complete-timing.test.ts` in `packages/bench` -> median, p95, budget verdict and report rendering match; observed: 7 pass, 0 fail

## 2. `__complete` stays lazy and telemetry-free [critical]

- [x] 2.1 @unit (agent) `bun test test/unit/commands/complete-lazy.test.ts` in `apps/cli`, asserting the static module set of the entry point and of `commands/complete.ts` -> no other command, harness renderer, rule module (but type facts) or telemetry module, no package beyond `yaml` and main's glob stack (`tinyglobby`, `picomatch`, `brace-expansion`); the lazy `__complete` registration and the boot path's command-freedom are guarded by main's support-test-scope tests, not repeated here; observed: 3 pass, 0 fail, and `support-test-scope.test.ts` passes with the file registered in `FS_READERS`
- [x] 2.2 @equivalence (agent) `cospec __complete changes` from the source entry after this change -> still lists this repo's active change with its task summary; observed: printed `complete-startup-budget	complete, 5/5 tasks`, and `git diff origin/main -- apps/cli/src` is empty, so no source file `__complete` reads is touched

## 3. Docs and shared guidance

- [x] 3.1 @manual (agent) `docs/bench.md` and `.agents/shared.md` -> `bench:complete`, the budget and the three environment variables are documented on the page that owns them, and `agents:check` agrees; observed: `docs/bench.md` gains the "Completion startup timing" section, `.agents/shared.md` gains a `bench:complete` row, `mise run agents:sync` ran, and `mise run check` is green
