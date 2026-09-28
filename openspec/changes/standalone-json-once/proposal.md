# Proposal

## Why

The standalone (compiled) cospec binary runs its wrapped OpenSpec calls through
an embedded single-file bundle, and that bundle runs the OpenSpec CLI twice per
invocation. Every `--json` call therefore prints two identical documents on
stdout, which breaks the one-document-per-`--json`-call contract: passthroughs
such as `cospec schemas --json` fail the one-document check instead of relaying
the result, and every side-effecting wrapped call runs its action twice.

The cause is in how the bundle is built. OpenSpec's `bin/openspec.js` calls
`runCli()`, and `dist/cli/index.js` also calls `runCli()` when it detects it is
the main module (`process.argv[1]` resolves to its own `import.meta.url`). In
the npm package those are two files, so only the bin call runs. Bundled into one
file, `import.meta.url` is the bundle itself, the check passes, and the CLI
parses its argv a second time.

## What Changes

- `mise run vendor:openspec` builds the bundle with a build-time transform that
  removes the main-module self-run block from OpenSpec's CLI module, so the
  bundle's only CLI run is the bin entry's own `runCli()`. The transform fails
  the build when that block is not found exactly once, so a changed upstream
  entry cannot silently reintroduce the double run or leave the bundle with no
  run at all.
- The committed bundle is regenerated.
- The standalone pack smoke asserts exactly one JSON document on stdout for a
  passthrough (`cospec schemas --json`) and for the embedded bundle's own
  `new change --json` call, run through the compiled binary with no
  `node_modules` anywhere.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `scripts/mise-tasks/vendor/openspec` and a new
  `scripts/mise-tasks/vendor/openspec-bundle.ts` build script.
- `apps/cli/src/vendor/openspec.bundle.js.tpl` (regenerated).
- `apps/cli/test/integration/pack-standalone.test.ts`.
- No change to the wrapper (`openspec.ts`, `openspec-embedded.ts`), to the
  one-document check, or to any command.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
