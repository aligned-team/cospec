# Proposal

## Why

When the parent shell exports `FORCE_COLOR` — as Claude Code, many CI runners,
and plenty of interactive shells do — every wrapped OpenSpec call cospec makes
emits a Node runtime warning on the child's stderr:
`Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.`,
followed by a `warnOnDeactivatedColors` stack trace. `WRAPPED_ENV` in
`apps/cli/src/core/openspec.ts` sets `NO_COLOR: '1'` but spreads
`...process.env` first, so `FORCE_COLOR` leaks into the child and Node overrides
the very `NO_COLOR` cospec asked for.

The damage is real, not cosmetic. cospec parses wrapped stdout/stderr against a
deny-list and derives post-conditions from it, so a shell-dependent banner is
noise inside the surface cospec is supposed to control — and colour codes can
reappear in output cospec assumes is plain. The same leak reaches the test
harness: `apps/cli/test/fixtures/support.ts` spawns with the identical
`{ ...process.env, NO_COLOR: '1' }` shape, which is why
`apps/cli/test/contract/config-surface.test.ts` and
`apps/cli/test/integration/config.test.ts` fail on a developer machine with
`FORCE_COLOR` exported and pass in a clean shell.

## What Changes

- `WRAPPED_ENV` becomes a real env _builder_ rather than an overlay: the child
  env is derived from `process.env` with the colour-forcing variables
  (`FORCE_COLOR`, `COLORTERM`, `CLICOLOR`, `CLICOLOR_FORCE`) **deleted**, then
  the existing `NO_COLOR`/`BUN_BE_BUN`/`OPENSPEC_TELEMETRY`/
  `OPENSPEC_NO_COMPLETIONS` keys applied. Every wrapped call is then
  colour-neutral regardless of the parent shell.
- The test harness spawn in `apps/cli/test/fixtures/support.ts` uses the same
  deletion, so contract and integration suites are insensitive to the
  developer's exported colour variables.
- A unit test pins the builder's behaviour: given a `process.env` carrying
  `FORCE_COLOR`, the produced env must not contain it.

Only `FORCE_COLOR` triggers the Node warning today; the sibling variables are
deleted too because `chalk`/`picocolors`/`yoctocolors` honour them to force
colour on independently of Node's own check.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none — the specs are correct; the wrapped spawn implementation was not -->

## Impact

- `apps/cli/src/core/openspec.ts` — `WRAPPED_ENV` and `spawnRaw`
- `apps/cli/test/fixtures/support.ts` — harness `spawn`
- `apps/cli/test/unit/` — new coverage for the env builder
- No schema, CLI flag, or exit-code change; no docs-site fact changes owner

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
