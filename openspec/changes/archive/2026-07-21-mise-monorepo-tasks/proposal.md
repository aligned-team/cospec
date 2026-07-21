## Why

Nearly all mise tasks live in the root `mise.toml` even though the repo already
sets `experimental_monorepo_root = true` and
`[monorepo] config_roots = ["apps/*", "packages/*"]`. This is the antipattern
mise's monorepo docs warn against: project-scoped tasks (build, test, bench,
docs) belong in the config root that owns them, addressed via `//path:task`,
with root keeping only genuinely repo-wide tasks.

## What Changes

- Move `apps/cli`-scoped tasks (`test`, `test:contract`, `test:integration`,
  `test:pack`, `test:pack:standalone`) into `apps/cli/mise.toml`, reconciled
  with the `build`/`dev` tasks already there (paths become relative to
  `apps/cli`).
- Move `apps/docs`-scoped tasks (`docs:dev` → `dev`, `docs:build` → `build`)
  into a new `apps/docs/mise.toml`.
- Move `packages/bench`-scoped tasks (`bench`, `bench:smoke` → `smoke`,
  `test:bench` → `test`) into a new `packages/bench/mise.toml`.
- Add `e2e` to `[monorepo] config_roots` and move `eval:e2e` → `eval` and
  `test:release` → `release-test` into a new `e2e/mise.toml`.
- Keep root `mise.toml` to genuinely repo-wide tasks (`cospec`, `lint`,
  `format:*`, `typecheck`, `generate(:check)`, `vendor:*`,
  `openspec:schema:validate`, `cospec-validate-all`, `agents:*`,
  `commit:check-title`, `release:set-version`, `check`), with `check`'s
  `depends` rewritten to monorepo task addresses (e.g. `//apps/cli:test`).
- Keep thin root delegating aliases (`build`, `test`, `test:contract`,
  `test:integration`, `test:pack`, `test:pack:standalone`, `bench`,
  `bench:smoke`, `docs:dev`, `docs:build`, `eval:e2e`, `test:release`) so every
  existing invocation (CI workflows, hk hooks, docs, muscle memory) keeps
  working unchanged, following the existing `build -> //apps/cli:build`
  precedent.
- Update every reference to the old task names/paths across
  `.github/workflows/*`, `hk.pkl`, `docs/*.md`, `CONTRIBUTING.md`,
  `.agents/shared.md` (then `mise run agents:sync`), and `apps/docs/*` where
  they cite `mise run` commands.

## Impact

- `mise.toml` (root), `apps/cli/mise.toml`, new `apps/docs/mise.toml`, new
  `packages/bench/mise.toml`, new `e2e/mise.toml`.
- `.github/workflows/ci.yml` and any other workflow invoking
  `mise run test*`/`bench*`/`docs:*`/`eval:e2e` (kept working via root aliases;
  no workflow edits required unless they reference removed bare names).
- `hk.pkl` hook task references.
- `docs/*.md`, `CONTRIBUTING.md`, `.agents/shared.md` (+ synced
  `CLAUDE.md`/`AGENTS.md`) task tables.

## Surfaces

- [ ] interactive
- [ ] deploy
- [ ] integration
- [ ] agent-behavior
