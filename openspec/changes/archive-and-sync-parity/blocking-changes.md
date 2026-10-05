# Dependencies

## Blocked by

- [x] `cli-surface-parity` — the namespace-folder detector
      (`findNestedChangesIn`, `describeNestedChange`) archive's refusal calls,
      `rootOutput` and the key oracle (`support/key-oracle.ts`) the archive
      envelopes are proven with, and the per-module `jsonFailurePayload` hook
      _(archived 2026-10-05)_
- [x] `validation-parity` — the verbatim/advisory view split (`parseDeltaSpec`'s
      `Delta`, `LivingSpec.archive`) the scenario-preservation helper reads, and
      `archive/rebuilt-spec-invalid`, which still refuses a REMOVED-only delta
      on a new capability once `archive/new-spec-non-added` stops firing on it
      _(archived 2026-09-28)_
- [x] `unknown-option-contract` — the command table the `sync-specs` row and the
      `archive --no-validate` flag live in, the reachability test, and the
      pending entry this change removes _(archived 2026-09-28)_
- [x] `upstream-spellings` — the `core/remedies.ts` allowlist entries for
      `core/archive.js` that archive's relays are spelled through _(archived
      2026-09-28)_
- [x] `root-resolution-parity` — the resolver's `source`, the upstream oracle
      helpers, and the `rootSelectionDocument` path a root failure under
      `archive --json` answers through _(archived 2026-09-28)_
- [x] `pin-node-oracle` — the oracle running the pinned binary under Bun with
      the product's spawn env, and errno rows compared by code and path
      _(archived 2026-09-28)_

## Soft-blocked by

None.

## Notes

`cli-surface-parity` merged in #59, and this change starts from that `main`. The
R8 adapter-table refactor (merged) and the `harness-receipt-and-doctor-scope`
fix, which runs alongside this change, touch `harness/*`, `init.ts`, `update.ts`
and `doctor.ts`. None of those are in this change's files. Both still pass
through `mise run generate`, so this change's canon edits regenerate on top of
whatever has merged at rebase time.
