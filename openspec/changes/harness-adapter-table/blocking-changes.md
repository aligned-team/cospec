# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

None.

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.

## Phase Gates

<!-- Not parsed by the gate. The three changes below are not yet present in this branch's openspec/changes/, so they cannot be ledger entries (blockers/dangling-ref). When they merge, task 5.1 rebases onto main and records each one under "Blocked by" as a checked, archived entry. -->

Tasks 1 to 4 (the golden baseline, the table, and the render switch-over) start
now. Task group 5 (the `init.ts`, `update.ts` and `doctor.ts` wiring) starts
only after all three of these have merged to `main`, because each edits the same
three files:

- `unknown-option-contract` — moves `init`, `update` and `doctor` onto the
  shared command-table parser, which is what task 5 parses `--harness` through.
- `upstream-spellings` — adds `init --tools` and `update [path]` in `init.ts`
  and `update.ts`.
- `passthrough-json-and-doctor` — folds `openspec doctor --json` into
  `doctor.ts` on every root.

The change cannot archive, and its PR cannot merge, before task group 5 is done.
