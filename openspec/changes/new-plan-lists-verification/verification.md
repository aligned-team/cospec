# Verification

## 1. The plan line names every required artifact [critical]

- [ ] 1.1 @regression (agent) run the issue's repro script against the built CLI from this worktree in a sandboxed HOME -> `cospec new feat|fix|perf|refactor` plan lines mention `verification` before `tasks` (failed before the fix)
- [ ] 1.2 @unit (agent) new test asserting each of the 11 types' `apply_requires` ids appear in its `summary` -> fails on the four stale types before the fix, passes after
- [ ] 1.3 @unit (agent) golden files and render snapshot for the propose and new skills' type tables -> list `verification` for feat, fix, perf and refactor

## 2. Nothing else moves

- [ ] 2.1 @integration (agent) `cospec new chore|docs|style|test <slug>` -> plan line unchanged
- [ ] 2.2 @integration (agent) `cospec new <type> <slug> --json` -> `artifacts.summary` and `artifacts.required` agree for every type
- [ ] 2.3 @integration (agent) `mise run generate:check` and `mise run docs:build` -> both clean after the docs sentence lands
