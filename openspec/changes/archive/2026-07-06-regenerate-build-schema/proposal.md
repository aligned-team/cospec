## Why

The `build` schema type is defined in the canon
(`apps/cli/src/canon/types/build.yaml`, added in f48dbb0) but its generated
output under `openspec/schemas/build/` was never committed: the broad `build/`
rule in `.gitignore` (meant for build-output dirs) silently matches
`openspec/schemas/build/`, so git ignored it. As a result
`mise run generate:check` reports drift and both the canon drift gate and
`openspec:schema:validate` fail once tools install in CI.

## What Changes

- `.gitignore` — add `!openspec/schemas/build/` so the generated `build`-type
  schema is tracked despite the `build/` rule.
- Regenerate managed schema output via `mise run generate`, adding
  `openspec/schemas/build/schema.yaml` and its three artifact templates
  (`proposal.md`, `blocking-changes.md`, `tasks.md`).

## Impact

- Files: `.gitignore` and `openspec/schemas/build/**` (4 new files). No canon,
  source, or workflow edits — this brings the committed schema output in sync
  with the already-committed canon.
- Unblocks the `generate:check` and `openspec:schema:validate` steps of the
  `ci-openspec` job.
