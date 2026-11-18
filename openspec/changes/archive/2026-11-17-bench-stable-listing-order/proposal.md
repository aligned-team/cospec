# Proposal

## Why

The bench harness reads two directory listings in whatever order Bun returns
them, which is the filesystem's own order rather than by name. `resolveChange`
falls back to the last date-prefixed archive dir, so on a filesystem that lists
`2026-02-02-…` before `2026-01-01-…` it scores the older change.
`collectArtifactText` concatenates the spec deltas into the judge's input in
listing order, so the judged text (and where truncation cuts it) varies by
filesystem. That order also breaks the documented promise that
`judgeInputFromArtifactFiles`, the snapshot path `--judge-report` re-judges
from, produces exactly the live text. The bench unit tests never ran in CI until
`scope-checks-to-changes` added them, and there the `resolveChange` row failed
on the Linux runner.

## What Changes

- `packages/bench/src/mechanical.ts`: `archiveDirs` sorts the names, so the
  latest date prefix is last whatever the listing order.
- `packages/bench/src/judge.ts`: `collectArtifactText` collects every
  `specs/<rel>` path first and reads them sorted, as
  `judgeInputFromArtifactFiles` sorts the same paths.
- Regression tests in `packages/bench/test/unit/mechanical.test.ts` and
  `judge.test.ts`: archive dirs created out of date order, and spec dirs
  (including `a/` and `a-b/`, which full-path sorting orders differently from a
  per-directory sort) whose live text must equal the snapshot path's.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- The bench harness only (`@aligned-team/cospec-bench`, advisory, never gates
  CI). No CLI, schema or spec change.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
