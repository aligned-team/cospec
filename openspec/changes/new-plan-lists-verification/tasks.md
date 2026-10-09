# Tasks

## 1. Tests first

- [ ] 1.1 Add a unit test over all eleven types asserting every `apply_requires`
      id appears in the type's `summary`, and that
      `getTypeInfo(type).requiredArtifacts` equals `apply_requires`; verify it
      fails on the four stale types before the fix.
- [ ] 1.2 Update the pinned strings in `schema-compose.test.ts` and
      `harness/fixtures.ts` and add a `cospec new` integration assertion that
      feat/fix/perf/refactor output and `--json` `artifacts.summary` mention
      `verification` while chore/docs/style/test output is unchanged; verify
      they fail before the fix.

## 2. Fix

- [ ] 2.1 Edit `summary` and `schemaDescription` in `feat.yaml`, `fix.yaml`,
      `perf.yaml`, `refactor.yaml` to list `verification` before `tasks`, and
      verify the new tests pass.
- [ ] 2.2 Run `mise run generate`, refresh schema goldens, the render snapshot
      and harness golden files, and verify `mise run generate:check` is clean.

## 3. Docs

- [ ] 3.1 State on `apps/docs/concepts/types-and-artifacts.md` that the
      `cospec new` plan line and the skills' type table name every required
      artifact, and verify `mise run docs:build` passes.

## 4. Close

- [ ] 4.1 Run `mise run check` and
      `cospec validate new-plan-lists-verification --strict`, and verify both
      pass.
- [ ] 4.2 The archive commit follows this one.
