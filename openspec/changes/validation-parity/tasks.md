# Tasks

Tracks follow design D1. Each track owns its files. T1–T4 each flip only their
own rows in T5's contract file, in the commit that makes them pass. Every task
ends with `mise run check` green and one commit (the harness's Co-Authored-By
trailer, never `--no-verify`).

## 1. T5 — contract tests first (`apps/cli/test/contract/validation-parity.test.ts`)

- [x] 1.1 Write the fixture builders (a `feat` shell following
      `archive-preflight-dedupe.test.ts` with the composed `feat` schema copied
      in, a `spec-driven` shell, the living `widgets` spec) and the legacy
      severity oracle (verification 1.1, 2.3). It passes today, so it lands as a
      plain `test`. Commit
      `test(validate): pin legacy-lane severities against the pinned binary`
- [x] 1.2 Add the regression rows for verification 1.2, 2.1, 3.1–3.4, 4.1, 4.2
      and 5.3, and one pinned-message row per design D5 entry plus the survives
      cases (5.1, 5.2). A row that asserts both a native finding and a
      suppressed twin is two tests, `<row> native` and `<row> twin`, so the
      track that adds the rule and the track that adds the dedupe each flip one.
      Each reads the delegated message from the binary's JSON, and every test
      that fails on this tree is marked `test.failing`. Record the failing
      count, run `mise run test:contract` green, and commit
      `test(validate): pin validation-parity regressions as failing rows`

## 2. T1 — skipped headers and the header-only hint (`apps/cli/src/core/deltas.ts`, `apps/cli/src/core/rules/deltas.ts`, `apps/cli/test/unit/rules/deltas.test.ts`)

- [x] 2.1 Add `skippedHeaders` to `ParsedDelta`, filled as design D2 describes,
      and unit-test that `ops`, `hasShallMust`, scenario counts and line numbers
      are unchanged on the existing parser fixtures. Commit
      `fix(validate): record skipped delta headers in the parser`
- [x] 2.2 Add the `deltas/skipped-header` INFO (design D2) and its unit tests
      (verification 4.3), then flip `4.1 native` and 4.2 in the contract file.
      Commit
      `fix(validate): report skipped delta headers as deltas/skipped-header`
- [x] 2.3 Add the header-only hint to `deltas/requirement-shape` (design D3) and
      its unit tests (verification 1.3), then flip `1.2 native`. Commit
      `fix(validate): hint where a header-only SHALL/MUST belongs`

## 3. T2 — task-id rules (`apps/cli/src/core/tasks.ts`, `apps/cli/src/core/rules/tasks.ts`, `apps/cli/test/unit/rules/tasks.test.ts`)

- [x] 3.1 Widen `TASK_NUM_RE` to the binary's task-id shape and record each
      item's enclosing numbered group in `parseTasks` (design D4). Unit-test
      that `groups`, `items` and `malformed` are unchanged on the existing
      fixtures. Commit
      `fix(validate): read task ids and their groups the way the binary does`
      (scope `validate`, not `tasks` — commitlint's scope-enum has no `tasks`
      entry)
- [x] 3.2 Add `tasks/id-mismatch` and `tasks/id-duplicate` (WARNING) with the
      unit tests of verification 2.2, then flip row 2.1. Commit
      `fix(validate): warn on mismatched and duplicate task ids`
- [x] 3.3 Run `mise run cospec -- validate --all --strict` on this repo and
      renumber this change's own `tasks.md` if a WARNING fires (verification
      6.1). Commit only if a file changed:
      `docs(validate): renumber tasks for the task-id rules`

## 4. T3 — cross-section conflicts (`apps/cli/src/core/rules/archive.ts`, `apps/cli/test/unit/rules/archive.test.ts`)

- [x] 4.1 Invert the unit test "an ADDED re-using the exact header an earlier
      REMOVED vacated is applied" to expect `archive/added-exists`, and add the
      one-finding-per-op and fold-variant unit cases (verification 3.5). Mark
      the inverted and one-finding-per-op expectations `test.failing`; the
      fold-variant case passes today and lands as a plain `test`. Commit
      `test(validate): expect same-name REMOVED+ADDED to be refused`
- [x] 4.2 Extend `replayDeltaNames` and `archiveRules` as design D6 describes,
      un-fail 4.1's tests, and flip `3.1 native`, `3.2 native` and `3.3 native`.
      Row 3.4 stays green. Commit
      `fix(validate): refuse same-name cross-section conflicts at pre-flight`

## 5. T4 — dedupe entries (`apps/cli/src/commands/validate.ts`, `DUPLICATE_CLASSES` only)

- [x] 5.1 Add design D5 entries 1, 2, 6 and 7 (`archive/no-ops`,
      `deltas/requirement-shape`) and flip `1.2 twin`, 5.3 and those entries'
      5.1/5.2 tests. Commit
      `fix(validate): dedupe empty-section and SHALL/MUST findings`
- [x] 5.2 Add entries 3, 4 and 5 (skipped headers, a skipped `### Scenario:`)
      and flip `4.1 twin` and those entries' 5.1/5.2 tests. Commit
      `fix(validate): dedupe skipped-header findings`
- [x] 5.3 Add entries 8 and 9 (cross-section) and flip `3.1 twin`, `3.2 twin`,
      `3.3 twin` and those entries' 5.1/5.2 tests. Confirm
      `grep -nE 'test\.(todo|failing)'` finds nothing in the contract file
      (verification 7.2). Commit
      `fix(validate): dedupe cross-section conflict findings`

## 6. T6 — docs (`apps/docs/reference/validation-rules.md`, `apps/docs/concepts/apply-and-archive.md`, `apps/docs/concepts/how-it-relates-to-openspec.md`, `docs/validation.md`)

- [x] 6.1 Update each page as design D9 describes (verification 8.1–8.4), then
      run `mise run docs:build` (8.5). Commit
      `docs(validate): document validation-parity rules and dedupe`

## 7. Close-out

- [x] 7.1 Record evidence on every verification row: 5.4 (existing dedupe and
      archive-parity suites green), 6.2, 7.1 (`owner: validation-parity` count 0
      before and after, reachability green) and 9.1 (`mise run check` exit 0).
      Commit `docs(validate): record validation-parity evidence`
- [ ] 7.2 Run `mise run cospec -- validate validation-parity --strict` and
      `mise run cospec -- archive validation-parity` as the PR branch's final
      commit, after rebasing onto `main`

## 8. Round 2 — the archive's view (review findings F1–F6)

- [x] 8.1 Pin the round-2 rows in `validation-parity.test.ts` (verification
      10–13), each running the pinned binary's validate and archive on its
      fixture; mark the rows that fail on the tree `test.failing`. Commit
      `test(validate): pin round-2 archive-view parity rows as failing`
- [x] 8.2 Give `scanMarkdown`/`parseDeltaSpec` a `ReadView` and
      `parseLivingSpec` an `archive` view; move every `archive/*` rule but
      scenario-preservation onto it (design D10). Commit
      `fix(validate): read archive rules from the view the archive merges`
- [x] 8.3 Name `deltas/requirement-shape` findings by the verbatim header
      (design D10). Commit
      `fix(validate): name requirement-shape findings as the header is written`
- [x] 8.4 Key `DUPLICATE_CLASSES` entry 5 on the header text its native message
      now quotes (design D5). Commit
      `fix(validate): key the scenario-depth twin on the header text`
- [x] 8.5 Add `archive/split-requirement` and its two dedupe entries; leave
      `deltas/skipped-header` to the headers the archive keeps (design D11).
      Commit `fix(validate): refuse a skipped header that splits a requirement`
- [x] 8.6 Refuse a misplaced or duplicate living requirement in
      `archive/target-invalid`, with its dedupe entry (design D12). Commit
      `fix(validate): refuse living specs the archive cannot update`
- [x] 8.7 Update the docs pages, design, specs and ledger for round 2
      (verification 14.1), and run `mise run check`. Commit
      `docs(validate): document the archive view and split-requirement`

## 9. Round 3 — one view model (review findings on round 2)

- [x] 9.1 Pin the round-3 rows in `validation-parity.test.ts` (verification
      15–20), each running the pinned binary's validate and archive on its
      fixture, plus the double-report sweep; mark the rows that fail on the tree
      `test.failing` and re-point row 11.6 to the `--fast` rule. Commit
      `test(validate): pin round-3 view-model parity rows as failing`
- [x] 9.2 Build one fence-aware scan (`scanDocument`, a line-walking
      `maskHtmlComments`) that both views read (design D10). Commit
      `fix(validate): find code fences before HTML comments in one scan`
- [x] 9.3 Read every `archive/*` rule, scenario-preservation included, from the
      verbatim view through one living reader; port all three structure kinds
      with the BOM kept (design D10, D12). Commit
      `fix(validate): read every archive rule from the verbatim view`
- [x] 9.4 Refuse a split inside a surviving living requirement (design D11).
      Commit
      `fix(validate): refuse a split inside a surviving living requirement`
- [x] 9.5 Pass `--fast` to `deltasRules` and keep the skipped-header INFO where
      the split is not checked (design D11). Commit
      `fix(validate): keep the skipped-header INFO when --fast skips the split`
- [x] 9.6 Add DUPLICATE_CLASSES entries 13–18 and widen entry 12 (design D5).
      Commit `fix(validate): dedupe the remaining typed-lane double reports`
- [x] 9.7 Update the docs pages, design, proposal and specs (verification 20.1).
      Commit `docs(validate): document the one view model and round-3 dedupe`
- [x] 9.8 Re-point the integration row that expected a drop for scenarios kept
      inside a comment (verification 15.4). Commit
      `test(validate): re-point the commented-scenario row at the verbatim view`
- [x] 9.9 Record the round-3 evidence and run `mise run check` (verification
      20.3). Commit `docs(validate): record round-3 view-model evidence`
