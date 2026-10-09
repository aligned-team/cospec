# Verification

## 1. The plan line names every required artifact [critical]

- [x] 1.1 @regression (agent) run the issue's repro script against the built CLI from this worktree in a sandboxed HOME -> repro run in a sandboxed HOME against this worktree's CLI: feat/fix/perf/refactor plan lines now end `verification → tasks` (before: no `verification`); applyRequires unchanged
- [x] 1.2 @unit (agent) new test asserting each of the 11 types' `apply_requires` ids appear in its `summary` -> `every type summary names every artifact its apply_requires names` failed on the four stale types before the fix, 0 fail after (2309 unit pass)
- [x] 1.3 @unit (agent) golden files and render snapshot for the propose and new skills' type tables -> render snapshot and 128 harness-render golden files regenerated; propose/new type tables list `verification` for feat, fix, perf, refactor; contract harness-matrix 42 pass

## 2. Nothing else moves

- [x] 2.1 @integration (agent) `cospec new chore|docs|style|test <slug>` -> `new-plan.test.ts` asserts chore/docs/style/test line is exactly `Artifacts: proposal → blocking-changes → tasks (3 short artifacts)`; repro output identical to before
- [x] 2.2 @integration (agent) `cospec new <type> <slug> --json` -> `--json summary names every required artifact` passes for all 8 exercised types (integration 254+ pass)
- [x] 2.3 @integration (agent) `mise run generate:check` and `mise run docs:build` -> `mise run generate:check` -> no drift; `mise run docs:build` -> build complete
