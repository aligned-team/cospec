## Why

The wrapped `@fission-ai/openspec` binary is pinned exactly to 1.3.1, but
1.4.0/1.4.1/1.5.0 have since shipped upstream with no change to any surface
cospec's wrapper reads (schema.yaml format, `CHANGE_NO_DELTAS`, the archive
silent-abort behavior, or the JSON shapes of `validate`/`instructions`/
`status`). We want the repo's own dev/CI tooling on the latest release while
letting the runtime wrapper accept a semver range instead of a single exact
version, so cospec doesn't need a code change for every future patch/minor that
touches none of its contract surface.

## What Changes

- Bump `@fission-ai/openspec` to exact `1.5.0` in `apps/cli/package.json`,
  `mise.toml`, `bun.lock`, and `mise.lock` (linux-x64, linux-arm64, macos-arm64)
  — this repo's own dev/CI pin.
- Replace the exact-match `EXPECTED_OPENSPEC_VERSION` runtime assertion in
  `apps/cli/src/core/openspec.ts` with a semver-range check (`>=1.3.1 <2.0.0`),
  with a clear error message naming the accepted range on mismatch.
- Update the version-tripwire contract test to assert the range/pin relationship
  instead of triple exact-equality, and re-probe the full contract suite
  (`archive-parity`, `archive-gotchas`, `scenario-preservation`, `hard-reality`)
  against the real 1.5.0 binary — fixing any test whose literal now describes
  stale behavior, never weakening an assertion to make it pass.
- Fix the `isOpsxMarkdown()` `generatedBy` prefix check in
  `apps/cli/src/commands/init.ts` (currently hardcoded to `.startsWith('1.3.')`)
  so it still recognizes openspec-authored skill files stamped
  `generatedBy: '1.5.0'`, and bump the matching fixtures/unit-test literals.
- Update docs and prose that name `1.3.1` (`docs/architecture.md`, `docs/*.md`,
  `README.md`, `apps/cli/README.md`, `.agents/shared.md`) to describe the new
  pin and the accepted range, then run `mise run agents:sync` so
  `CLAUDE.md`/`AGENTS.md` regenerate from the shared block.

## Impact

- `apps/cli/package.json`, `bun.lock` — dependency manifest/lockfile.
- `mise.toml`, `mise.lock` — dev/CI tool pin (used only by the
  `openspec:schema:validate` mise task).
- `apps/cli/src/core/openspec.ts` — version assertion becomes a range check.
- `apps/cli/src/commands/init.ts` — `generatedBy` prefix recognition.
- `apps/cli/test/contract/**`, `apps/cli/test/unit/init/**`,
  `apps/cli/test/fixtures/**` — re-probed/updated against real 1.5.0 behavior.
- `docs/architecture.md`, `docs/*.md`, `README.md`, `apps/cli/README.md`,
  `.agents/shared.md` (feeding generated `CLAUDE.md`/`AGENTS.md` via
  `mise run agents:sync`) — version prose.
- No application source or spec deltas; install/build steps unaffected beyond
  the new pin.

## Surfaces

<!-- Check every surface this change touches; each drives a verification/design expectation (soft). -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
