## 1. WU-1 delta bullet markers are recognised [critical]

- [ ] 1.1 @regression (agent) run the new `deltas.test.ts` bullet fixtures — `*`- and `+`-bulleted REMOVED, an indented ` -` FROM/TO pair, a `*` bullet inside a fence — against the parser before and after the fix -> before: the `*`/`+`/indented cases record no op; after: each records its op and the fenced bullet still records none
- [ ] 1.2 @regression (agent) `cospec validate --strict` a change whose `## REMOVED Requirements` names a near-miss of a living requirement (`Widget  caching` vs `Widget caching`) with a `*` bullet -> `archive/target-missing` ERROR, exit 1 (before WU-1 the entry never parsed, so the gate reported `archive/no-ops` instead — never a clean exit 0; an absent-not-near-miss target is upstream's already-removed early sync and is correctly silent on both sides)
- [ ] 1.3 @integration (agent) `cospec archive` that same change -> refused at the `archive/target-missing` pre-flight before any delegation
- [ ] 1.4 @equivalence (agent) `apps/cli/test/contract/delta-bullet-markers.test.ts` — spawn the REAL pinned 1.11.0 binary on a `*`- and a `+`-bulleted REMOVED and RENAMED, and on the indented-`-` controls -> the pin REFUSES `*`/`+` (`… but no requirement entries parsed`, archive exit 1, change unmoved, living spec untouched) and ACCEPTS the indented `-`; cospec relays the refusal as `openspec/validate` and never moves the change, so the marker widening leads the pin without producing a false archive PASS

## 2. WU-2 unpaired rename lines are refused

- [ ] 2.1 @regression (agent) parse a `## RENAMED Requirements` section ending in a lone `FROM:` -> no RENAMED op is recorded, the dangling line is retained with side/name/line, and `deltas/unpaired-rename` is reported as an ERROR naming the missing `TO:`
- [ ] 2.2 @unit (agent) parse `FROM: a`, `FROM: b`, `TO: x` in one section -> exactly one RENAMED op (`a`→`x` is not manufactured from the wrong pair), exactly one unpaired `FROM:` reported, and `b` is not renamed to `x`
- [ ] 2.3 @regression (agent) parse a section whose only content is a dangling `FROM:` -> the section is reported in `emptySections`, which the phantom op previously suppressed
- [ ] 2.4 @unit (agent) parse a `FROM:` followed by a new `## ` section header carrying a `TO:` -> the two do not cross-pair; both are reported unpaired

## 3. WU-3 requirement names ignore a closing ATX run

- [ ] 3.1 @regression (agent) `cospec validate --strict` a delta writing `### Requirement: Foo ###` against a living `### Requirement: Foo` -> no `archive/target-missing`; the names resolve to one requirement
- [ ] 3.2 @unit (agent) normalise `### Requirement: C#` and a name ending in a non-space-preceded `#` run -> the `#` is preserved, proving the `[ \t]+#+[ \t]*$` class rather than `\s`
- [ ] 3.3 @unit (agent) normalise `### Requirement: Foo ###` on the living-spec side and fold it with `foldRequirementName` -> both yield `Foo` / `foo`, so near-miss detection inherits the strip

## 4. WU-4 bodyless scenarios count on neither side [critical]

- [ ] 4.1 @regression (agent) `cospec validate --strict` a MODIFIED block whose only scenario is a bare `#### Scenario: X` header -> `deltas/requirement-shape` ERROR carrying the new hint naming the missing body
- [ ] 4.2 @regression (agent) `cospec archive` a delta that replaces a real living scenario with a bare header -> `archive/scenario-preservation` refuses with exit 1 (today: false PASS)
- [ ] 4.3 @regression (agent) `cospec archive` a change whose _living_ spec carries a bodyless scenario header the delta does not repeat -> the gate reports no loss and does not refuse (today: false refusal), proving both counters are gated
- [ ] 4.4 @unit (agent) parse a bodyless `#### ` header -> it contributes neither a `scenarioCount` increment nor a `scenarioNames` entry, so the count arm and the name-identity arm of the gate agree

## 5. WU-5 orphaned requirement blocks are reported

- [ ] 5.1 @regression (agent) `cospec validate` a delta carrying a `### Requirement:` block above the first `## ` header and one under `## Notes` -> two `deltas/orphaned-requirement` WARNINGs naming each requirement (today: both discarded silently)
- [ ] 5.2 @unit (agent) run the same fixture non-strict -> the exit code is unchanged, confirming WARNING not ERROR

## 6. Suite, pin-independence and docs

- [ ] 6.1 @unit (agent) `mise run test` -> green; all five WU fixture families pass and the coverage gate holds
- [ ] 6.2 @equivalence (agent) `mise run test:contract` against the pinned 1.11.0 binary -> green, including the new `delta-bullet-markers` fixtures. WU-2/WU-5 are pin-independent; WU-1's leading-whitespace half is catch-up to the pin but its `*`/`+` marker class is 1.13.1-only and is evidenced by 1.4, not assumed; WU-3 and WU-4 are recorded as anticipating 1.13.1 semantics and are re-asserted against the real binary in the pin-bump change
- [ ] 6.3 @unit (agent) parse one delta file repeating `## MODIFIED Requirements` twice and once in a different letter case -> every section's requirements accumulate, recording the single-forward-pass property the upstream unified-reader fix restores elsewhere
- [ ] 6.4 @manual (agent) `docs/validation.md` and `apps/docs/reference/validation-rules.md` -> both list `deltas/unpaired-rename` and `deltas/orphaned-requirement` and state the widened delta bullet forms, with no other fact duplicated across the two pages
- [ ] 6.5 @integration (agent) `mise run check` -> green end to end
