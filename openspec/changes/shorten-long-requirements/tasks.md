# Tasks

## 1. Delta specs

- [x] 1.1 Generate a `MODIFIED` delta per capability from pr-100's living specs,
      one verbatim block per B requirement in the living spec's order, and
      verify 151 blocks across 27 capabilities
- [x] 1.2 Confirm every scenario name in the living text survives in its block
      and verify no block drops one
- [x] 1.3 Confirm every delta description is at most 500 characters and verify
      the living requirements still over it are all owned by the parity change

## 2. Change artifacts

- [x] 2.1 Write the proposal (with its "Clauses removed" and "Not here" notes),
      blocking-changes, design and verification ledger and verify
      `cospec validate shorten-long-requirements --strict` passes

## 3. Sync and no-behavior-change verification

- [x] 3.1 Run `cospec sync-specs shorten-long-requirements` and verify it runs
      clean through archive's scenario-preservation gate
- [x] 3.2 Run `mise run check` and verify the existing suite passes unchanged.
      The archive commit follows this one
