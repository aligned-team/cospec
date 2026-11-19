# Tasks

## 1. Parallel local runs

- [x] 1.1 Pass `--parallel` to the three apps/cli suite tasks and
      `run-changed.ts`, and verify each suite passes under it: unit 3229 (32 s),
      integration 404 (66 s), contract 3235 (515 s), 0 fail
- [x] 1.2 Run the suites one after another in `mise run check` (`check:tests`),
      keep the bench task serial, and verify `mise run check` passes: 592 s,
      unit 3224 (33 s), contract 3235 (477 s), integration 406 (65 s), bench 345
      (10 s), release 14, 0 fail

## 2. Sharded contract runs in CI

- [x] 2.1 Split `profiles.test.ts` into `profiles-init`,
      `profiles-update-doctor` and `profiles-matrix-1` to `-4` over
      `support/profiles.ts` and `support/profile-matrix.ts`, move its
      `FS_READERS` entry, and verify the six files pass the same 110 tests and
      `support-test-scope.test.ts` passes
- [x] 2.2 Give `run-changed.ts` `--no-parallel` and `--` forwarding, with unit
      rows for both
- [x] 2.3 In `ci.yml`, run test files one at a time, move the contract suite
      into the `ci-contract` shards with the `ci-contract-timings` lookup and
      `ci-contract-timings-save` recording, have `ci-gate` require
      `ci-contract`, and verify actionlint passes

## 3. Docs

- [x] 3.1 State the local and CI rules in `CONTRIBUTING.md`, `.agents/shared.md`
      (then `mise run agents:sync`), and the comments in `apps/cli/mise.toml`
      and `hk.pkl`, and verify `agents:check` and `hk validate` pass
