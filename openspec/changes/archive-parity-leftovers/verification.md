## 1. An identical ADDED block stops blocking the archive [critical]

- [ ] 1.1 @regression (agent) before the fix, run `cospec validate --strict` and `cospec archive` on a change whose `## ADDED` block reproduces the living requirement verbatim -> both ERROR `archive/added-exists`; after the fix, both are clean and the change archives
- [ ] 1.2 @unit (agent) `bun test apps/cli/test/unit/rules/archive.test.ts` with a new case whose ADDED block matches `LIVING`'s `Existing` block verbatim -> zero issues, and a CRLF-only variant of the same block -> zero issues
- [ ] 1.3 @unit (agent) the pre-existing `ADDED a requirement that already lives` case, whose delta body genuinely differs from `LIVING`, runs unmodified -> still ERROR `archive/added-exists`
- [ ] 1.4 @equivalence (agent) `mise run test:contract` with `added-identical-early-sync` no longer marked conservative -> the parity harness observes the real 1.11.0 binary archiving it and asserts cospec's `verdict.invalid === false`; `added-already-exists` stays `expectAbort: true` and both sides still refuse

## 2. REMOVED and RENAMED early-sync no-ops match the binary [critical]

- [ ] 2.1 @unit (agent) `archive/target-missing` on a REMOVED target absent from the living spec -> no issue; the same with a fold-equal living name present -> ERROR whose hint names the exact living header
- [ ] 2.2 @unit (agent) a RENAMED with source absent and target present -> zero issues from both arms (`archive/target-missing` and `archive/added-exists`); with a fold-equal near-miss of the source that is not the target -> ERROR
- [ ] 2.3 @unit (agent) a RENAMED with source and target both absent -> ERROR; the existing `RENAMED-TO collides with an existing requirement` case (both present) -> still ERROR, unmodified
- [ ] 2.4 @equivalence (agent) new fixtures `removed-already-missing` and `renamed-early-sync` (no-op) plus `removed-near-miss-typo` and `renamed-from-near-miss` (`expectAbort: true`, `archive/target-missing`) -> `mise run test:contract` green, the harness deriving each verdict from the real 1.11.0 binary rather than the fixture's prediction
- [ ] 2.5 @equivalence (agent) the untouched `renamed-collision` and `modified-missing-target` fixtures -> still abort on both sides, proving the relaxation did not spill into shapes the binary refuses

## 3. A same-count scenario name swap is refused [critical]

- [ ] 3.1 @regression (agent) before the fix, `cospec archive` on a MODIFIED delta that swaps a scenario name at count 2 -> `archive/scenario-preservation` is silent and only the delegated `openspec/validate` message appears; after the fix, cospec's own gate refuses with exit 1 and names the dropped scenario
- [ ] 3.2 @unit (agent) `findScenarioDrops` on a same-count name swap -> `missingNames: ['<old name>']`; on living ×2 / delta ×1 of one name -> exactly one missing entry; on a case-only rename -> a drop
- [ ] 3.3 @unit (agent) the three existing `findScenarioDrops` `toEqual` assertions updated with the real `missingNames` values -> still pass, with no assertion weakened
- [ ] 3.4 @integration (agent) `apps/cli/test/integration/archive-gates.test.ts` -> the gate refuses a name-swap delta and stderr names the dropped scenario; the existing assertion `widgets: "Widget rendering" 2 -> 1 scenario(s)` runs unedited and still passes
- [ ] 3.5 @equivalence (agent) new `scenario-name-swap` fixture and a `scenario-preservation.test.ts` pair -> both sides refuse, cospec on `archive/scenario-preservation` and the binary on its own message, exit 1, the change unmoved and the living spec keeping both scenarios

## 4. Parser retention is exact, not approximate [critical]

- [ ] 4.1 @unit (agent) retained raw includes the header line, ends before the next `### Requirement:`, and ends before the next `## ` section -> assertions on the exact captured text
- [ ] 4.2 @unit (agent) fenced `####`-looking lines are present in the retained raw but yield no scenario name -> raw contains the line, `scenarioNames` does not
- [ ] 4.3 @unit (agent) CRLF-only and trailing-blank-line differences normalise equal, while interior-whitespace, scenario-order and one-scenario-body differences normalise unequal -> the looseness risk that would manufacture a false PASS is pinned shut
- [ ] 4.4 @unit (agent) `#### Scenario: Foo`, `#### Foo`, `#### Foo ####` all yield `Foo`, and `Foo` ≠ `foo` -> ATX-close stripping uses `[ \t]`, not `\s`
- [ ] 4.5 @unit (agent) a living spec whose last requirement is followed by `## Notes` -> the requirement keeps its own scenarios and the later section's are credited to no requirement, so the pre-existing phantom drop is gone

## 5. The delegated duplicate stays suppressed

- [ ] 5.1 @unit (agent) `apps/cli/test/unit/rules/delegated-dedupe.test.ts` re-run against the new drop-message shape -> the upstream duplicate is still suppressed, and a delegated loss for a different requirement still survives
- [ ] 5.2 @unit (agent) `nativeKey` widened to `/^MODIFIED "(.*)" drops scenario/` -> matches both the new and the old message shape, so no scenario loss is reported twice

## 6. The corrected hint

- [ ] 6.1 @unit (agent) the hint assertions in `apps/cli/test/unit/rules/archive.test.ts` updated to the new text -> no longer advise a same-delta REMOVE+ADD
- [ ] 6.2 @equivalence (agent) a new contract test running the real 1.11.0 binary on a delta that REMOVEs and ADDs one requirement name -> refused with `Requirement present in both ADDED and REMOVED`, so the retired remedy can never drift back into the hint

## 7. Docs carry no drift

- [ ] 7.1 @manual (agent) `apps/docs/reference/validation-rules.md` -> the `archive/added-exists` row says "with different content", the `archive/target-missing` row records the REMOVED/RENAMED early-sync exemptions and the mistyped-header carve-out, and the `archive/scenario-preservation` row states count and name identity with the new message shape
- [ ] 7.2 @manual (agent) `apps/docs/concepts/apply-and-archive.md` -> a short subsection explains why cospec mirrors OpenSpec's early-sync no-ops, and the scenario-preservation remedies replace the same-delta REMOVE+ADD with the two-changes remedy
- [ ] 7.3 @manual (agent) `docs/architecture.md` -> the stale `Scenario removed:` / matching-REMOVED clause is gone, "As of upstream 1.6.0" is corrected to 1.8.0, and name identity is stated
- [ ] 7.4 @integration (agent) `mise run docs:build` and `mise run generate:check` -> both exit 0, with no managed-file drift

## 8. The whole gate stays green

- [ ] 8.1 @integration (agent) `mise run check` on the finished branch -> exit 0, every suite green including the contract suite against the real pinned 1.11.0 binary
