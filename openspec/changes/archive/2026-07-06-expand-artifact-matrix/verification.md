## 1. Matrix parity holds across all types [critical]

- [x] 1.1 @unit matrix-parity.test.ts -> 46 pass, byte-equal to TYPE_ARTIFACTS (incl. hasSurfaces vs canon surfaces)
- [x] 1.2 @unit type-facts.test.ts (enforcedApplyRequires — the monotonic version filter) -> v1 drops verification, v2 keeps it, introducedAt monotonic

## 2. Verification rule family enforces grammar and per-type facts [critical]

- [x] 2.1 @unit parser+rules suites -> 50 pass, grammar/vocab/per-type rules ok, incl. CRLF + prose-wrap continuation rejection
- [x] 2.2 @integration instructions-verification.test.ts -> 5 pass, per-type layer hints render (e2e/regression/benchmark/equivalence)

## 3. Apply gate exit codes for presence and surface soft-blockers [critical]

- [x] 3.1 @integration apply-surfaces.test.ts, no verification.md -> exit 2
- [x] 3.2 @integration same suite, satisfying row added -> exit 0
- [x] 3.3 @integration deploy flag checked, no verification.md -> exit 3
- [x] 3.4 @integration same case with --allow-soft -> exit 0
- [x] 3.5 @integration build change, no Surfaces flag checked -> exit 0

## 4. Archive hard gates refuse before delegating to openspec [critical]

- [x] 4.1 @integration archive-gates.test.ts, resolved rows -> exit 0
- [x] 4.2 @integration same suite, unresolved row -> refused pre-delegation
- [x] 4.3 @regression scenario-preservation.test.ts -> 2 pass, real openspec 1.3.1 merges the thinned delta at exit 0, cospec refuses first
- [x] 4.4 @integration Scenario removed note excuses the drop -> exit 0

## 5. This change's own schemaVersion grandfathering

- [x] 5.1 @unit .openspec.yaml has no schemaVersion key -> loader treats as v1
- [x] 5.2 @integration validate --strict -> 0 errors, INFO schema-outdated only
- [~] 5.3 @manual run cospec migrate before archiving -> defer: optional, v1 changes are never hard-blocked by the retrofit per DESIGN

## 6. Full CI gate is green

- [x] 6.1 @unit mise run check -> lint/format/typecheck/generate/agents clean
- [x] 6.2 @unit unit suite -> 470 pass, 0 fail, 35 files
- [x] 6.3 @integration contract suite -> 19 pass, 0 fail, 5 files
- [x] 6.4 @integration integration suite -> 42 pass, 0 fail, 11 files
