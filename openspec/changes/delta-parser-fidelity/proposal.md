## Why

`apps/cli/src/core/deltas.ts` is cospec's single delta/living-spec parser, and
every archive precondition reads from it — `archive/target-missing`,
`archive/added-exists` and the `archive/scenario-preservation` hard gate all
consume its `ops`, `scenarioCount` and `requirementScenarioCounts`. Four
recognition and counting defects ported from OpenSpec's pre-1.13.1 parser are
live at the current 1.11.0 pin, and each one makes cospec disagree with the
wrapped binary: a `*`- or `+`-bulleted REMOVED/FROM/TO line never enters `ops`
at all, a dangling `FROM:` pushes a phantom half-built `RENAMED` op that
suppresses `emptySections` and is skipped by the collision arms, a requirement
name written with a closing ATX run (`### Requirement: Foo ###`) reads as
`Foo ###`, and a bare `#### Scenario:` header with no body is counted as a real
scenario on **both** the delta and the living side.

Three of those produce a **false archive PASS**, which `CLAUDE.md` names a
release blocker; the bodyless-scenario defect produces a false PASS on the delta
side and a false _refusal_ on the living side, so it must be fixed on both
counters or it merely trades one failure for the other. A fifth defect is a
silent drop with no direction: a `### Requirement:` block sitting outside all
four delta sections hits `if (currentOp === undefined) continue` and vanishes
with no diagnostic. cospec is already ahead of upstream on the structural half
of this problem — `parseDeltaSpec` has exactly one implementation and every
consumer (`commands/validate.ts`, `commands/archive.ts`,
`core/rules/archive.ts`, `core/rules/deltas.ts`) reads it, so cospec never
developed OpenSpec's `show`-versus-`archive` divergence. The defects are in the
grammar, not the architecture, and they are worth fixing at the current pin
rather than inheriting a fix later.

## What Changes

- **Delta bullet markers.** `REMOVED_BULLET_RE`, `RENAMED_FROM_RE` and
  `RENAMED_TO_RE` accept the full CommonMark bullet set (`-`, `*`, `+`) and
  leading indentation, matching OpenSpec's `requirement-blocks.ts`. A bullet
  inside a code fence still parses as nothing.
- **Unpaired rename lines.** `RENAMED` ops are paired per section and pushed
  only when both `FROM:` and `TO:` are present. Every dangling line is retained
  and reported by a new ERROR rule `deltas/unpaired-rename`. `closeReq()` no
  longer pushes a half-built op, so `emptySections` stops being suppressed by a
  phantom and the RENAMED-TO collision arm stops silently skipping it.
- **Trailing ATX runs in requirement names.** `normalize()` strips a closing `#`
  run preceded by a space or tab, matching OpenSpec exactly. `[ \t]` rather than
  `\s`, so `### Requirement: C#` keeps its `#`.
- **Bodyless scenario headers.** A `#### ` header counts as a scenario only when
  at least one non-blank line follows it before the next header or end of input.
  The rule is applied to the delta-side counter and the living-side counter
  alike, so `archive/scenario-preservation` neither passes a delta that hollows
  a scenario out to a bare header nor refuses a merge the binary accepts over a
  bodyless header in the living spec. `deltas/requirement-shape` gains a hint
  naming the cause.
- **Orphaned requirement blocks.** A `### Requirement:` block outside all four
  delta sections is reported as a new WARNING rule `deltas/orphaned-requirement`
  instead of being discarded silently. WARNING, not ERROR: pre-format archived
  changes carry this shape.

No flag, subcommand, exit code or JSON shape moves. This change is
pin-independent — it is a defect at 1.11.0 and the fixes anticipate the
semantics OpenSpec shipped in 1.13.1.

## Capabilities

### Modified Capabilities

- `spec-parsing-and-discovery`: the delta parser's recognised bullet forms,
  requirement-name normalisation, rename pairing, bodyless-scenario counting and
  orphaned-block reporting.
- `archive-integrity`: the `archive/scenario-preservation` gate counts only
  scenarios with a body, on both the delta and the living side.

## Impact

- `apps/cli/src/core/deltas.ts` — bullet regexes, `normalize()`, rename pairing,
  a `hasScenarioBody` predicate gating both scenario counters, and
  orphaned-block collection on `ParsedDelta`.
- `apps/cli/src/core/rules/deltas.ts` — new `deltas/unpaired-rename` (ERROR) and
  `deltas/orphaned-requirement` (WARNING) rules; a hint appended to
  `deltas/requirement-shape`.
- `apps/cli/test/unit/parsers/deltas.test.ts`,
  `apps/cli/test/unit/rules/deltas.test.ts`,
  `apps/cli/test/unit/rules/archive.test.ts` — fixture families per work unit.
- `docs/validation.md`, `apps/docs/reference/validation-rules.md` — the two new
  rule ids and the widened delta bullet forms.
- No dependency, lockfile or pin movement.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
