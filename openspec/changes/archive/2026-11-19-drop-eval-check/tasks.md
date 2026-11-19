# Tasks

## 1. Remove the rules

- [x] 1.1 Delete the `verification/eval-check` rule from
      `core/rules/verification.ts` and its entry in `SURFACE_SOFT_RULES` in
      `commands/apply.ts`, and verify `mise run typecheck` passes and no source
      reference to the rule ID remains
- [x] 1.2 Narrow the perf rule in `core/rules/verification.ts` to require only
      an `@equivalence` row, with the message "a perf change needs an
      @equivalence row (observable behavior unchanged)", and verify the unit
      tests below pass
- [x] 1.3 Rewrite the perf `verificationInstruction` in `canon/types/perf.yaml`
      and the `## Surfaces` comment in `canon/artifacts/proposal/meta.yaml`, run
      `mise run generate`, and verify `mise run generate:check` passes

## 2. Tests

- [x] 2.1 Replace the eval-check unit test with a regression test that an
      `agent-behavior` proposal with no `@eval` row yields no issue, and verify
      it fails against the old rule
- [x] 2.2 Add an apply-surfaces integration test that `agent-behavior` with no
      `@eval` row does not soft-block apply (exit 0), and verify it passes
- [x] 2.3 Rewrite the perf unit tests (`@equivalence` alone passes, `@benchmark`
      alone still fires) and the perf layer hint in
      `instructions-verification.test.ts`, and verify they pass

## 3. Docs

- [x] 3.1 Remove the eval rule from the `verification/` table in
      `apps/docs/reference/validation-rules.md`, narrow the perf row there and
      on `apps/docs/concepts/verification.md` and
      `apps/docs/concepts/types-and-artifacts.md`, state that `agent-behavior`
      is a record only, and verify `mise run docs:build` passes. The archive
      commit follows this one
