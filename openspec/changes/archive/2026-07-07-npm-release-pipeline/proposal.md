## Why

cospec ships today only from source; there is no versioned, reproducible way to
cut an npm release or distribute a standalone `cospec` binary. This change adds
a `workflow_dispatch` release pipeline that computes the next semver, bumps and
tags it, builds cross-platform binaries, and publishes both the npm package and
a GitHub release atomically.

## What Changes

- `.github/workflows/release.yml` — dispatch-triggered pipeline: version → bump
  → build (5 targets) → stage-npm → publish → cleanup.
- `cog.toml` — compute-only cocogitto config (no manifest rewrite), typed to
  cospec's 11 conventional-commit types.
- `communique.toml` — AI release-notes config describing cospec accurately.
- `scripts/mise-tasks/release/set-version` — stamps the release version into
  `apps/cli/package.json` only (root stays `private`/`0.0.0`) and refreshes
  `bun.lock` so `--frozen-lockfile` installs still pass post-bump.
- `mise.toml` — new `release:set-version` and `test:release` tasks; `check`
  gains `test:release`.
- `apps/cli/test/... /set-version.test.ts` (or repo-convention path) —
  idempotency + correctness tests for the script.
- `docs/release.md` — end-to-end flow, required secrets, trusted-publishing and
  `--provenance` migration steps.

## Impact

- New jobs: `version`, `bump`, `build` (matrix ×5), `stage-npm`, `publish`,
  `cleanup`. Only `bump`/`publish`/`cleanup` need `contents: write`.
- New required secrets: `RELEASE_DEPLOY_KEY` (exempt bypass actor on the `main`
  ruleset), `ANTHROPIC_API_KEY_COMMUNIQUE`, `NPM_TOKEN` (temporary, until
  trusted publishing).
- No change to existing `ci.yml`, application command behavior, or specs.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
