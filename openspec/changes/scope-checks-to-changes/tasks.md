# Tasks

## 1. Test selection

- [x] 1.1 Add `test-scope.ts` (selection rules, boot and preload closures,
      registry, argv dispatch, spawn guard) and `run-changed.ts` with the
      `test:changed` task and root alias, and verify
      `mise run test:changed -- --base origin/main unit` picks the whole suite
      for a preload change and only the reached files otherwise
- [x] 1.2 Wire `assertSpawnSelectable` into the test preload's spawn wrapper and
      add the command-module imports to every contract and integration test file
      that spawns the CLI, and verify the unit, contract and integration suites
      pass whole with the guard refusing
- [x] 1.3 Add `support-test-scope.test.ts` and
      `support-test-scope-dispatch.test.ts`, and verify they pass

- [x] 1.4 Remove git's repository variables (`git rev-parse --local-env-vars`)
      in the test preload, so tests run from a hook keep their git in their own
      temporary repositories, and verify a probe run started with a hook's
      `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` sees none of them and
      `git init`s its own repository

## 2. Hooks and CI

- [x] 2.1 Rework `hk.pkl` (typecheck and selected tests on pre-commit and
      pre-push; drop the `slow` profile) and remove
      `scripts/hooks/pre-push-gate`, and verify `hk validate` passes and a
      commit runs the new steps
- [ ] 2.2 Rework `ci.yml` (unconditional `ci-bun`, PR-scoped contract and
      integration, full runs off pull requests, bench and release tests,
      `workflow_call` with `ref`) and add `release.yml`'s `check` job, and
      verify actionlint passes and this PR's CI runs the selection

## 3. Docs

- [x] 3.1 Update `.agents/shared.md` (then `mise run agents:sync`),
      `CONTRIBUTING.md` and `docs/release.md`, and verify `agents:check` and
      `format:check` pass. The archive commit follows this one.
