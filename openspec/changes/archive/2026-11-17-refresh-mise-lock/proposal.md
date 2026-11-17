# Proposal

## Why

CI's mise lockfile drift gate (`mise install` then
`git diff --exit-code mise.lock`) fails on every branch off `main`: the runner's
mise (v2026.11.9) now records a `linux-arm64-musl` platform entry for cocogitto
that the committed `mise.lock` lacks, so `mise install` rewrites the file before
any test runs.

## What Changes

- `mise.lock`: add the `aqua:cocogitto/cocogitto` `platforms.linux-arm64-musl`
  entry exactly as mise v2026.11.9 writes it — the same checksum and asset as
  `linux-arm64` (cocogitto ships one aarch64 Linux build), plus its
  `checksum_source` and `url_api`. No tool version changes.

## Impact

- CI: the `ci-bun` lockfile drift gate passes again, unblocking every PR off
  `main` (#101, #102).
- Local: a mise older than the v2026.11 releases drops the `checksum_source`
  line it does not know when it rewrites the lockfile (`mise install`); that
  local edit is not to be committed. Tool versions and checksums are unchanged.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
