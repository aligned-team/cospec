## 1. WU-1 — widen the delta bullet regexes

- [x] 1.1 Widen `REMOVED_BULLET_RE`, `RENAMED_FROM_RE` and `RENAMED_TO_RE` in
      `apps/cli/src/core/deltas.ts` to `^\s*[-*+]?\s*` per OpenSpec's
      `requirement-blocks.ts`, and verify via verification 1.1 that
      `*`/`+`/indented forms now record their operations while a fenced bullet
      still records none
- [x] 1.2 Add the bullet fixture family to
      `apps/cli/test/unit/parsers/deltas.test.ts` and verify via verification
      1.1 that each case is asserted at the parser layer
- [x] 1.3 Add the gate regression to `apps/cli/test/unit/rules/archive.test.ts`
      and verify via verification 1.2 and 1.3 that a `*`-bulleted REMOVED naming
      a near-miss of a living requirement trips `archive/target-missing` and is
      refused before delegation
- [x] 1.4 Add `apps/cli/test/contract/delta-bullet-markers.test.ts`, spawning
      the real pinned binary on `*`/`+` and indented-`-` REMOVED and RENAMED
      deltas, and verify via verification 1.4 that the pin's refusal of `*`/`+`
      is pinned as fact rather than assumed, and that cospec relays it instead
      of archiving

## 2. WU-2 — pair renames per section and report the strays

- [x] 2.1 Replace the `openReq`-overwriting `FROM:`/`TO:` handling with
      per-section pairing that pushes a `RENAMED` op only when both sides are
      present, and verify via verification 2.1 and 2.2 that no half-built op is
      produced and interleaved lines do not cross-pair
- [x] 2.2 Stop `closeReq()` pushing a half-built RENAMED and retain each stray
      as `{ side, name, line }` on `ParsedDelta`, and verify via verification
      2.3 that `emptySections` is no longer suppressed by the phantom
- [x] 2.3 Add the `deltas/unpaired-rename` ERROR rule to
      `apps/cli/src/core/rules/deltas.ts` with a message naming the missing side
      and the one-FROM-then-its-TO remedy, and verify via verification 2.1 that
      `cospec validate --strict` reports it
- [x] 2.4 Add the rename fixtures (lone trailing `FROM:`, `FROM/FROM/TO`,
      `FROM:` then a new `## ` section) to the parser and rule suites, and
      verify via verification 2.4 that cross-section pairing is asserted

## 3. WU-3 — strip a closing ATX run from requirement names

- [x] 3.1 Change `normalize()` to `name.replace(/[ \t]+#+[ \t]*$/, '').trim()`,
      and verify via verification 3.2 that `C#` keeps its `#` because the class
      is `[ \t]` and not `\s`
- [x] 3.2 Confirm `foldRequirementName` inherits the strip rather than
      re-implementing it, and verify via verification 3.3 that the folded form
      of `Foo ###` equals the folded form of `Foo`
- [x] 3.3 Add delta-side and living-side `### Requirement: Foo ###` fixtures,
      and verify via verification 3.1 that the delta resolves to the living
      `Foo` with no `archive/target-missing`

## 4. WU-4 — count only scenarios that have a body

- [x] 4.1 Add a `hasScenarioBody` predicate (a `#### ` header counts only when
      at least one non-blank line follows before the next `#{1,4} ` header or
      end of input), and verify via verification 4.4 that a bodyless header
      increments `scenarioCount` on neither side — delivered as written for the
      count arm, and deliberately NOT for `scenarioNames`: gating the name arm
      too would make cospec quieter than the binary it wraps, which verification
      4.3 refutes against the real pinned 1.11.0 binary
- [x] 4.2 Gate the delta-side counter and the living-side
      `requirementScenarioCounts` on that predicate — both, never one — and
      verify via verification 4.2 and 4.3 that the hollowed-out delta is refused
      and the bodyless living header no longer causes a phantom loss
- [x] 4.3 Append the missing-body hint to the `deltas/requirement-shape`
      scenario-count message, and verify via verification 4.1 that the ERROR
      carries it
- [x] 4.4 Add the bodyless-scenario fixtures on both sides to the parser and
      archive-rule suites, and verify via verification 4.2 and 4.3 that each
      direction has its own assertion

## 5. WU-5 — report orphaned requirement blocks

- [x] 5.1 Collect `### Requirement:` blocks that sit outside all four delta
      sections on `ParsedDelta` instead of discarding them at the
      `currentOp === undefined` guard, and verify via verification 5.1 that both
      the pre-first-section and `## Notes` cases are captured
- [x] 5.2 Add the `deltas/orphaned-requirement` WARNING rule with OpenSpec's
      message shape, and verify via verification 5.1 and 5.2 that it reports at
      WARNING level and leaves the non-strict exit code unchanged

## 6. Suite, pin-independence and docs

- [x] 6.1 Add the repeated- and mixed-case `## MODIFIED Requirements` regression
      to the parser suite, and verify via verification 6.3 that every section's
      requirements accumulate
- [x] 6.2 Run `mise run test` and `mise run test:contract`, and verify via
      verification 6.1 and 6.2 that the unit suite is green and the contract
      suite is unchanged against the pinned 1.11.0 binary
- [x] 6.3 Update `docs/validation.md` and
      `apps/docs/reference/validation-rules.md` with the two new rule ids and
      the widened bullet forms, each fact on the page that owns it — the site
      owns the registry rows, `docs/validation.md` owns parser tolerance and
      both pin caveats (`*`/`+` and a closing ATX run are 1.13.1 shapes the
      pinned binary still refuses) — and verify via verification 6.4 that
      neither page duplicates the other's fact
- [x] 6.4 Run `mise run check`, and verify via verification 6.5 that it is green
      end to end
