# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

- [x] `unknown-option-contract` — moves `init`, `update` and `doctor` onto the
      shared command-table parser, which task 5 parses `--harness` through
      _(archived 2026-09-28)_
- [x] `upstream-spellings` — adds `init --tools` and `update [path]` in
      `init.ts` and `update.ts` _(archived 2026-09-28)_
- [x] `passthrough-json-and-doctor` — folds `openspec doctor --json` into
      `doctor.ts` on every root _(archived 2026-09-29)_

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.

## Phase Gates

<!-- Not parsed by the gate. -->

Tasks 1 to 4 (the golden baseline, the table, and the render switch-over) ran
before the three changes under "Blocked by" merged. Task group 5 (the `init.ts`,
`update.ts` and `doctor.ts` wiring) started only after all three had merged to
`main`, because each edits the same three files; task 5.1 rebased onto that
`main` and recorded them above as archived.

The change cannot archive, and its PR cannot merge, before task group 5 is done.
