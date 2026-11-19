# Proposal

## Why

The project owner ruled that "evals are NOT a requirement for verifying a
change" and that "benchmarking is not verification, we do not have targets tied
to the benchmarks". Two cospec verification rules contradict those rulings.

`verification/eval-check` demands an `@eval` row whenever a proposal's
`## Surfaces` checks `agent-behavior`. The perf rule `verification/equivalence`
demands both a `@benchmark` row and an `@equivalence` row for every `perf`
change. Each fires as an error (a warning under a lax run, an error under
`--strict`, a soft block at `cospec apply` for the surface rule), so authors
must plan or defer rows the owner has ruled out as verification.

## What Changes

- Remove the `verification/eval-check` rule: an `agent-behavior` proposal with
  no `@eval` row no longer produces a warning, a strict-mode error, or an apply
  soft block.
- Keep `agent-behavior` in the closed `## Surfaces` vocabulary as a truthful
  flag. It now records the surface without promoting any verification row or
  design section; the `interactive`, `integration` and `deploy` surface rules
  are unchanged.
- Narrow `verification/equivalence` so a `perf` change needs only an
  `@equivalence` row (observable behavior unchanged). The `@benchmark`
  requirement goes; the rule ID and its error level are unchanged.
- Keep `@eval` and `@benchmark` recognised verification layers: authors may
  still record such a row; nothing requires one. The perf proposal's
  `## Benchmarks` section is proposal content, not verification, and is
  unchanged.
- Rewrite the perf verification instruction (canon, regenerated into the perf
  schema) so it no longer asks for a `@benchmark` row, and reword the generated
  proposal template's `## Surfaces` comment, which claimed every flag drives a
  verification or design expectation.
- Update the validation-rules table, the verification concept page and the types
  page.

## Capabilities

### Modified Capabilities

- `surface-triggers`: the surface soft-trigger mechanic no longer lists
  `verification/eval-check` among the verification surface rules, and an
  `agent-behavior` flag demands no row.
- `verification-artifact`: the per-type required-row facts require only an
  `@equivalence` row for `perf`.

## Impact

- `apps/cli/src/core/rules/verification.ts` and `apps/cli/src/commands/apply.ts`
  (`SURFACE_SOFT_RULES`): the eval rule, its apply soft-block entry, and the
  perf rule's condition and message.
- `apps/cli/src/canon/types/perf.yaml`,
  `apps/cli/src/canon/artifacts/proposal/meta.yaml` and the generated
  `openspec/schemas/*` files.
- `apps/cli/test/unit/rules/verification.test.ts`,
  `apps/cli/test/integration/apply-surfaces.test.ts` and
  `apps/cli/test/integration/instructions-verification.test.ts`.
- `apps/docs/reference/validation-rules.md`,
  `apps/docs/concepts/verification.md` and
  `apps/docs/concepts/types-and-artifacts.md`.
- Living specs `openspec/specs/surface-triggers/spec.md` and
  `openspec/specs/verification-artifact/spec.md`.
- Behavior: an existing change that already carries `@eval` or `@benchmark` rows
  stays valid; a perf change that had only an `@equivalence` row, or a change
  whose only warning was `verification/eval-check`, now validates clean.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — the perf verification instruction and the proposal
      template's `## Surfaces` comment are agent-facing canon
