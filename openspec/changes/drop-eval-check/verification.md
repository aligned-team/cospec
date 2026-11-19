# Verification

## 1. An agent-behavior proposal needs no @eval row [critical]

- [x] 1.1 @regression (agent) verification unit test: a feat proposal checking `agent-behavior` with a ledger that has no `@eval` row, failing before the fix with `verification/eval-check` -> with the old rule restored the test fails; with it removed it passes and no `verification/` issue is emitted under `--strict` rules (unit tier 1614 pass, 0 fail)
- [x] 1.2 @integration (agent) apply-surfaces test: `cospec apply` on a feat change that checks `agent-behavior` with no `@eval` row -> exit 0 and no soft blockers; fails against the old rule (exit 3), passes now (integration tier 318 pass, 0 fail)
- [x] 1.3 @integration (agent) `cospec validate drop-eval-check --strict` on this change, which checks `agent-behavior` and has no `@eval` row -> before the fix: 1 error `verification/eval-check`; after: 0 errors, 0 warnings

## 2. A perf change needs only an @equivalence row [critical]

- [x] 2.1 @regression (agent) verification unit test: a perf ledger holding only an `@equivalence` row, failing before the fix with `verification/equivalence` -> with the old rule restored the test fails; now no `verification/equivalence` issue under `--strict` rules
- [x] 2.2 @unit (agent) a perf ledger with only a `@benchmark` row -> still emits `verification/equivalence`; a ledger with both rows still passes; message now reads "a perf change needs an @equivalence row (observable behavior unchanged)"
- [x] 2.3 @unit (agent) regenerated `openspec/schemas/perf/schema.yaml` verification instruction and its golden (`schema-compose.test.ts` byte-for-byte) -> says "Prove it with at least one `@equivalence` row" and "a `@benchmark` row is allowed but never required"; no longer demands `@benchmark`

## 3. The other surface rules and the layers are intact

- [x] 3.1 @unit (agent) verification rule tests for `interactive`, `integration` and `deploy` -> `verification/interactive-required`, `verification/integration-check` and `verification/deploy-real-layer` still fire (unit tier 0 fail)
- [x] 3.2 @unit (agent) a ledger that carries an `@eval` row and a `@benchmark` row -> parses with no `verification/layer-unknown`
- [x] 3.3 @e2e (agent) `mise run generate:check`, `mise run agents:check`, `mise run docs:build` and `mise run cospec -- validate --all --strict` -> all exit 0; validate-all reports 0 errors, 0 warnings; contract tier 2799 pass, 0 fail
