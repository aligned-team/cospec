# Tasks

## 1. Rename the stamp

- [x] 1.1 Add the `SCHEMA_VERSION_KEY`/`LEGACY_SCHEMA_VERSION_KEY` constants,
      `rawSchemaVersionStamp` and the `legacyStamp` flag in
      `core/change-metadata.ts` and `core/change.ts`, and read the stamp through
      them in `validate`; verify with the stamp unit test
- [x] 1.2 Write `x-cospec-schema-version` in `cospec new` and `cospec migrate`
      (rewriting a legacy key in place), and name both keys in
      `meta/openspec-yaml`; verify with the schema-versioning integration test
- [x] 1.3 List legacy-stamped changes in `cospec doctor`; verify with the
      integration test that doctor names the change and stops once
      `cospec migrate` has run
- [x] 1.4 Move the contract, integration and unit fixtures that write the stamp
      to the new key, keeping the legacy-key cases that exercise the fallback;
      verify the unit, contract and integration suites are green

## 2. Specs and docs

- [x] 2.1 Write the `schema-versioning`, `schema-customization` and
      `upstream-command-spellings` deltas and run
      `cospec sync-specs change-stamp-x-prefix`; verify the living specs match
      the deltas
- [x] 2.2 Update the docs pages that own the stamp, `docs/architecture.md`,
      `docs/schemas.md`, README and `.agents/shared.md` (then
      `mise run agents:sync`); verify `mise run docs:build` and
      `mise run agents:check` pass
- [x] 2.3 Run `cospec migrate change-stamp-x-prefix` so this change carries the
      new stamp; verify `cospec doctor` does not list it. The archive commit
      follows this one
