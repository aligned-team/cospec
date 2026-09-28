# Dependencies

## Blocked by

- [x] `unknown-option-contract` — the command table, its parser, the
      reachability test, `parity-pending.yaml`, the differential and
      precedence-matrix fixtures, the upstream oracle, the remedy allowlist and
      `core/forward-relay.ts` this change extends _(archived 2026-09-28)_

## Soft-blocked by

None.

## Notes

`openspec/changes/` holds no other active change in this checkout.

Sequencing that is not a gate entry, because the provider is not archived on
this branch:

- `root-resolution-parity` owns `apps/cli/src/core/passthrough-command.ts` and
  lands the shared structural respell helper there (a parsed `--json` document
  plus a field map in, the rewritten document out). Task group 12 of this
  change, the `instructions` success-path respell, consumes that helper and runs
  only after this branch is rebased onto a `main` that carries it; every other
  task group runs before that rebase. The same rebase switches the relayed
  "Create one with…" hint on `instructions`' failure path onto that helper.
  `passthrough-json-and-doctor` consumes the same helper for `context`, so
  whichever of the two merges second rebases onto the other.
- `harness-adapter-table` holds its `init.ts` / `update.ts` / `doctor.ts` wiring
  track until this change and `passthrough-json-and-doctor` merge.
- `completion-install` later removes the two `powershell` pending entries
  (`completion` and `completion generate`); `cli-surface-parity`,
  `archive-and-sync-parity`, `tool-matrix`, `github-copilot` and
  `workflow-profiles` keep their own entries untouched here.
