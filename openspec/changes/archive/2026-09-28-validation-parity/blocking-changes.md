# Dependencies

## Blocked by

- [x] `unknown-option-contract` — the command table, `hasFlag`/`ctx.parsed` in
      `validate.ts`, the reachability test and `parity-pending.yaml` whose owner
      list names this change _(archived 2026-09-28)_

## Soft-blocked by

None.

## Notes

No other change is active in this checkout. `upstream-spellings` and
`passthrough-json-and-doctor` run in their own worktrees at the same time, and
none of their files overlap with this change's.

`cli-surface-parity` edits `apps/cli/src/commands/validate.ts` too, so this
change has to merge first. This change touches only the `DUPLICATE_CLASSES`
array in that file. `cli-surface-parity` owns every other part of it, including
wiring `respellRemedies` into its relays and the `--type`, `--report` and
`--concurrency` flags.
