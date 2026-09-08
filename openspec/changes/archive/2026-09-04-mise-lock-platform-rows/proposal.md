## Why

A reported `mise install` rewrite of `mise.lock` (~230 lines) could not be
reproduced: `mise.toml` and `mise.lock` were last updated in the same commit
(`470b165`), all 13 pinned tools match between them, and a bare `mise install`
is a verified byte-for-byte no-op on this checkout. Rather than commit a
regenerated lockfile with no diff to justify it, add a cheap CI guard so any
future toml/lock drift surfaces automatically instead of being rediscovered by
hand.

## What Changes

- Add a lockfile drift step to the existing `ci-openspec`-style gate job in
  `.github/workflows/ci.yml` (after `setup-mise`): run `mise install`, then
  `git diff --exit-code mise.lock`, failing the job when `mise install` rewrites
  the lockfile.
- No lockfile regeneration is performed as part of this change — `mise.lock` is
  already in sync and is left untouched.

## Impact

- `.github/workflows/ci.yml` only. No application source, specs, or lockfile
  content changes.
- Adds one required-check failure mode: a PR that bumps a tool version in
  `mise.toml` without committing the regenerated `mise.lock` now fails CI.
- No new secrets, no runner or runtime topology change — the step runs in the
  existing `ubuntu-latest` job that already invokes `setup-mise`.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
