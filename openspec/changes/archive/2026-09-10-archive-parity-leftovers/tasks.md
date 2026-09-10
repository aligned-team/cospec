## 1. Parser retention

- [x] 1.1 Add `raw` and `scenarioNames` to `DeltaOp` and populate them in
      `parseDeltaSpec` from `scanMarkdown`'s unmasked `source`, closing the raw
      buffer where `closeReq()` already fires, and verify by asserting in
      `test/unit/parsers/deltas.test.ts` that the captured raw starts at the
      header line and ends before the next `### Requirement:` and before the
      next `## ` section
- [x] 1.2 Add `requirementBlocks` and `requirementScenarioNames` to
      `LivingSpec`, collect them in `parseLivingSpec`, and reset
      `currentReqName` on every `SECTION_RE` match, verified by a unit case
      where a trailing `## Notes` section's level-4 headers are credited to no
      requirement while the real scenarios survive
- [x] 1.3 Export verbatim ports of `normalizeBlockRaw`, `scenarioNameAt` (as
      `scenarioNameFromHeader`) and `foldRequirementName` from `deltas.ts`,
      verified by unit cases showing CRLF-only and trailing-blank differences
      equal, interior-whitespace and scenario-order differences unequal, the
      three ATX/prefix header forms folding to one name, and `Foo` ≠ `foo`.
      `foldRequirementName` landed with the arms that use it (task 2.2/2.3) and
      is covered through their near-miss cases rather than a case of its own —
      it has no caller outside typo detection
- [x] 1.4 Comment the deliberate deviation from upstream's per-block fence
      re-mask (cospec keeps one file-scope `buildCodeFenceMask`), verified by
      the unit case in which a fenced `####`-looking line appears in raw but
      yields no scenario name

## 2. Early-sync relaxations

- [x] 2.1 Make the ADDED arm of `archive/added-exists` body-aware, flagging only
      a name collision whose `normalizeBlockRaw` output differs, and verify with
      a new unit case reproducing the living block verbatim (zero issues), a
      CRLF-only variant (zero issues), and the pre-existing differing-body case
      running unmodified and still erroring
- [x] 2.2 Suppress `archive/target-missing` for a REMOVED target already absent,
      keeping the ERROR when a fold-equal living name exists, and verify the
      near-miss hint names the exact living header
- [x] 2.3 Suppress both `archive/target-missing` and the `archive/added-exists`
      TO-collision for a RENAMED whose source is absent and target present,
      keeping the ERROR on a fold-equal source near-miss that is not the target,
      and verify with unit cases for all four arms
- [x] 2.4 Leave the RENAMED-TO body comparison, the both-absent RENAMED, and the
      absent MODIFIED target untouched, verified by the existing
      `renamed-collision` and `modified-missing-target` fixtures still aborting
      on both sides

## 3. Name-identity scenario drops

- [x] 3.1 Add `missingNames` to `ScenarioDrop` and implement the
      multiplicity-aware walk in `findScenarioDrops`, reporting a drop when any
      name is missing or the count falls, verified by unit cases for a
      same-count name swap, a duplicate-name ×2 → ×1 loss, and a case-only
      rename
- [x] 3.2 Reshape the rule message to
      `MODIFIED "<req>" drops scenario(s) "<a>", "<b>" (living <n> -> delta <m>)`
      and append `; missing: "a", "b"` to the archive gate's existing stderr
      prefix, verified by the integration assertion
      `widgets: "Widget rendering" 2 -> 1 scenario(s)` still passing unedited
- [x] 3.3 Widen `nativeKey` in `validate.ts` to
      `/^MODIFIED "(.*)" drops scenario/` in the same commit, verified by
      `delegated-dedupe.test.ts` still suppressing the upstream duplicate under
      the new message shape
- [x] 3.4 Update the three existing `findScenarioDrops` `toEqual` assertions
      with their real `missingNames` values, verified by the unit suite passing
      with no assertion weakened

## 4. Corrected hint

- [x] 4.1 Rewrite `SCENARIO_DROP_HINT` to the two remedies that work — copy the
      scenario back into the MODIFIED block, or REMOVE in one change and re-ADD
      in a later one — and verify by updating the hint assertions in
      `test/unit/rules/archive.test.ts`
- [x] 4.2 Add a contract test proving the real 1.11.0 binary refuses a
      same-delta REMOVE+ADD of one requirement name with
      `Requirement present in both ADDED and REMOVED`, verified by that test
      failing if the old remedy is restored

## 5. Contract parity suite

- [x] 5.1 Rewrite the `added-identical-early-sync` fixture to drop its
      `conservative` marker, verified by the parity harness asserting
      `verdict.invalid === false` against the real binary's exit-0 archive
- [x] 5.2 Add the `added-identical-crlf`, `removed-already-missing`,
      `removed-near-miss-typo`, `renamed-early-sync`, `renamed-from-near-miss`
      and `scenario-name-swap` fixtures, verified by `mise run test:contract`
      green with each verdict derived from the real binary rather than the
      fixture's prediction
- [x] 5.3 Add the name-swap pair to `scenario-preservation.test.ts` asserting
      both sides refuse, and update the stale header comments in it and in
      `archive-parity.test.ts`, verified by the contract suite passing and the
      change directory staying unmoved

## 6. Docs and close-out

- [x] 6.1 Update the three `archive/*` rows in
      `apps/docs/reference/validation-rules.md`, verified by re-reading each row
      against the shipped behaviour
- [x] 6.2 Add the early-sync subsection to
      `apps/docs/concepts/apply-and-archive.md` and replace the same-delta
      REMOVE+ADD remedy, verified by `mise run docs:build` exiting 0
- [x] 6.3 Correct `docs/architecture.md` (retired-note clause, 1.6.0 → 1.8.0,
      name identity), verified by grepping the file for the removed clause
      returning nothing
- [x] 6.4 Run `mise run generate` if canon changed and `mise run check`,
      verified by both exiting 0 with no managed-file drift
