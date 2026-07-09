## 1. cospec emits all 11 parity workflows to every harness [critical]

- [ ] 1.1 @unit (agent) bun test apps/cli/test/unit/harness -> render + dangling-refs + type-table green; 11 commands + 11 skills per surface
- [ ] 1.2 @integration (agent) bun test apps/cli/test/integration/init.test.ts -> claudeInitPaths (11 cmds + 11 skills) all present after real init

## 2. Bodies are cospec-adapted and self-consistent [critical]

- [ ] 2.1 @unit (agent) dangling-refs test -> every slash/skill token in the 5 new bodies names an emitted workflow
- [ ] 2.2 @manual (agent) grep the 5 rendered bodies for a bare "openspec " call or "mv " -> none found

## 3. Generation + drift + docs are coherent

- [ ] 3.1 @runtime (agent) mise run generate && mise run generate:check -> zero drift
- [ ] 3.2 @regression (agent) mise run check -> green (lint, format, typecheck, unit, contract, integration, release, drift, agents:check, cospec-validate-all, schema:validate)
- [x] 3.3 @manual (agent) mise run docs:build -> passes; git grep "six workflow" -> no stale hits; mise run agents:check -> green -> `mise run docs:build` exited 0 (build complete); `git grep -in "six workflow"` matches only this ledger line itself (docs/harness-integration.md, docs/architecture.md, apps/docs/guide/harness-setup.md all now say "eleven"); `mise run agents:check` -> "All shared blocks are in sync."
