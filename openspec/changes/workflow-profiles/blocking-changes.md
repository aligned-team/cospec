# Dependencies

## Blocked by

- [x] `archive-and-sync-parity` — the rewritten `sync-specs` canon body
      (`canon/workflows/sync-specs.md`) whose references this change wraps, and
      the `cospec sync-specs` command the profile's `sync` dependency resolves
      to _(archived 2026-10-05)_
- [x] `harness-adapter-table` — `HARNESS_TABLE`, the one declaration of each
      tool's skills and commands layout that delivery reads _(archived
      2026-10-05)_

## Soft-blocked by

None.

## Phase Gates

<!-- Not parsed by the gate. -->

The ledger above cannot hold a change that is neither active nor archived in
this tree (`blockers/dangling-ref`), and these three are on their own branches
and unmerged, so they are recorded here. The implement stage adds the first two
to "Blocked by" as archived entries in task 1.2, after rebasing onto the `main`
that carries them.

- **`tool-matrix` (R9), a hard prerequisite.** Every `AI_TOOLS` id as a
  `HARNESS_TABLE` row, the shared-skills-root arbiter and the new render
  dialects, in `harness/adapters.ts` and `harness/render.ts`. This change's
  workflow filter, delivery handling and capability derivation are built on the
  full matrix, as the roadmap orders (R9 before R12).
- **`github-copilot` (R10), a hard prerequisite.** The `github-copilot` row and
  the `--copilot-cloud` / `--no-copilot-cloud` flags, which edit `init.ts`,
  `update.ts` and the receipt this change also edits.
- **`completion-install` (R11), needed only for one acceptance row.** Nothing in
  this change uses it. The row "the pending list is empty" holds only after its
  four `parity-pending.yaml` entries are gone; task 1.3 checks that before the
  row is ticked.

Task group 1 runs first and gates everything after it. Groups 2 to 9 start only
after task 1.2 has rebased onto that `main`, because `init.ts`, `update.ts` and
`render.ts` change under both prerequisites. The change cannot archive, and its
PR cannot merge, before group 1 is done.
