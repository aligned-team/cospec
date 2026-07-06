## 1. Canon artifact meta and per-type facts

- [x] 1.1 Add `apps/cli/src/canon/artifacts/verification/meta.yaml` (id,
      generates `verification.md` at change root, description,
      `requires: [proposal]`)
- [x] 1.2 Add per-type `surfaces: bool` and `verification: R|O|F` keys plus
      `verificationInstruction`/`designInstruction` overrides across the eleven
      `canon/types/*.yaml`
- [x] 1.3 Add the `## Surfaces` block (closed four-token vocabulary) to the
      proposal templates for every type except `chore`/`docs`/`style`/`test`
- [x] 1.4 Verify the canon loads and enumerates verification for
      feat/fix/perf/refactor with a canon-load unit test

## 2. Schema-compose extension

- [x] 2.1 Add `verification` to `ARTIFACT_ORDER` (before `tasks`) and to
      `TypeCanon.artifacts`; extend `CanonBundle`/`loadCanon` to read the new
      meta
- [x] 2.2 Add the `composeSchema` push block for verification, extend
      `composeTemplates` and `loadTypeTable` declared/forbidden derivation, and
      bump `version: 1 → 2`
- [x] 2.3 Extend the `schema-compose.test.ts` `MATRIX` fixture with the
      verification column and assert composed output for all eleven types

## 3. Twin matrix mirror and parity test

- [x] 3.1 Wire `verification` → `verification.md` into `type-facts.ts`
      (`ARTIFACT_IDS`/`ARTIFACT_FILES`/`ARTIFACT_GENERATES`) and update all
      eleven `TYPE_ARTIFACTS` `declared`/`applyRequires` to mirror canon
- [x] 3.2 Add the `introducedAt` table and
      `enforcedApplyRequires(type, schemaVersion)` monotonic filter
- [x] 3.3 Add `apps/cli/test/unit/schemas/matrix-parity.test.ts` asserting
      byte-equality between composed `declared`+`apply.requires` and
      `TYPE_ARTIFACTS` across all 11×6 cells (static v2 matrix)
- [x] 3.4 Add a monotonicity test asserting `enforcedApplyRequires` drops
      verification for a v1 change and keeps it for v2, and that `introducedAt`
      values only increase

## 4. Verification parser and rule family

- [x] 4.1 Add `apps/cli/src/core/verification.ts` parser (groups, rows, state,
      layer, owner, probe, result, `[critical]`, `defer:`)
- [x] 4.2 Add `apps/cli/src/core/rules/verification.ts` with
      `missing`/`structure`/`row-grammar`/`layer-unknown`/`owner-unknown`/`evidence-required`/`deferred-reason`
      and the per-type required-row rules
      (`critical-real-layer`/`reproduces-bug`/`equivalence`/`invariant`/`deploy-real-layer`)
      plus surface-driven
      `interactive-required`/`eval-check`/`integration-check`
- [x] 4.3 Wire `verificationRules()` into `runChangeRules()` gated on
      `schema.declared.has('verification')`; add `verificationText?` to
      `LoadedChange` and pick verification up in `deriveSchemaInfo`
      forbidden-set and `meta.ts` glob helpers
- [x] 4.4 Add `apps/cli/test/unit/parsers/verification.test.ts` and
      `rules/verification.test.ts` covering grammar, closed vocabulary, owner
      defaulting, evidence/deferral, and each per-type required-row rule

## 5. Proposal Surfaces parser and rule

- [x] 5.1 Add `## Surfaces` parse to `proposal.ts` and the
      `proposal/surfaces-vocab` closed-vocabulary rule
- [x] 5.2 Add unit tests for valid flags, unknown-token rejection, and
      light-type omission of the block

## 6. Design flag-keyed section rules

- [x] 6.1 Add the `design/operational-surface`, `design/integration-contract`,
      and `design/seam-ownership` soft rules firing only on the matching surface
      flag (seam-ownership always for refactor)
- [x] 6.2 Add unit tests for each section rule under flag-set and flag-absent
      conditions

## 7. Apply gate wiring

- [x] 7.1 Apply the `enforcedApplyRequires` filter in the required-artifact
      presence step of `apply.ts` (presence = file exists and fast-validates)
- [x] 7.2 Add the surface soft-blocker step computing `meta/surface-unmet`
      consequences and folding them into `gate.soft` (exit 3 unless
      `--allow-soft`)
- [x] 7.3 Add integration tests asserting verification presence blocks with exit
      2, surfaces soft-block with exit 3, and `--allow-soft` clears them

## 8. Archive gates and contract tests

- [x] 8.1 Add the `archive/verification-incomplete` explicit step (after the
      tasks gate, independent of specs) returning exit 1 on any bare `[ ]` row
- [x] 8.2 Add the `archive/scenario-preservation` explicit step (before
      `openspec archive`, specs-bearing only) returning exit 1 on unmatched
      scenario drops, plus the advisory mirror rule in the archive-precondition
      family
- [x] 8.3 Add a contract test against the pinned openspec 1.3.1 binary proving
      cospec refuses a scenario-thinning delta before delegation even though
      openspec returns exit 0
- [x] 8.4 Add integration tests for verification-incomplete (including a
      specs-less fix) and scenario-preservation happy/refusal paths

## 9. Schema versioning, migrate, doctor, status

- [x] 9.1 Extend `OpenspecYaml` and the `change.ts` loader to read
      `schemaVersion`; add the positive-integer check to `meta/openspec-yaml`;
      add `meta/schema-outdated` INFO
- [x] 9.2 Stamp `schemaVersion: 2` in `new.ts`; add `migrate.ts` (scaffold
      deferred `verification.md`, bump stamp); extend `doctor.ts` to list v1
      changes
- [x] 9.3 Add the read-only `verification` block to `status.ts` `--json`
- [x] 9.4 Add tests: `new` stamping, grandfathering (v1 not blocked), `migrate`
      scaffold, `doctor` listing, and a `status --json` verdict-shape contract
      test

## 10. Instructions, new, and status command wiring

- [x] 10.1 Add `verification` to the `instructions.ts` `ARTIFACTS` array and
      confirm `cospec instructions verification --change <slug>` renders the
      type template and instruction
- [x] 10.2 Add an integration test exercising `cospec instructions verification`
      for feat/fix/perf/refactor

## 11. Generate, goldens, harness, snapshots

- [x] 11.1 Run `mise run generate` and diff-copy the regenerated
      `openspec/schemas/**` (verification block, `## Surfaces`,
      `designInstruction` deltas, `version: 2`)
- [x] 11.2 Update golden `schema.yaml` files for feat/fix/perf/refactor and any
      affected harness prose (`propose.md`/`continue.md` naming verification as
      machine-parsed)
- [x] 11.3 Run `mise run generate:check` and confirm the drift gate is clean

## 12. Docs

- [x] 12.1 Update `docs/schemas.md` (remove verification from "Not shipped," add
      it to the tables and requires graph)
- [x] 12.2 Update `docs/validation.md` (new `verification/*`,
      `proposal/surfaces-vocab`, `design/*`, `meta/surface-unmet`,
      `meta/schema-outdated` rule tables) and `docs/architecture.md` (archive
      gate steps, static-matrix invariant)

## 13. Eval DECLARED derivation

- [x] 13.1 Derive `DECLARED` in `e2e/eval/scenarios/*.ts` from `type-facts` so
      `verification.md` is never mis-scored as an unexpected or forbidden file
- [ ] 13.2 Run `mise run eval:e2e` (advisory) and confirm verification files
      score correctly

## 14. Full gate

- [x] 14.1 Run `mise run check` and confirm lint, format, typecheck, all test
      suites, generate drift, and agent-doc drift pass
- [x] 14.2 Fill in this change's own `verification.md` with observed evidence
      and run `cospec validate expand-artifact-matrix --strict` clean before
      archiving
