# Verification

## 1. Case-variant requirement headers reach the operation list [critical]

- [ ] 1.1 @regression (agent) parse a `## ADDED Requirements` section whose block is `### requirement: Lower` and a second whose block is `### REQUIREMENT: Upper`, before and after the fix -> before: `ops` is empty and `emptySections` contains `ADDED`; after: two ADDED ops with names `Lower` and `Upper` and their scenario counts
- [ ] 1.2 @regression (agent) parse `## REMOVED Requirements` carrying `### requirement: Alpha` -> before: no op, `emptySections` contains `REMOVED`; after: one REMOVED op named `Alpha`, so `archive/target-missing` can see it
- [ ] 1.3 @regression (agent) parse `## MODIFIED Requirements` carrying `### REQUIREMENT: Alpha` -> before: no op; after: one MODIFIED op named `Alpha` carrying its scenario names, so `archive/scenario-preservation` can compare it

## 2. The mixed-section absorption is gone [critical]

- [ ] 2.1 @regression (agent) parse one `## MODIFIED Requirements` section holding `### Requirement: Alpha` (scenario `s1`) followed by `### requirement: Beta` (scenario `s2`) -> before: exactly one op named `Alpha` with `scenarioCount` 2 and `scenarioNames` `['s1','s2']` — Beta invisible and Alpha's scenario set inflated; after: two ops, `Alpha`/`['s1']` and `Beta`/`['s2']`
- [ ] 2.2 @integration (agent) `cospec archive` a change whose MODIFIED block is `### requirement: Alpha` and drops a scenario the living spec still has -> `archive/scenario-preservation` refuses (exit non-zero, change unmoved, living spec byte-identical). Before the fix the gate sees no op for Alpha and the binary applies the drop — the false archive PASS this change exists to close

## 3. Nothing else loosens

- [ ] 3.1 @regression (agent) parse a lowercase REMOVED **bullet** (``- `### requirement: Alpha` ``) and lowercase `from:`/`to:` rename lines -> still no ops, matching the binary; the fix touches only the canonical header
- [ ] 3.2 @equivalence (agent) contract test spawning the REAL pinned 1.13.1 binary on the probe matrix from the proposal -> lowercase/uppercase `### Requirement:` under ADDED/MODIFIED/REMOVED parse (`show --json --deltas-only` `deltaCount` > 0, `archive` really applies); the REMOVED bullet and the `FROM:`/`TO:` forms in lowercase do NOT parse (`deltaCount` 0, validate reports "no deltas found"). Pins the asymmetry so a pin bump that changes it fails loudly
- [ ] 3.3 @unit (agent) confirm no second regex needed widening -> `SCENARIO_RE` is `/^####\s+/` (upstream `SCENARIO_HEADER` identical, so `#### scenario:`/`#### SCENARIO:` already parse) and delta section titles are lowercased before the `SECTION_TITLES` lookup (upstream `getSectionsCaseInsensitive`)

## 4. Suite and docs

- [ ] 4.1 @unit (agent) `mise run test` -> green
- [ ] 4.2 @equivalence (agent) `mise run test:contract` against the pinned binary -> green, including the new case-matrix fixtures
- [ ] 4.3 @manual (agent) the `apps/docs` page that owns the delta header format, plus `docs/validation.md` -> each states the header-keyword case tolerance and its limits exactly once, with no fact duplicated across the two
- [ ] 4.4 @integration (agent) `mise run check` -> green end to end
