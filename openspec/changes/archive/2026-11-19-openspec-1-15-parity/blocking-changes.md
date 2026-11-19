# Dependencies

## Blocked by

- [x] `change-stamp-x-prefix` — the `x-cospec-schema-version` stamp and its
      _(archived 2026-11-19)_ legacy `schemaVersion` fallback; the 1.15.0 binary
      reports `schemaVersion` as an unknown key, and this change's unknown-key
      rule counts both stamp keys as known
- [x] `shorten-long-requirements` — every living requirement under 500
      _(archived 2026-11-19)_ characters, without which this change's
      `specs/requirement-too-long` rule fails `cospec validate --all --strict`
      on this repo's own specs

## Soft-blocked by

None.

## Shipped providers

The parity groundwork this change builds on is already archived: the
reachability gate and `parity-pending.yaml` (`parity-definition`), the 1.13.1
pin (`openspec-1-13-1-parity`), the CLI surface and archive/sync mirrors
(`cli-surface-parity`, `archive-and-sync-parity`), and the canon port ledger
(`canon-workflow-parity`). `standalone-install` stacks on this change and drains
its one remaining `parity-pending.yaml` entry, `install`.
