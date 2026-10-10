# Dependencies

## Blocked by

- [x] `archive-and-sync-parity` — the rewritten `sync-specs` canon body
      (`canon/workflows/sync-specs.md`) whose references this change wraps, and
      the `cospec sync-specs` command the profile's `sync` dependency resolves
      to _(archived 2026-10-05)_
- [x] `harness-adapter-table` — `HARNESS_TABLE`, the one declaration of each
      tool's skills and commands layout that delivery reads _(archived
      2026-10-05)_
- [x] `tool-matrix` — every `AI_TOOLS` id as a `HARNESS_TABLE` row, the
      shared-skills-root arbiter and the new `render.ts` dialects that the
      workflow filter, delivery handling and capability derivation are built on
      _(archived 2026-10-09)_
- [x] `github-copilot` — the `github-copilot` row and the `--copilot-cloud` /
      `--no-copilot-cloud` flags that edit `init.ts`, `update.ts` and the
      receipt this change also edits _(archived 2026-10-09)_
- [x] `completion-install` — its four `parity-pending.yaml` entries are gone, so
      the acceptance row "the pending list is empty" can hold once this change's
      own two entries are removed _(archived 2026-10-09)_

## Soft-blocked by

None.

## Phase Gates

<!-- Not parsed by the gate. -->

Task group 1 ran first and gated everything after it: `tool-matrix` (R9),
`github-copilot` (R10) and `completion-install` (R11) are merged and archived on
`main`, and the branch was rebased onto that `main`, so the three are ledger
entries above. `init.ts`, `update.ts` and `render.ts` changed under the first
two, and groups 2 to 9 build on the merged code. The change cannot archive, and
its PR cannot merge, before group 1 is done.
