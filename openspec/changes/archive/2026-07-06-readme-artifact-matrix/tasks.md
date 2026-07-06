## 1. Root README

- [x] 1.1 Add the `verification` column to the type table with per-type truth
      from type-facts (required for feat/fix/perf/refactor; opt for
      revert/build/ci; forbidden for chore/docs/style/test)
- [x] 1.2 Extend the footnote so verification "opt" reads as surface-triggered
- [x] 1.3 Fold the verification ledger, `## Surfaces` triggers, and
      `schemaVersion` grandfathering into the wrapper paragraph
- [x] 1.4 Add `cospec migrate <change>` to the commands table and confirm
      doctor's row still accurate
- [x] 1.5 Fold verification into the workflow steps (propose, implement, archive
      hard gates)
- [x] 1.6 Add verification-ledger and surfaces/grandfathering bullets to the
      "How it relates to OpenSpec" adds-list

## 2. Package README + verification

- [x] 2.1 Add the verification ledger to `apps/cli/README.md`'s adds-list
- [x] 2.2 Verify: `mise run check` green (format, lint, typecheck, tests,
      generate:check, agents:check all pass with the doc edits)
