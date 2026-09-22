# Verification: task-marker-coverage

## 1. The two hard archive gates refuse work written with a non-canonical marker [critical]

- [ ] 1.1 @regression (agent) `cospec archive` on a fixture change whose `tasks.md` mixes a completed `- [x]` row with an unfinished `+`-bulleted task -> archive is refused, the unfinished task is named in the incomplete-task list; the same fixture archives clean before the fix
- [ ] 1.2 @regression (agent) `cospec archive` on a fixture change whose `verification.md` rows are written entirely with `+` bullets -> archive is refused by `archive/verification-incomplete`; before the fix the same fixture reports `0/0 verified` and archives
- [ ] 1.3 @unit (agent) `computeVerificationVerdict` over a ledger whose rows all use `+` bullets -> `blockedReasons` is non-empty via `parsed.malformed.length > 0`, not the empty-and-clean verdict it returns today

## 2. Detector coverage and the link-bullet guard

- [ ] 2.1 @unit (agent) `parseTasks` over `+ [ ] 1.1 x`, `* [ ] 1.1 x`, `1. [ ] 1.1 x`, `1) [x] 1.1 x` -> each is reported as `tasks/checkbox-grammar` with `corrected` equal to the canonical `- [ ] 1.1 x` / `- [x] 1.1 x` rewrite
- [ ] 2.2 @unit (agent) `parseVerification` over the same four marker forms carrying a well-formed row body -> each is reported as `verification/row-grammar`, none is counted as a parsed row
- [ ] 2.3 @unit (agent) `parseTasks` and `parseVerification` over `- [Some doc](./doc.md)` and `- [1](./one)` -> neither parser reports a malformed line for either input (upstream's link-bullet guard)
- [ ] 2.4 @unit (agent) `parseTasks` over the canonical `- [ ] 1.1 x` and over an indented `  - [ ] 1.1 x` -> the canonical line is still a parsed item and the indented line is still a `tasks/checkbox-grammar` ERROR, so the widening changes neither existing behavior

## 3. Rule-level and project gates

- [ ] 3.1 @integration (agent) `cospec validate <fixture with a non-canonical task marker> --strict` -> `tasks/checkbox-grammar` ERROR and exit 1, where the same fixture validates clean today
- [ ] 3.2 @unit (agent) `mise run test` -> green, including every row above
- [ ] 3.3 @equivalence (agent) `mise run test:contract` -> unchanged and green against the real binary at the 1.11.0 pin, proving this fix is pin-independent
- [ ] 3.4 @integration (agent) `mise run check` -> green (lint, format, typecheck, unit, generate drift)

## 4. Docs carry the widened detector set

- [ ] 4.1 @manual (human) read `docs/validation.md` and `apps/docs/reference/validation-rules.md` after the edit -> both describe the widened marker set for `tasks/checkbox-grammar` and `verification/row-grammar`, and neither still implies only `-`/`*` are detected
- [ ] 4.2 @integration (agent) `mise run docs:build` -> the docs site builds with the edited reference page

## 5. The same marker gap is closed in the two sibling detectors [critical]

- [ ] 5.1 @regression (agent) `cospec apply` on a change whose `## Blocked by` holds an unchecked, unarchived `+ [ ] `dep``entry -> exits non-zero reporting`blockers/entry-grammar`; before the fix `computeGate`returned`{state: 'clear', hard: []}` and apply exited 0 over a real unshipped dependency
- [ ] 5.2 @unit (agent) `parseBlockers` over `*`/`+`/`1.`/`1)`-bulleted gated-section entries and over the same markers on a backticked-slug bullet outside the sections -> each is a malformed entry carrying the canonical `corrected` line, or a linted loose slug bullet; the canonical `- [ ] ` entry still parses as an entry
- [ ] 5.3 @unit (agent) `parseSurfaces` / `checkedSurfaces` over `+ [x] deploy`, `1. [x] interactive` and `+ [x] telepathy` -> each flag is read with its token and checked state and reaches `proposal/surfaces-vocab`; before the fix each line was skipped with no diagnostic, silently unsetting the flag
- [ ] 5.4 @manual (human) read `docs/validation.md` and `apps/docs/reference/validation-rules.md` after the edit -> both state the shared marker set for `blockers/entry-grammar` and the `## Surfaces` reader, and name the gate consequence rather than describing it as lint
