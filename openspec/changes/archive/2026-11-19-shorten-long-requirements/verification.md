# Verification

## 1. The change validates and syncs [critical]

- [x] 1.1 @integration (agent) run `cospec validate shorten-long-requirements --strict` -> 0 errors, 0 warnings, validation passed
- [x] 1.2 @integration (agent) run `cospec sync-specs shorten-long-requirements` through archive's scenario-preservation gate against main -> synced the readdir-order requirement against main's rebased living spec (+ 0, ~ 1, - 0, → 0; the 151 pr-100 blocks already match the living text), no scenario-preservation refusal, change left active; `cospec apply` exits 0

## 2. The text is pr-100's, and under the limit

- [x] 2.1 @regression (agent) length-check every delta description (the text between a `### Requirement:` heading and its first `#### Scenario:`, stripped of surrounding whitespace, measured in characters) and count the living requirements still over 500 characters -> all 152 delta descriptions are at most 500 characters (longest 500; the readdir-order rewrite went from 762 to 412); 211 living requirements after sync, 2 still over 500, both in cospec-feedback and owned by the parity change (`Feedback files against cospec's own tracker by default` at 794, `Missing or unauthenticated gh is a supported path, not a failure` at 534)
- [x] 2.2 @regression (agent) re-run the requirement diff (parse each requirement block between `### Requirement:` headings in every `openspec/specs/<cap>/spec.md` and compare it with `git show pr-100:openspec/specs/<cap>/spec.md`) -> none of the 151 pr-100 requirements differs from pr-100; the 152nd block, "Wrapped calls list directories in Node's order" (embedded-openspec, added by main after #100), is this change's own rewording and is the only exception; the diff lists only requirements owned by the stamp, parity, install or budget change

## 3. No behavior change

- [x] 3.1 @equivalence (agent) run `mise run check` with no code changed -> exits 0: unit 3131 pass / 4 skip / 0 fail, contract 3231 pass / 0 fail, integration 403 pass / 2 skip / 0 fail, bench 343 pass, release e2e 14 pass, lint, format, typecheck, generate, agents and validate --all --strict clean
