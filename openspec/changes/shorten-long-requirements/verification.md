# Verification

## 1. The change validates and syncs [critical]

- [x] 1.1 @integration (agent) run `cospec validate shorten-long-requirements --strict` -> 0 errors, 0 warnings, validation passed
- [x] 1.2 @integration (agent) run `cospec sync-specs shorten-long-requirements` through archive's scenario-preservation gate against main -> merged 151 modified requirements (+ 0, ~ 151, - 0, → 0), no scenario-preservation refusal, change left active; `cospec apply` exits 0

## 2. The text is pr-100's, and under the limit

- [x] 2.1 @regression (agent) length-check every delta description (the text before the first scenario, stripped as `req_diff.py` strips it) and count the living requirements still over 500 characters -> all 151 delta descriptions are at most 500 characters (longest 500); 210 living requirements after sync, 2 still over 500, both in cospec-feedback and owned by the parity change (`Feedback files against cospec's own tracker by default` at 794, `Missing or unauthenticated gh is a supported path, not a failure` at 534)
- [ ] 2.2 @regression (agent) re-run `req_diff.py` between this branch and pr-100 -> pending

## 3. No behavior change

- [ ] 3.1 @equivalence (agent) run `mise run check` with no code changed -> pending
