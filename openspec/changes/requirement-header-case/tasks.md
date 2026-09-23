## 1. Regression coverage

- [x] 1.1 Add unit coverage in `apps/cli/test/unit/` asserting that
      `parseDeltaSpec` reads `### requirement:` and `### REQUIREMENT:` headers
      under ADDED, MODIFIED and REMOVED — failing before the fix, passing after
- [x] 1.2 Add the mixed-section regression: a canonical `### Requirement: Alpha`
      followed by `### requirement: Beta` in one MODIFIED section parses as two
      ops, not one op carrying the other's scenarios
- [x] 1.3 Add a contract test pinning the real binary's answers from the
      proposal probe table — header case-insensitive; REMOVED bullet, `FROM:`/
      `TO:` keywords and their `Requirement:` keyword case-sensitive

## 2. Fix

- [x] 2.1 Make `REQUIREMENT_RE` in `apps/cli/src/core/deltas.ts`
      case-insensitive
- [x] 2.2 Record in its comment which upstream regexes it mirrors
      (`requirement-blocks.ts` `REQUIREMENT_HEADER_REGEX`, `spec-structure.ts`
      `REQUIREMENT_HEADER`) and that the REMOVED bullet and rename regexes stay
      case-sensitive because upstream's are
- [x] 2.3 Confirm no other cospec regex needs the change: `SCENARIO_RE` is
      already `/^####\s+/` and section titles are already lowercased

## 3. Docs and gates

- [x] 3.1 Update `apps/docs` on the page that owns the delta header format, and
      `docs/validation.md` if it states the header shape
- [x] 3.2 `mise run check` green
