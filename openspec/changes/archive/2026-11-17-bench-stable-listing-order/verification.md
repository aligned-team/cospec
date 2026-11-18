# Verification

## 1. The bench reads listings by name [critical]

- [x] 1.1 @regression (agent) `resolveChange` over five archive dirs created out of date order -> fails before the fix (an older change), passes after (the latest date) -> against the unfixed source on macOS (APFS): `(fail) resolveChange > picks the latest date prefix whatever order the archive lists them in`; with the fix: pass. On the Linux CI runner of PR #110, the existing `falls back to the last date-prefixed archive dir` row failed the same way (`2026-01-01-add-widget` picked over `2026-02-02-fix-bug`)
- [x] 1.2 @regression (agent) `collectArtifactText` over spec dirs created out of order, compared with `judgeInputFromArtifactFiles` on the same files -> fails before the fix, the two texts identical after -> against the unfixed source: `(fail) collectArtifactText > orders specs exactly as judgeInputFromArtifactFiles does`; with the fix: pass (mechanical + judge files: 73 pass, 0 fail)
- [x] 1.3 @integration (agent) `mise run test:bench` and `mise run check` -> pass -> `mise run check` exit 0: bench 345 pass (343 + the 2 new rows), unit 3138, integration 404, contract 3235 pass, 0 fail; `lock:check`, release 14
