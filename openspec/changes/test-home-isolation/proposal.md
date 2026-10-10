# Proposal

## Why

On a host whose `~/.config/openspec/config.json` sets `profile: core`,
`test/integration/init.test.ts` (states A and B) and
`test/unit/init/write-failure.test.ts` ("per-file failure") fail, and
`mise run generate` reports "6 of 12 (profile core, set by the global config)".
The tests read the real home's global config instead of a sandbox: the isolation
that points `XDG_CONFIG_HOME` at an empty directory lives in a preload that only
the three `apps/cli` mise tasks pass as `--preload`, so a bare `bun test <file>`
and CI's `bun test apps/cli/test/unit --coverage` (ci.yml) run without it, and
Bun's `os.homedir()` ignores a later `HOME` assignment, so no environment-only
sandbox could cover the in-process readers.

The same dependency reaches this repo's own managed files. `cospec update`
honours the machine-global `profile`, so on a profile-core host `generate:check`
reports no drift when a non-core workflow's files are missing (the full twelve
are committed, per CLAUDE.md) and instead reports spurious `updated` rows on
bodies that depend on which workflows are installed. A clean host reports the
opposite for the same tree.

## What Changes

- `bunfig.toml` (root and `apps/cli`) preloads
  `test/fixtures/isolate-machine-state.ts` for every `bun test` run, so
  isolation no longer depends on a flag; the three `--preload` flags leave
  `apps/cli/mise.toml`. The preload points HOME, USERPROFILE, XDG
  config/data/state and CODEX_HOME at a private sandbox, replaces `os.homedir()`
  (module mock plus the patched export), keeps the completion-tip opt-out, and
  registers a `beforeEach` guard.
- A guard test, `test/unit/support-machine-isolation.test.ts`, fails when the
  global-config path the environment resolves to, `os.homedir()`, or the path
  `openspec config path` prints for an in-process read lies under the real home,
  and exercises the guard's own refusals.
- `generate` and `generate:check` run through `scripts/generate-self`, which
  points `XDG_CONFIG_HOME` at an empty directory, so the repo's managed files
  are the committed twelve whatever the host's profile. No product code changes:
  a user's `update` keeps honouring their global profile.
- `docs/self-hosting.md`, `docs/architecture.md` and `.agents/shared.md` (then
  `agents:sync`) state both rules.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

`bunfig.toml`, `apps/cli/bunfig.toml`, `apps/cli/mise.toml`, `mise.toml`,
`scripts/generate-self`, `apps/cli/test/fixtures/` (the preload replaces
`no-completion-tip.ts`; a `machine-isolation.ts` helper),
`apps/cli/test/unit/support-machine-isolation.test.ts`, `docs/self-hosting.md`,
`docs/architecture.md`, `.agents/shared.md`, `CLAUDE.md`/`AGENTS.md` (synced).
No `apps/cli/src` or `apps/docs` change: no user-facing behaviour moves.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
