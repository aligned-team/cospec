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

## 5. Gate

- [ ] 5.1 `mise run check` green under a clean HOME and a profile-core HOME --
      verify by exit codes
- [ ] 5.2 `cospec validate test-home-isolation --strict` clean and every
      verification row `[x]` with an observed result -- the archive commit
      follows this one
