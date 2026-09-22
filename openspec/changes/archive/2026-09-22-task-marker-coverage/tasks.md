# Tasks: task-marker-coverage

## 1. Widen the task detector

- [x] 1.1 Widen `CHECKBOX_LIKE` in `apps/cli/src/core/tasks.ts` to the full
      CommonMark marker set with upstream's link-bullet guard, leaving
      `TASK_VALID` untouched, and verify by verification row 2.1
- [x] 1.2 Extend `correctTask` in the same file so its marker-stripping replace
      covers `+` and ordered-list markers, and verify by verification row 2.1
      (the `corrected` hint matches the canonical rewrite)
- [x] 1.3 Confirm the canonical and indented forms are unaffected, and verify by
      verification row 2.4

## 2. Widen the verification-row detector

- [x] 2.1 Widen `CHECKBOX_LIKE` in `apps/cli/src/core/verification.ts` the same
      way, leaving `ROW_PREFIX` untouched, and verify by verification row 2.2
- [x] 2.2 Confirm a fully non-canonical ledger now reaches `blockedReasons`
      through `parsed.malformed.length > 0`, and verify by verification row 1.3

## 3. Tests

- [x] 3.1 Add marker-coverage and link-bullet cases to
      `apps/cli/test/unit/parsers/tasks.test.ts` and
      `apps/cli/test/unit/parsers/verification.test.ts`, and verify by
      verification rows 2.1, 2.2 and 2.3
- [x] 3.2 Add the two hard-gate regressions over archive fixtures (unfinished
      non-canonical task; fully non-canonical ledger), each failing before the
      fix, and verify by verification rows 1.1 and 1.2
- [x] 3.3 Add the strict-validate assertion for a non-canonical task fixture,
      and verify by verification row 3.1
- [x] 3.4 Run `mise run test` and `mise run test:contract`, and verify by
      verification rows 3.2 and 3.3

## 4. Docs and project gate

- [x] 4.1 State the widened detector set in `docs/validation.md` and
      `apps/docs/reference/validation-rules.md` for both rule ids, and verify by
      verification row 4.1
- [x] 4.2 Run `mise run docs:build` and `mise run check`, and verify by
      verification rows 4.2 and 3.4

## 5. Close the same class in the sibling detectors

- [x] 5.1 Route `blocking-changes.md`'s entry detection through the shared
      `CHECKBOX_LIKE` and widen `LOOSE_SLUG_BULLET` to the same marker set in
      `apps/cli/src/core/blockers.ts`, and verify by verification rows 5.1 and
      5.2
- [x] 5.2 Widen `SURFACE_ITEM_RE` in `apps/cli/src/core/proposal.ts` to the same
      marker set, leaving its skip-on-no-match reader shape untouched, and
      verify by verification row 5.3
- [x] 5.3 Add the apply-gate regression and the parser/rule cases for both
      files, each failing before the fix, and verify by verification rows 5.1,
      5.2 and 5.3
- [x] 5.4 State both facts on the pages that own them (`docs/validation.md`,
      `apps/docs/reference/validation-rules.md`), and verify by verification row
      5.4
