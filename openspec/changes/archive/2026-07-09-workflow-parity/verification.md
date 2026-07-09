## 1. cospec emits all 11 parity workflows to every harness [critical]

- [x] 1.1 @unit (agent) bun test apps/cli/test/unit/harness -> render + dangling-refs + type-table green; 11 commands + 11 skills per surface -> `bun test apps/cli/test/unit/harness`: 33 pass, 0 fail, 6 snapshots, 499 expect() calls across 4 files
- [x] 1.2 @integration (agent) bun test apps/cli/test/integration/init.test.ts -> claudeInitPaths (11 cmds + 11 skills) all present after real init -> `bun test apps/cli/test/integration/init.test.ts`: 6 pass, 0 fail, 87 expect() calls

## 2. Bodies are cospec-adapted and self-consistent [critical]

- [x] 2.1 @unit (agent) dangling-refs test -> every slash/skill token in the 5 new bodies names an emitted workflow -> covered by the same `bun test apps/cli/test/unit/harness` run above (`dangling-refs.test.ts` included, 0 fail); it derives its known command/skill sets from `fixtures.ts`, which was extended to the 11 ids/skills
- [x] 2.2 @manual (agent) grep the 5 rendered bodies for a bare "openspec " call or "mv " -> none found -> `grep -n "openspec " apps/cli/src/canon/workflows/{new,ff,verify,bulk-archive,onboard}.md .claude/commands/cospec/{new,ff,verify,bulk-archive,onboard}.md` matches only prose ("openspec change", "never call `openspec` directly", `openspec/changes/...` paths) — no bare CLI invocation; `grep -nE '(^|[^a-zA-Z0-9_/.-])mv ' <same files>` -> 0 matches

## 3. Generation + drift + docs are coherent

- [x] 3.1 @runtime (agent) mise run generate && mise run generate:check -> zero drift -> `mise run generate` -> "cospec update: everything up to date"; `mise run generate:check` -> "cospec update --check: no drift"
- [x] 3.2 @regression (agent) mise run check -> green (lint, format, typecheck, unit, contract, integration, release, drift, agents:check, cospec-validate-all, schema:validate) -> `mise run check` exited 0: format:check clean (453 files), lint 0 errors (3 pre-existing unrelated warnings), typecheck 0, test 512 pass/0 fail, test:release 11 pass/0 fail, test:contract 29 pass/0 fail, test:integration 91 pass/0 fail, generate:check no drift, vendor:openspec:check up to date, agents:check all shared blocks in sync, cospec-validate-all 0 errors/0 warnings (1 change, 11/11 specs valid), openspec:schema:validate all 11 schemas valid
- [x] 3.3 @manual (agent) mise run docs:build -> passes; git grep "six workflow" -> no stale hits; mise run agents:check -> green -> `mise run docs:build` exited 0 (build complete); `git grep -in "six workflow"` matches only this ledger line itself (docs/harness-integration.md, docs/architecture.md, apps/docs/guide/harness-setup.md all now say "eleven"); `mise run agents:check` -> "All shared blocks are in sync."
