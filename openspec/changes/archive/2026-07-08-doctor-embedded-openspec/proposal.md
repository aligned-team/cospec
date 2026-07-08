## Why

`cospec doctor` never learned the embedded-openspec fallback that every wrapped
command gained: `checkOpenspecVersion` calls `openspecPackageDir()` directly
and, when no `@fission-ai/openspec` resolves from `node_modules`, emits an
`openspec-resolve` ERROR ("run `bun install`"). On a standalone (mise /
GitHub-release) install that is a false alarm — every wrapped command works via
the embedded bundle — so the health check reports a healthy install as broken
and exits 1. The README papers over the gap with a caveat sentence instead of
the check being correct.

## What Changes

- `cospec doctor` mirrors the wrapped-call resolution order: when the project
  `node_modules` lookup misses, it reports the embedded pinned copy as the
  resolution source (healthy, no ERROR). The embedded copy is by construction
  `PINNED_OPENSPEC_VERSION`, so it satisfies the accepted range without
  extracting anything to disk — the check stays read-only.
- When a project copy resolves, behavior is unchanged: its version is still
  asserted against the accepted range, with the existing `openspec-version`
  ERROR on mismatch.
- The README caveat sentence "(`cospec doctor` still resolves
  `@fission-ai/openspec` from `node_modules` and needs a project install.)" is
  deleted from the root and `apps/cli` READMEs.

## Capabilities

### Modified Capabilities

- `embedded-openspec`: the resolution-order requirement covered wrapped spawns
  but was silent on `cospec doctor`, leaving the health check free to contradict
  it — extend it so diagnostics report the embedded source instead of erroring.

## Impact

- `apps/cli/src/commands/doctor.ts` — `checkOpenspecVersion` gains the embedded
  fallback and reports the resolution source.
- `apps/cli/src/core/openspec.ts` — expose the resolution outcome (project dir
  vs embedded pin) so doctor and `openspecBin()` share one resolution path.
- `README.md`, `apps/cli/README.md` — caveat sentence removed.
- Tests: unit coverage for the doctor check's embedded fallback.

## Surfaces

- [x] interactive — `cospec doctor` output and exit code on standalone installs
      change from false ERROR to healthy report.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
