## Why

Two of cospec's archive gates disagree with the wrapped OpenSpec binary, and
each disagreement was verified against the real pinned 1.11.0 binary on
2026-09-09. `archive/added-exists` refuses an `## ADDED` block whose text is
byte-identical to the requirement already living in the spec, a shape OpenSpec
treats as an early-sync no-op and archives at exit 0 — so cospec is the only
thing blocking an archive the binary performs cleanly. The same name-membership
blind spot refuses a `## REMOVED` target that is already absent and a
`## RENAMED` whose source is gone because the rename has already been applied;
both also archive at exit 0 upstream.

The second defect runs the other way. `archive/scenario-preservation` compares
scenario _counts_ only, so a `## MODIFIED` requirement that swaps one scenario's
name for another at the same count passes cospec's own hard gate entirely. On
OpenSpec 1.8.0 and later the wrapped binary's own check catches it during
delegated validation, but on 1.0.0–1.7.x — inside cospec's accepted
`>=1.0.0 <2.0.0` range — nothing does, and the scenario is silently deleted from
the living spec. A gate that exists to be the defence below the upstream check
cannot have a hole the upstream check would cover.

A third defect surfaced while verifying the second: `SCENARIO_DROP_HINT` advises
authors to "REMOVE the requirement and ADD it back in the same delta", and
OpenSpec 1.11.0 refuses exactly that with
`Requirement present in both ADDED and REMOVED`. The hint attached to the gate
being changed sends authors into a wall.

## What Changes

- `archive/added-exists` becomes body-aware on its ADDED arm: a name collision
  is an ERROR only when the block's normalised raw text differs from the living
  requirement's. Normalisation is a verbatim port of OpenSpec's
  `normalizeBlockRaw` — CRLF folding plus one outer trim, nothing more — so
  cospec can never be looser than the binary.
- `archive/target-missing` gains the two remaining early-sync no-ops: a REMOVED
  target that is already absent, and a RENAMED whose source is absent while its
  target is present (which also suppresses the RENAMED-TO collision that the
  same shape triggers today). Each exemption is withheld when a case- or
  interior-whitespace variant of the named requirement still exists — a mistyped
  header, which OpenSpec aborts on and cospec keeps refusing.
- `archive/scenario-preservation` gains scenario-name identity, keeping the
  existing count arm. A MODIFIED block is refused when it omits any scenario
  name the living requirement still has, counted with multiplicity, compared
  case-sensitively to match OpenSpec's `scenarioNameAt`.
- The delta and living-spec parsers retain each requirement's verbatim raw block
  and its ordered scenario names. A living requirement's scope now ends at the
  next level-2 `##` section header, fixing a pre-existing over-count in which
  scenarios under a trailing section were credited to the last requirement.
- `SCENARIO_DROP_HINT` is corrected to the two remedies that actually work.
- The RENAMED-TO arm keeps its unconditional refusal when both source and target
  are present, and a MODIFIED whose target is absent stays an ERROR: OpenSpec
  has no early-sync path for either, so relaxing them would manufacture a false
  archive PASS.

## Capabilities

### Modified Capabilities

- `archive-integrity`: the scenario-preservation gate's stated check was wrong
  (count-only, and asserting a retired `Scenario removed:` escape hatch), and
  the early-sync behaviour of the archive-precondition family was unstated.
- `spec-parsing-and-discovery`: the parsers' retention contract — verbatim
  requirement blocks, scenario-name extraction, and the level-2 section boundary
  — was unstated.

## Impact

- `apps/cli/src/core/deltas.ts` — `DeltaOp` gains `raw` and `scenarioNames`;
  `LivingSpec` gains `requirementBlocks` and `requirementScenarioNames`; new
  exported ports `normalizeBlockRaw`, `scenarioNameFromHeader`,
  `foldRequirementName`; `ScenarioDrop` gains `missingNames`; corrected
  `SCENARIO_DROP_HINT`.
- `apps/cli/src/core/rules/archive.ts` — `archive/added-exists` and
  `archive/target-missing` arms; the scenario-preservation mirror rule message.
- `apps/cli/src/commands/archive.ts` — the hard gate's stderr line appends the
  missing scenario names to its existing prefix.
- `apps/cli/src/commands/validate.ts` — the delegated-duplicate `nativeKey`
  regex widens to match the new message shape and the old one.
- Tests: `test/unit/parsers/deltas.test.ts`, `test/unit/rules/archive.test.ts`,
  `test/unit/rules/delegated-dedupe.test.ts`,
  `test/integration/archive-gates.test.ts`, and the contract suite
  (`test/contract/fixtures.ts`, `archive-parity.test.ts`,
  `scenario-preservation.test.ts`) against the real pinned 1.11.0 binary.
- Docs: `apps/docs/reference/validation-rules.md`,
  `apps/docs/concepts/apply-and-archive.md`, `docs/architecture.md`.
- No rule id, command, flag, schema, or exit code changes. No new dependency.

## Surfaces

- [x] interactive — the CLI's validate and archive output changes: two shapes
      stop being refused, one starts being refused, and one hint's text changes.
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — the change is defined entirely by agreement with the wrapped
      `@fission-ai/openspec` binary across its accepted `>=1.0.0 <2.0.0` range.
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
