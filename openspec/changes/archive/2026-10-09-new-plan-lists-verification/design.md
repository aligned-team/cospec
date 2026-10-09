# Design

## Context

`new.ts` prints `info.summary`, which `schema-compose.ts` reads from the
`summary:` field of each canon type file; `schemaDescription` repeats the same
flow and becomes the managed `description:` of each schema. Both are
hand-written prose next to `apply_requires`, and four types list `verification`
there but not in the prose. The type table in the generated propose/new skills
reads the same `summary`.

## Goals / Non-Goals

**Goals:**

- Every type's plan line names every artifact in its `apply_requires`.
- A test makes the drift impossible to reintroduce.

**Non-Goals:**

- Changing which artifacts any type requires, or the apply gate.
- Reflowing the light types' summaries.

## Decisions

- Option A (data), as the issue recommends: edit the four `summary` and
  `schemaDescription` strings to put `verification` before `tasks`, matching the
  gate's order (`feat`:
  `proposal → blocking-changes, specs (+ design) → verification → tasks`). One
  string feeds `new`, `--json`, the skills and the schemas, so they stay
  mutually consistent with no new code path.
- Option B (append a computed `Required before apply:` line in `new.ts`) is
  rejected: it would leave the skills' type table and the schema description
  stale, and make the plan line say the same fact twice for the seven types
  whose summary is already complete.
- The guard is a unit test over `TYPE_TABLE` and each type's `apply_requires`
  (read via the canon loader), asserting every id appears in `summary`. It also
  asserts `getTypeInfo(type).requiredArtifacts` matches `apply_requires`,
  covering the `--json` `artifacts.required`/`summary` consistency criterion.
- Docs fact owner: `apps/docs/concepts/types-and-artifacts.md` owns the artifact
  matrix, so it carries the sentence that the plan line and type table name
  every required artifact; `reference/commands.md` already links the plan
  without restating it.

## Risks / Trade-offs

- [Existing projects' committed `openspec/schemas/<type>/schema.yaml`
  description drifts until `cospec update`] → it is a managed file and the drift
  is expected; only prose changes, not behavior.
- [Golden and snapshot churn is wide (every harness's propose/new files)] →
  regenerated mechanically, reviewed as a pure text diff.
