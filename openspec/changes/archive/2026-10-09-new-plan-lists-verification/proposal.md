# Proposal

## Why

`cospec new <type> <slug>` prints an `Artifacts:` plan line that omits
`verification` for `feat`, `fix`, `perf` and `refactor`, although those four
types require it and the apply gate refuses without it (issue #71). The same
string feeds the type table of the generated propose and new skills, so agents
plan a smaller artifact set than the gate demands.

The summaries in `apps/cli/src/canon/types/{feat,fix,perf,refactor}.yaml` were
written before `verification` became a required artifact and were never updated,
while `apply_requires` in the same files lists it. Nothing checks that a type's
summary names what its `apply_requires` names, so the two drifted.

## What Changes

- The `summary` and `schemaDescription` of `feat`, `fix`, `perf` and `refactor`
  list `verification` before `tasks` (for example
  `proposal → blocking-changes, specs (+ design) → verification → tasks`), so
  `cospec new`, `--json` `artifacts.summary`, the generated skills' type tables
  and the committed schemas all name it.
- A unit test fails when any of the eleven types' `apply_requires` names an
  artifact its `summary` does not.
- The types-and-artifacts docs page states that the plan line and the skills'
  type table name every required artifact.
- BREAKING: the printed `Artifacts:` line, `cospec new --json`
  `artifacts.summary`, and the managed `description:` line in each
  `openspec/schemas/<type>/schema.yaml` change text for the four types. No key
  or shape changes; `cospec update` rewrites the managed description on existing
  projects.

## Capabilities

### New Capabilities

### Modified Capabilities

## Impact

- `apps/cli/src/canon/types/{feat,fix,perf,refactor}.yaml` (data), regenerated
  `openspec/schemas/**` and harness dirs.
- Test pins: `schema-compose.test.ts`, `harness/fixtures.ts`, schema goldens,
  harness render snapshot and golden files.
- `apps/docs/concepts/types-and-artifacts.md`.
- `chore`, `docs`, `style`, `test`, `ci`, `build`, `revert` output is unchanged.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
