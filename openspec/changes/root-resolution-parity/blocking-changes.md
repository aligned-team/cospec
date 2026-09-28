# Blocking Changes

## Blocked by

- [x] `unknown-option-contract` — its dispatcher _(archived 2026-09-28)_

## Soft-blocked by

None.

## Notes

`unknown-option-contract` merged to `main` first and was archived there; this
branch is rebased onto it. Group 7 builds on what it landed: the top-level
`--json` branch for resolver failures sits in its `cli.ts` dispatcher, the
differential matrix runs through its `upstream-oracle.ts`, and its `storeInArgv`
marker on `templates`/`schema` is removed because this change spawns both in the
resolved root and never passes them `--store` (task 7.9). No other active or
archived change provides anything this one consumes.
