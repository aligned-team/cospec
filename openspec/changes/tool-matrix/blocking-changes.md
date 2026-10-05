# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

- [x] `harness-adapter-table` — `HARNESS_TABLE` and its row shape, the
      serializer/extension seam, `skillsRoot`/`scanRoots`/`removalRoots`, and
      `init`/`update`/`doctor` reading the table (PR #51) _(archived
      2026-10-05)_
- [x] `harness-receipt-and-doctor-scope` — the receipt hint rendered through the
      first row's dialect, `isHarnessDocument` narrowed to what cospec writes,
      and the leftover scan in `init.ts` that doctor shares (PR #63) _(archived
      2026-10-05)_

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.

## Sequencing

<!-- Not parsed by the gate. -->

Two changes are in flight on other branches and are not on `main`, so the ledger
cannot name them (an entry must be an active or archived change here). Both
touch files this change edits; whichever merges first, the other rebases.

- `opsx-leftover-scan-scope` (worktree branch, not yet a PR): edits `init.ts`
  `leftoverScanFiles` (stops at a nested `.git`) and `isOpsxMarkdown` (adds the
  OpenCode root-guard provenance, new `(relpath, text)` signature, shared with
  `doctor.ts`), and adds requirements to `opsx-migration-detection`. This
  change's leftover sweep (tasks group 9) generalises that OpenCode branch to
  every row and keeps its walk boundary. If it merges first, task 9.1 builds on
  its predicate; if this change merges first, it rebases onto ours.
- `archive-and-sync-parity` (PR #64, draft): edits
  `canon/workflows/harness.yaml`, the four
  `__golden__/harness-render/*/index.json` files, `.agents/shared.md`,
  `docs/harness-integration.md` and `apps/docs/guide/harness-setup.md`. If it
  merges first, the "existing four rows byte-identical" baseline (task 1.1) is
  re-taken on the rebased, unmodified tree before any source edit, and the new
  rows' goldens are written from that canon.
