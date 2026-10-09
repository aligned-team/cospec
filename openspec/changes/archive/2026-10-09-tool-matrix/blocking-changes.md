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

Both changes that were in flight beside this one have merged:
`archive-and-sync-parity` and `opsx-leftover-scan-scope` (`7f1300ba`). This
change is rebased onto `7f1300ba`: the leftover sweep runs through the one
bounded walker (`walkProjectFiles`, which gained an `onUnreadable` callback) and
the OpenCode shape test lives in `harness/opencode-opsx.ts`. The two entries
below are their history.

- `opsx-leftover-scan-scope` (merged, `7f1300ba`): edits `init.ts`
  `leftoverScanFiles` (stops at a nested `.git`) and `isOpsxMarkdown` (adds the
  OpenCode root-guard provenance, new `(relpath, text)` signature, shared with
  `doctor.ts`), and adds requirements to `opsx-migration-detection`. This
  change's leftover sweep (tasks group 9) generalises that OpenCode branch to
  every row and keeps its walk boundary. If it merges first, task 9.1 builds on
  its predicate; if this change merges first, it rebases onto ours.
- `archive-and-sync-parity` (merged): edits `canon/workflows/harness.yaml`, the
  four `__golden__/harness-render/*/index.json` files, `.agents/shared.md`,
  `docs/harness-integration.md` and `apps/docs/guide/harness-setup.md`. If it
  merges first, the "existing four rows byte-identical" baseline (task 1.1) is
  re-taken on the rebased, unmodified tree before any source edit, and the new
  rows' goldens are written from that canon.
