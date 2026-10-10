# Proposal

## Why

PR #81 (`fix(cli): keep every test off the real home directory`) made
`scripts/generate-self` override only `XDG_CONFIG_HOME` and documented
`generate` and `generate:check` as host-independent. Its re-review found a MAJOR
that merged unfixed: `update` also reads and writes home-scoped skills roots
(`minimax-code`'s `~/.minimax/skills`) resolved from `HOME`/`USERPROFILE`. On a
developer machine whose real home holds cospec-authored skills from an earlier
`cospec init --tools minimax-code` elsewhere, `mise run generate:check` (and the
pre-commit hook and CI task that call it) exits 1 with "12 files would change
under $HOME/.minimax/skills", and `mise run generate` rewrites those files in
the real home. The script's own comment and #81's design.md both say the
opposite.

## What Changes

- `scripts/generate-self` points `HOME`, `USERPROFILE`, `CODEX_HOME`,
  `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` and `XDG_CACHE_HOME` at
  the one empty temporary directory it already creates, so a home-scoped row
  sees no evidence there and nothing is written outside the repo. Its header
  comment names the home as well as the config.
- A regression test, `apps/cli/test/integration/generate-self-home.test.ts`,
  runs `scripts/generate-self update --check` against a scratch HOME that holds
  stale cospec-authored `.minimax` skills and a `delivery: commands` global
  config (the key that changes what `update` renders; `profile` does not): it
  reports no drift and the scratch HOME is byte-identical afterwards. A second
  test runs the script around a stand-in `bun` and requires all seven variables
  to name the one empty scratch directory, covering those no behaviour exposes.
- `docs/self-hosting.md`, `docs/architecture.md` and `.agents/shared.md` (then
  `agents:sync`) say `generate` is isolated from the home directory as well as
  the machine-global config, which makes #81's host-independence statement true.
  #81's archived artifacts are not edited; this change's design.md records the
  correction.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

`scripts/generate-self`, `apps/cli/test/integration/generate-self-home.test.ts`,
the `mise.toml` comment above `generate`, `docs/self-hosting.md`,
`docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`/`AGENTS.md` (synced).
No `apps/cli/src` or `apps/docs` change: a user's `update` keeps reading their
own home; only this repo's self-hosting task is isolated.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
