# Dependencies

## Blocked by

<!-- Changes that MUST be archived before this change can be applied. -->

- [x] `task-marker-coverage` — widens checkbox detection to every CommonMark
      list marker in `core/tasks.ts` and `core/verification.ts`, so the two hard
      archive gates stop reporting `total: 0` on a ledger written with `+` or
      ordered markers. 1.13.1's own task-checkbox lint flags the same state, so
      this change's `tasks/has-tasks` dedupe row is only correct on top of it
      _(archived 2026-09-22)_
- [x] `delta-parser-fidelity` — brings `core/deltas.ts` to 1.13.1 parser
      semantics: `*`/`+`/indented delta bullets, unpaired `FROM:`/`TO:` refusal,
      closing-ATX-run stripping in requirement names, bodyless scenarios
      uncounted on both sides, and orphaned requirement blocks reported. The
      archive pre-flight arms this change case-folds read their operations from
      that parser _(archived 2026-09-22)_
- [x] `canon-workflow-grounding` — lands every canon prose edit and the single
      managed-file regeneration this stack needs, so this change touches no
      canon file and `generate:check` is green from its first commit _(archived
      2026-09-22)_

## Soft-blocked by

<!-- Changes that improve this one but aren't strictly required. -->

None.
