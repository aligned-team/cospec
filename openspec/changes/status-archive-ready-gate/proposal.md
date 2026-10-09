# Proposal

## Why

`cospec status` (the `archiveReady` JSON key and the `archive-ready: yes` text
line) and `cospec list` (the `archive-ready` marker and its `archiveReady` JSON
field) report a change as archive-ready while its `verification.md` still has
unresolved or malformed rows. In the same `status --json` document, those rows
are listed in `verification.blockedReasons`, and `cospec archive` then refuses
with `archive/verification-incomplete`. Automation that trusts `archiveReady` is
told to archive a change that cannot be archived, and when the rows are resolved
the flag does not move, so it carries no information about the verification gate
in either direction (GitHub issue #67).

The cause is that `archiveReady` is computed from required-artifact existence,
tasks and the blocker gate only; `verification.md` counts as done the moment the
file exists. `status` computes the verification verdict after the flag and never
feeds it back, and `list` has no verification input at all. `list` also filters
nothing by the change's `schemaVersion`, while `status` and the gates do, so a
grandfathered v1 change can read differently across the two commands.

## What Changes

- `archiveReady` is false whenever `verification.blockedReasons` is non-empty,
  in `cospec status` (JSON and the `archive-ready:` text line, for one change
  and under `--all`) and in `cospec list` (the `archive-ready` marker and the
  `archiveReady` JSON field).
- One helper, used by both commands, derives the flag from the required
  artifacts the change's `schemaVersion` enforces, its tasks, its blocker gate
  and the shared verification verdict, so the two cannot drift again. `list` now
  reads `verification.md` and filters `apply.requires` by `schemaVersion`
  exactly as `status`, `apply` and `archive` do.
- The `Next:` line is unchanged: it follows the documented algorithm
  (`cospec apply <id>` once every required artifact exists).
- The docs name what `archiveReady` covers: required artifacts, tasks, the
  blocker gate and the verification gate.
- BREAKING (value only, no shape change): a change whose verification rows are
  unresolved or malformed now reports `archiveReady: false` where it reported
  `true`. No JSON key is added, removed or renamed and no text line changes
  shape.

## Capabilities

### New Capabilities

### Modified Capabilities

- `verification-artifact`: the "Read-only verification verdict in status"
  requirement now states that `archiveReady` in `status` and `list` agrees with
  the verdict.

## Impact

- `apps/cli/src/commands/status.ts`, `apps/cli/src/commands/list.ts` and a
  shared readiness helper next to the gate in `apps/cli/src/commands/apply.ts`.
- `apps/cli/src/core/verification.ts`: a reader that loads `verification.md` and
  computes the verdict, used by `status` and `list`.
- Tests: `status`/`list` unit and integration cases, plus a property test that a
  change reported `archiveReady: true` is not refused by
  `archive/verification-incomplete`.
- `apps/docs/reference/commands.md` (the `status` and `list` rows own the
  archive-readiness fact).
- `openspec/specs/verification-artifact/spec.md` via the delta spec.
- Out of scope: `archive/scenario-preservation` and delta-spec validity are
  still not modelled by `archiveReady`; the docs now say what it does cover.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
