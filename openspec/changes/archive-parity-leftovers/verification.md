## 1. An identical ADDED block stops blocking the archive [critical]

- [x] 1.1 @regression (agent) before the fix, run `cospec validate --strict` and `cospec archive` on a change whose `## ADDED` block reproduces the living requirement verbatim -> both ERROR `archive/added-exists`; after the fix, both are clean and the change archives -> after-half re-run on the finished tree via `bun test apps/cli/test/contract/added-early-sync.test.ts` (4 pass): validate exits 0 with no `archive/added-exists`, `cospec archive` exits 0 and the change directory is gone. The before-half is not re-runnable on the fixed tree; it is pinned instead by the `added-already-exists` fixture, whose differing body still errors on the same rule
- [x] 1.2 @unit (agent) `bun test apps/cli/test/unit/rules/archive.test.ts` with a new case whose ADDED block matches `LIVING`'s `Existing` block verbatim -> zero issues, and a CRLF-only variant of the same block -> zero issues -> 26 pass, 0 fail; both cases green
- [x] 1.3 @unit (agent) the pre-existing `ADDED a requirement that already lives` case, whose delta body genuinely differs from `LIVING`, runs unmodified -> still ERROR `archive/added-exists` -> green, and its message now asserts `already exists with different content`
- [x] 1.4 @equivalence (agent) `mise run test:contract` with `added-identical-early-sync` no longer marked conservative -> the parity harness observes the real 1.11.0 binary archiving it and asserts cospec's `verdict.invalid === false`; `added-already-exists` stays `expectAbort: true` and both sides still refuse -> `mise run test:contract` 66 pass, 0 fail; `conservative` is gone from that fixture and the parity file records no conservatism for `archive/added-exists`

## 2. REMOVED and RENAMED early-sync no-ops match the binary [critical]

- [x] 2.1 @unit (agent) `archive/target-missing` on a REMOVED target absent from the living spec -> no issue; the same with a fold-equal living name present -> ERROR whose hint names the exact living header -> both cases green in `archive.test.ts`; hint reads `"### Requirement: Existing" exists — fix the header to match it exactly`
- [x] 2.2 @unit (agent) a RENAMED with source absent and target present -> zero issues from both arms (`archive/target-missing` and `archive/added-exists`); with a fold-equal near-miss of the source that is not the target -> ERROR -> green; a case-only rename (`EXISTING` -> `Existing`) is also covered and stays a no-op, matching upstream's exclusion of the target from the near-miss search
- [x] 2.3 @unit (agent) a RENAMED with source and target both absent -> ERROR; the existing `RENAMED-TO collides with an existing requirement` case (both present) -> still ERROR, unmodified -> green, the pre-existing case unedited
- [x] 2.4 @equivalence (agent) new fixtures `removed-already-missing` and `renamed-early-sync` (no-op) plus `removed-near-miss-typo` and `renamed-from-near-miss` (`expectAbort: true`, `archive/target-missing`) -> `mise run test:contract` green, the harness deriving each verdict from the real 1.11.0 binary rather than the fixture's prediction -> all four added and green inside the 66-pass contract run
- [x] 2.5 @equivalence (agent) the untouched `renamed-collision` and `modified-missing-target` fixtures -> still abort on both sides, proving the relaxation did not spill into shapes the binary refuses -> both unedited and still aborting in the same run

## 3. A same-count scenario name swap is refused [critical]

- [x] 3.1 @regression (agent) before the fix, `cospec archive` on a MODIFIED delta that swaps a scenario name at count 2 -> `archive/scenario-preservation` is silent and only the delegated `openspec/validate` message appears; after the fix, cospec's own gate refuses with exit 1 and names the dropped scenario -> after-half re-run via `bun test apps/cli/test/contract/scenario-preservation.test.ts` (10 pass): cospec refuses the swap before delegating, exit non-zero, the change unmoved. The before-half is not re-runnable on the fixed tree; the `scenario-name-swap` parity fixture pins that the real binary refuses it too, so a regression cannot pass silently
- [x] 3.2 @unit (agent) `findScenarioDrops` on a same-count name swap -> `missingNames: ['<old name>']`; on living ×2 / delta ×1 of one name -> exactly one missing entry; on a case-only rename -> a drop -> all three green in `deltas.test.ts` (56 pass, 0 fail)
- [x] 3.3 @unit (agent) the three existing `findScenarioDrops` `toEqual` assertions updated with the real `missingNames` values -> still pass, with no assertion weakened -> green; each carries its real names rather than a loosened matcher
- [x] 3.4 @integration (agent) `apps/cli/test/integration/archive-gates.test.ts` -> the gate refuses a name-swap delta and stderr names the dropped scenario; the existing assertion `widgets: "Widget rendering" 2 -> 1 scenario(s)` runs unedited and still passes -> 14 pass, 0 fail; the names are appended after that prefix, which is unedited
- [x] 3.5 @equivalence (agent) new `scenario-name-swap` fixture and a `scenario-preservation.test.ts` pair -> both sides refuse, cospec on `archive/scenario-preservation` and the binary on its own message, exit 1, the change unmoved and the living spec keeping both scenarios -> green in the contract run

## 4. Parser retention is exact, not approximate [critical]

- [x] 4.1 @unit (agent) retained raw includes the header line, ends before the next `### Requirement:`, and ends before the next `## ` section -> assertions on the exact captured text -> green in `deltas.test.ts`
- [x] 4.2 @unit (agent) fenced `####`-looking lines are present in the retained raw but yield no scenario name -> raw contains the line, `scenarioNames` does not -> green (`fenced content is retained verbatim but yields no scenario`)
- [x] 4.3 @unit (agent) CRLF-only and trailing-blank-line differences normalise equal, while interior-whitespace, scenario-order and one-scenario-body differences normalise unequal -> the looseness risk that would manufacture a false PASS is pinned shut -> green
- [x] 4.4 @unit (agent) `#### Scenario: Foo`, `#### Foo`, `#### Foo ####` all yield `Foo`, and `Foo` ≠ `foo` -> ATX-close stripping uses `[ \t]`, not `\s` -> green
- [x] 4.5 @unit (agent) a living spec whose last requirement is followed by `## Notes` -> the requirement keeps its own scenarios and the later section's are credited to no requirement, so the pre-existing phantom drop is gone -> green

## 5. The delegated duplicate stays suppressed

- [x] 5.1 @unit (agent) `apps/cli/test/unit/rules/delegated-dedupe.test.ts` re-run against the new drop-message shape -> the upstream duplicate is still suppressed, and a delegated loss for a different requirement still survives -> 12 pass, 0 fail
- [x] 5.2 @unit (agent) `nativeKey` widened to `/^MODIFIED "(.*)" drops scenario/` -> matches both the new and the old message shape, so no scenario loss is reported twice -> green; the count-arm fallback message still starts with the same prefix, so both shapes key alike

## 6. The corrected hint

- [x] 6.1 @unit (agent) the hint assertions in `apps/cli/test/unit/rules/archive.test.ts` updated to the new text -> no longer advise a same-delta REMOVE+ADD -> green; the test now asserts the string `ADD it back in the same delta` is absent and `ADD the replacement in a later one` is present
- [x] 6.2 @equivalence (agent) a new contract test running the real 1.11.0 binary on a delta that REMOVEs and ADDs one requirement name -> refused with `Requirement present in both ADDED and REMOVED`, so the retired remedy can never drift back into the hint -> green in `scenario-preservation.test.ts`; the binary reports that exact message, `openspec archive` exits non-zero and the living spec keeps both scenarios

## 7. Docs carry no drift

- [x] 7.1 @manual (agent) `apps/docs/reference/validation-rules.md` -> the `archive/added-exists` row says "with different content", the `archive/target-missing` row records the REMOVED/RENAMED early-sync exemptions and the mistyped-header carve-out, and the `archive/scenario-preservation` row states count and name identity with the new message shape -> all three rows re-read against the shipped behaviour and correct
- [x] 7.2 @manual (agent) `apps/docs/concepts/apply-and-archive.md` -> a short subsection explains why cospec mirrors OpenSpec's early-sync no-ops, and the scenario-preservation remedies replace the same-delta REMOVE+ADD with the two-changes remedy -> the "Early-synced operations are not blockers" subsection lists all three shapes with the rule each silences and the fold-equal carve-out; the retired remedy is replaced and named as one openspec refuses
- [x] 7.3 @manual (agent) `docs/architecture.md` -> the stale `Scenario removed:` / matching-REMOVED clause is gone, "As of upstream 1.6.0" is corrected to 1.8.0, and name identity is stated -> re-read: the clause is gone, the version reads 1.8.0, and the gate is described as case-sensitive name identity counted with multiplicity
- [x] 7.4 @integration (agent) `mise run docs:build` and `mise run generate:check` -> both exit 0, with no managed-file drift -> `docs:build` exits 0 ("build complete"); `generate:check` prints `cospec update --check: no drift`

## 8. The whole gate stays green

- [x] 8.1 @integration (agent) `mise run check` on the finished branch -> exit 0, every suite green including the contract suite against the real pinned 1.11.0 binary -> exit 0: 808 unit, 160 integration, 66 contract, 14 release-test, all 0 fail. Note: the contract suite's `config get --no-color` case fails when `FORCE_COLOR` is exported in the caller's shell (bun prints a deactivated-colors warning on stderr); run recorded with `env -u FORCE_COLOR`, which is how CI runs it
