## 1. Guard first

- [x] 1.1 Add `test/fixtures/machine-isolation.ts` and
      `test/unit/support-machine-isolation.test.ts` (environment,
      `os.homedir()`, `openspec config path` read, the guard's refusals) --
      verify the test fails with the bunfig disabled
- [x] 1.2 Run the repro (item 1.1 of the ledger) before the preload exists and
      record the failures

## 2. Isolation

- [x] 2.1 Replace `no-completion-tip.ts` with `isolate-machine-state.ts` (HOME,
      USERPROFILE, XDG, CODEX_HOME, `os.homedir()`, tip opt-out, `beforeEach`
      guard); preload it from `bunfig.toml` and `apps/cli/bunfig.toml`; drop the
      three `--preload` flags -- verify the repro passes
- [x] 2.2 Fix any suite the sandboxed HOME breaks -- verify unit, integration
      and contract suites under both HOMEs

## 3. generate

- [x] 3.1 Add `scripts/generate-self` and run `generate` and `generate:check`
      through it -- verify the ledger's 2.1 experiment

## 4. Docs

- [x] 4.1 Update `docs/self-hosting.md`, `docs/architecture.md` and
      `.agents/shared.md`, then `mise run agents:sync` -- verify
      `mise run agents:check`

## 5. Review fixes

- [x] 5.1 Wrap `Bun.spawn`/`Bun.spawnSync` in the preload so an omitted `env` is
      the sandboxed `process.env` -- verify a bare child prints the sandbox HOME
      and the integration suite leaves a scratch HOME untouched
- [x] 5.2 Add `packages/bench/bunfig.toml` and `e2e/bunfig.toml`, correct the
      docs wording, and make the guard test run a bare `bun test` from each root
      -- verify it fails without a bunfig
- [x] 5.3 Remove the sandbox in an `afterAll` -- verify the temporary directory
      is empty after a run

## 6. Gate

- [x] 6.1 `mise run check` green under a clean HOME and a profile-core HOME --
      verify by exit codes
- [x] 6.2 `cospec validate test-home-isolation --strict` clean and every
      verification row `[x]` with an observed result -- the archive commit
      follows this one
