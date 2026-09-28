# Verification

## 1. Each lane keeps its own severities [critical]

- [x] 1.1 @equivalence (agent) `validation-parity.test.ts` legacy severity oracle: a `spec-driven` fixture tripping the binary's header-only and no-keyword SHALL/MUST, empty-body, skipped-header (both shapes), empty-section, both cross-section and both task-numbering findings (no-deltas needs a delta-free change, so entry 2's row in 5.1 covers it); run `openspec validate <c> --strict --json` and `cospec validate <c> --strict --json` -> every binary issue appears in cospec's report with the same level and message; cospec adds only `meta/legacy-schema` INFO; no `tasks/id-*`, `deltas/skipped-header` or `archive/*` rule id appears -> observed: `validation-parity.test.ts` `1.1 the legacy lane relays every binary finding at the binary level` passes against the pinned 1.13.1 binary; the fixture trips all 11 shapes, cospec's `openspec/validate` relays equal the binary's (level, message) multiset exactly, and the only other issue is `meta/legacy-schema`
- [ ] 1.2 @regression (agent) cospec-typed (`feat`) fixture whose ADDED requirement is `### Requirement: The system SHALL frob widgets` with body `The system frobs widgets.` -> before: `deltas/requirement-shape` ERROR with no hint, plus the binary's WARNING relayed underneath; after: one `deltas/requirement-shape` ERROR whose hint says to move the SHALL/MUST statement to the line immediately after the `### Requirement: ...` header (test `native`), and no delegated SHALL/MUST message (test `twin`)
- [x] 1.3 @unit (agent) `rules/deltas.test.ts`: header-only keyword, empty body with keyword in header, and no keyword anywhere -> ERROR in all three; the hint is present on the first two only; level, rule id and message are unchanged from before -> PASS: `rules/deltas.test.ts` `deltas/requirement-shape header-only SHALL/MUST hint` (3 tests) green; each case is one ERROR `deltas/requirement-shape` with the pre-change message `ADDED "<name>" must use SHALL/MUST normative language`, the move hint on the header-only and empty-body cases, none on the no-keyword case

## 2. Task numbering warns

- [ ] 2.1 @regression (agent) `feat` fixture `tasks.md` with `- [ ] 2.1 …` under `## 1.` and a second `- [ ] 1.1 …` -> before: no task finding, `cospec validate --strict` exit 0 on an otherwise clean change; after: `tasks/id-mismatch` WARNING on the 2.1 line and `tasks/id-duplicate` WARNING on the second 1.1 line naming the first line, and `--strict` exits 1
- [ ] 2.2 @unit (agent) `rules/tasks.test.ts`: `1.2.3` and `1.2.4` under one group; `1.3a`; `01.1` under `## 1.`; a task under an unnumbered `## Notes` after `## 1.`; a file with no numbered group; a duplicate id inside a fenced block -> only the mismatch/duplicate cases the binary's `findTaskNumberingIssues` reports are raised (distinct deep ids, the padded id, the stray and the fenced lines raise nothing); `TASK_NUM_RE` is the exported regex the rule reads
- [x] 2.3 @equivalence (agent) `spec-driven` fixture with the same `tasks.md` -> the report carries the binary's two numbering WARNINGs and no `tasks/id-*` -> observed: `2.3 the legacy lane carries the binary numbering WARNINGs and no tasks/id-*` passes; each WARNING is relayed once at WARNING, zero `tasks/id-*` issues

## 3. Cross-section conflicts appear in the validate preview [critical]

- [ ] 3.1 @regression (agent) `validation-parity.test.ts`: one delta file REMOVEs and ADDs `Widget rendering` against a living spec carrying it; run `cospec validate --strict --json` and, in a second temp repo, the pinned binary's `archive -y` -> before: cospec reports no `archive/*` finding for the pair (the `feat` probe shows only the delegated `Requirement present in both ADDED and REMOVED`); after: one `archive/added-exists` ERROR on the ADDED line naming REMOVED and the binary's archive refuses, directory not moved (test `native`); no delegated twin (test `twin`)
- [ ] 3.2 @regression (agent) fresh capability `gadgets` whose delta ADDs and MODIFIES `Gadget thing` -> after: `archive/added-exists` on the ADDED line naming MODIFIED, `archive/new-spec-non-added` on the MODIFIED line, and the binary's archive refuses (test `native`); no delegated twin (test `twin`)
- [ ] 3.3 @regression (agent) living capability, ADDED `Widget rendering` block identical to the living one plus MODIFIED `Widget rendering` -> before: cospec valid (false PASS; the binary's archive refuses); after: `archive/added-exists` ERROR, cospec invalid, and the binary's archive refuses (test `native`); no delegated twin (test `twin`)
- [ ] 3.4 @equivalence (agent) fold variant: REMOVED `Widget rendering` plus ADDED `WIDGET RENDERING` -> no cross-section finding in cospec, and the binary's archive moves the change (exit 0)
- [ ] 3.5 @unit (agent) `rules/archive.test.ts` cross-section cases -> the inverted "ADDED re-using the exact header an earlier REMOVED vacated" test now expects one `archive/added-exists`; an ADDED with a differing body plus MODIFIED of one name gets exactly one `archive/added-exists` on the ADDED op; the RENAMED-vacated re-use test still expects zero issues

## 4. Skipped headers get a rule id

- [ ] 4.1 @regression (agent) `feat` fixture ADDED section with `### Documentation Requirements`, a nameless `### Requirement:`, a `### Notes inside` line within a block, and `### Scenario: Shallow` -> before: four `openspec/validate` INFOs relayed with no cospec rule id, plus `deltas/scenario-depth`; after: three `deltas/skipped-header` INFOs on the lines the binary reports and one `deltas/scenario-depth` ERROR (test `native`); no delegated INFO (test `twin`)
- [x] 4.2 @regression (agent) the same delta in a `feat` change with no `proposal.md` (never delegated) -> before: no finding for the skipped headers at all; after: the three `deltas/skipped-header` INFOs -> observed: `4.2 a never-delegated change still reports its skipped headers` passes (was `test.failing`); zero `openspec/validate` issues, `deltas/skipped-header` INFOs on lines 3, 9 and 18
- [x] 4.3 @unit (agent) `rules/deltas.test.ts`: the header between blocks, inside a block, nameless (`### Requirement:` and `### requirement`), inside a fence, in a REMOVED section, and a `### Scenario:` line -> INFO for the first three only, the nameless message for the nameless header, and nothing for the fenced, REMOVED and scenario-depth lines; a requirement's scenario after a skipped header still counts; `--strict` verdict unchanged by INFO -> PASS: `rules/deltas.test.ts` `deltas/skipped-header` block (4 tests) green; INFOs on the between-block, inside-block and both nameless lines plus the MODIFIED-block divider, nothing on the fenced, REMOVED and `### Scenario:` lines, scenario-depth reported once, and a delta whose only findings are skipped headers carries no ERROR or WARNING

## 5. Nothing double-reports [critical]

- [ ] 5.1 @equivalence (agent) one contract test per `DUPLICATE_CLASSES` entry added (design D5, entries 1–9), each reading the delegated message from the pinned binary's `validate --strict --json` output on its fixture -> the binary emits the message at the expected level; cospec's merged report does not contain that exact message; cospec's native twin is present exactly once
- [ ] 5.2 @equivalence (agent) a delegated finding survives where cospec's rule is silent, against the binary's real output: a `feat` requirement whose only SHALL sits in a `#### Scenario:` step (cospec's `hasShallMust` counts it and the binary's requirement-text reader doesn't; probed: the binary warns `ADDED "…" should contain SHALL or MUST (RFC 2119 best practice for English specs)` and cospec raises no `deltas/requirement-shape`); the empty-section, no-deltas and both cross-section fixtures run with `--fast`, so `archive/*` doesn't run; two skipped headers in one file, each suppressed only by its own twin -> the SHALL/MUST WARNING and the four `--fast` delegated ERRORs are kept; the skipped-header count suppressed equals the native count. cospec's skipped-header predicate is the binary's, so no silent skipped-header case exists by construction
- [ ] 5.3 @regression (agent) `feat` empty-section fixture (`## ADDED Requirements` with no requirement) -> before: three findings (`archive/no-ops` plus the binary's empty-sections and no-deltas ERRORs); after: exactly one, `archive/no-ops`; with `--fast` the two delegated ERRORs are kept
- [ ] 5.4 @equivalence (agent) `archive-preflight-dedupe.test.ts` and `archive-parity.test.ts` unchanged and green -> every existing pairing still holds; no existing fixture's verdict moves

## 6. The workflow gets stricter, as the proposal says

- [ ] 6.1 @regression (agent) `mise run cospec -- validate --all --strict` on this repo, with the new rules in place -> exit 0: every active change, including `validation-parity`, passes the task-id WARNINGs
- [ ] 6.2 @manual (agent) proposal's BREAKING bullet read against the shipped behaviour -> the task-id WARNINGs fail `--strict`, and a same-name REMOVED+ADDED or ADDED+MODIFIED is an ERROR at validate time

## 7. Registry and test hygiene

- [ ] 7.1 @equivalence (agent) `grep -c 'owner: validation-parity' apps/cli/test/contract/parity-pending.yaml` before and after, and `mise run test:contract` `reachability.test.ts` -> 0 before, 0 after; reachability green
- [ ] 7.2 @unit (agent) `grep -nE 'test\.(todo|failing)' apps/cli/test/contract/validation-parity.test.ts` at the last implementation commit -> no match: every row that landed failing was flipped by the commit that fixed it

## 8. Docs on the owning pages

- [ ] 8.1 @manual (agent) `apps/docs/reference/validation-rules.md` -> rows for `deltas/skipped-header`, `tasks/id-mismatch`, `tasks/id-duplicate`; `deltas/requirement-shape` mentions the header-only hint; `archive/added-exists` states the two cross-section shapes and no longer says a REMOVED-vacated header is free to re-use; the dedupe section lists every new pairing
- [ ] 8.2 @manual (agent) `apps/docs/concepts/apply-and-archive.md` -> the early-sync prose no longer says an ADDED may re-use the exact header a REMOVED vacated, and names the cross-section refusal
- [ ] 8.3 @manual (agent) `apps/docs/concepts/how-it-relates-to-openspec.md` -> its dedupe summary matches the new pairings
- [ ] 8.4 @manual (agent) `docs/validation.md` -> rule list and dedupe paragraph match the reference page
- [ ] 8.5 @integration (agent) `mise run docs:build` -> exit 0

## 9. Full gate

- [ ] 9.1 @integration (agent) `mise run check` on the final implementation commit -> exit 0 (lint, format, typecheck, unit, contract, integration, generate:check, agents:check)
