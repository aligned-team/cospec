## 1. Per-project mise.toml files

- [x] 1.1 `apps/cli/mise.toml`: keep existing `build`/`dev`, add `test`,
      `test:contract`, `test:integration`, `test:pack`, `test:pack:standalone`
      with paths relative to `apps/cli` (`test/unit`, `test/contract`,
      `test/integration`, `test/integration/pack.test.ts`,
      `test/integration/pack-standalone.test.ts`).
- [x] 1.2 New `apps/docs/mise.toml`: `dev` (`bun run docs:dev`), `build`
      (`bun run docs:build`) — using the local `package.json` scripts directly
      (task cwd is the config root; no `--filter` needed).
- [x] 1.3 New `packages/bench/mise.toml`: `bench`, `smoke`, `test`
      (`bun test ./test` — leading `./` is load-bearing, see 3.1).
- [x] 1.4 Add `"e2e"` to `[monorepo] config_roots`; new `e2e/mise.toml`: `eval`
      (was `eval:e2e`), `release-test` (was `test:release`,
      `bun test     ./release`).

## 2. Root mise.toml

- [x] 2.1 Root keeps only repo-wide tasks: `cospec`, `lint`, `format:*`,
      `typecheck`, `generate(:check)`, `vendor:*`, `openspec:schema:validate`,
      `cospec-validate-all`, `agents:*`, `commit:check-title`,
      `release:set-version`, `check`.
- [x] 2.2 Add thin delegating aliases for every previously-root-level, now-moved
      task name (`build`, `test`, `test:contract`, `test:integration`,
      `test:pack`, `test:pack:standalone`, `test:release`, `docs:dev`,
      `docs:build`, `bench`, `bench:smoke`, `test:bench`, `eval:e2e`), each
      `run = "mise run //path:task"`, following the pre-existing
      `build -> //apps/cli:build` precedent — every existing `mise run <name>`
      invocation (CI workflows, hk.pkl, docs, muscle memory) keeps working
      unchanged. Decision recorded in proposal.md.
- [x] 2.3 Rewrite `check`'s `depends` to monorepo task addresses:
      `//apps/cli:test`, `//apps/cli:test:contract`,
      `//apps/cli:test:integration`, `//packages/bench:test`,
      `//e2e:release-test` (root-only tasks — `lint`, `format:check`,
      `typecheck`, `generate:check`, `vendor:openspec:check`, `agents:check`,
      `cospec-validate-all`, `openspec:schema:validate` — keep bare names).

## 3. Verification and gotchas

- [x] 3.1 `bun test <name>`'s positional argument is a substring filter over
      discovered test files, not a directory path — a bare `test` (or `release`)
      run with cwd inside the project also matches
      `scenarios/fixtures/**/*.test.ts` (path contains "test"). Found via
      `packages/bench:test` initially returning 108 tests/13 files instead of
      the expected 88/6; fixed by anchoring to `./test` (and `./release` in
      e2e/mise.toml) — re-verified exact pass/file-count parity with the
      pre-move invocation.
- [x] 3.2 `[task_config] includes = []` stays root-only — it suppresses
      `scripts/mise-tasks/**` auto-discovery, a root-only directory; no
      per-project mise.toml declares any script-backed task, so none need the
      same suppression (confirmed no duplicate-task warnings in
      `mise tasks --all`).
- [x] 3.3 Confirmed empirically that `[env]` (`HK_MISE`, `HK_PKL_BACKEND`,
      `.env.local` redaction) reaches subproject tasks: a temporary
      `apps/cli:envcheck` task printed both vars set and cwd as `apps/cli`, then
      was removed.
- [x] 3.4 Investigated e2e as a config root despite having no `package.json`
      (not a bun/npm workspace): `config_roots` only requires a `mise.toml` at
      the path, not a workspace member — `mise tasks --all` lists
      `//e2e:eval`/`//e2e:release-test` correctly, both run with the right cwd.
      Documented the finding as a comment in root `mise.toml`.

## 4. Reference updates

- [x] 4.1 Scanned `.github/workflows/*`, `hk.pkl`, `docs/*.md`,
      `CONTRIBUTING.md`, `.agents/shared.md`, `apps/docs/**` for `mise run`
      invocations — every one already matches a preserved root alias name
      (`test`, `test:contract`, `test:integration`, `test:pack`,
      `test:pack:standalone`, `docs:build`, `build`), so none require edits;
      confirmed no doc/workflow/hook references any bare task name that moved
      without a surviving alias.
- [ ] 4.2 `mise run agents:sync` — re-run if `.agents/shared.md`'s task table is
      later edited to describe the new per-project layout (not required for this
      change: every cited command string is unchanged).

## 5. Verification

- [x] 5.1 `mise tasks --all` lists the new layout: root aliases (`//:test`,
      `//:build`, …), project-native addresses (`//apps/cli:test`,
      `//apps/docs:build`, `//packages/bench:bench`, `//e2e:eval`, …), and bare
      names resolve correctly from inside each project directory.
- [x] 5.2 Spot-ran every moved task both via `//path:task` from root and via
      bare name from inside the project dir, and diffed pass/file counts against
      the pre-move invocation: `//apps/cli:test` 543 pass/40 files (matches),
      `//apps/cli:test:contract` 29 pass/7 files (matches),
      `//apps/cli:test:integration` 92 pass/20 files, bare and `./`-prefixed
      forms identical (matches), `//packages/bench:test` 88 pass/6 files after
      the `./test` fix (matches; was 108/13 before the fix — see 3.1),
      `//e2e:release-test` 14 pass/1 file (matches), `//apps/docs:build` —
      VitePress build completes, sitemap + llms.txt generated (matches),
      `//packages/bench:bench` (root alias with real trailing args) forwards
      args identically to the pre-move direct invocation (both start the
      real-agent bench run and print the same report path banner — a full run
      needs live Claude Code + API credentials, out of scope to execute to
      completion here), `//e2e:eval` — same pre-existing DeepSeek 402
      (insufficient credits) as the pre-move `bun run e2e/eval/run.ts`,
      confirming the failure is environment/billing, not the move.
- [x] 5.3 `mise run check` green from repo root: lint, format:check, typecheck,
      `//apps/cli:test` (543 pass/40 files), `//apps/cli:test:contract` (29
      pass/7 files), `//apps/cli:test:integration` (92 pass/20 files),
      `//packages/bench:test` (88 pass/6 files), `//e2e:release-test` (14 pass/1
      file), generate:check, vendor:openspec:check, agents:check,
      cospec-validate-all, openspec:schema:validate all green — 0 errors. (First
      full run caught 2 markdown-format violations in this change's own
      `proposal.md`/`tasks.md` — fixed with `oxfmt`, re-ran clean.)
- [x] 5.4 hk hooks still work: `hk validate` on `hk.pkl` parses clean (no edits
      made, per 4.1); `hk run pre-commit -c -a` (check mode, all files) — oxfmt,
      oxlint, taplo (picked up all 5 new/changed `mise.toml` files), shellcheck,
      actionlint, agents:check, cospec-validate, and cospec-sync-blockers all
      pass.
