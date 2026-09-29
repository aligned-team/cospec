# Dependencies

## Blocked by

- [x] `unknown-option-contract` — the command table the five new flags and two
      `__complete` values are declared in, `ctx.parsed` on every table row, the
      reachability test and the pending entries this change removes _(archived
      2026-09-28)_
- [x] `root-resolution-parity` — `resolveRoot`'s `source`, the
      `RootSelectionError`/`RawSelectionError` classes and the
      `{...payload, status}` document the per-command failure codes build on,
      and the upstream oracle helpers _(archived 2026-09-28)_
- [x] `upstream-spellings` — the structural respell of relayed documents and the
      `status/next-*` remedy entries `nextSteps` is spelled through _(archived
      2026-09-28)_
- [x] `validation-parity` — the `validate.ts` it last edited (merged first, as
      planned), `DUPLICATE_CLASSES` and the verbatim/advisory view split whose
      `deltas/scenario-depth` exception this change cites _(archived
      2026-09-28)_
- [x] `standalone-json-once` — one JSON document per wrapped `--json` call, so
      the delegated `status`/`list` documents parse as one _(archived
      2026-09-28)_
- [x] `pin-node-oracle` — the oracle running the pinned binary under Bun with
      the product's spawn env, and errno rows compared by code and path
      _(archived 2026-09-28)_

## Soft-blocked by

None.

## Notes

The doctor and passthrough-JSON change is merging to main while this change is
planned. It isn't archived in this checkout, so it isn't listed above. The first
task rebases onto main once it lands. It edits `root.ts`, `store.ts`,
`workset.ts`, `config.ts`, `schemas.ts`, `context.ts` and `doctor.ts`, and none
of those is in this change's file windows. The rebase re-checks that before any
implementation starts.

`archive-and-sync-parity` is next in line and consumes this change's detector
for its namespace-folder refusal. This change doesn't touch
`commands/archive.ts`.
