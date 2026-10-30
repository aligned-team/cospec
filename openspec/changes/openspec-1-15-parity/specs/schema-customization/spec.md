# Spec Delta

## MODIFIED Requirements

### Requirement: `cospec new` accepts resolvable legacy schemas

When `<name>` is not one of the 11 cospec types, `cospec new <name> <slug>`
SHALL check `resolveSchema(base, <name>).kind`. On `'legacy'` it SHALL delegate
to `openspec new change <slug> --schema <name>`, verify the written
`.openspec.yaml` schema pointer, stamp no cospec `schemaVersion`, print no typed
artifact plan, and note that the change carries reduced cospec guarantees
(structural and openspec-delegated checks only). Any other name SHALL still get
today's unknown-type error.

#### Scenario: New change on a legacy schema

- **WHEN** `cospec new my-custom some-slug` runs and `my-custom` resolves as
  `kind: 'legacy'`
- **THEN** `openspec/changes/some-slug/.openspec.yaml` has `schema: my-custom`,
  has no `schemaVersion` field, and cospec prints a reduced-guarantees note
  instead of the typed artifact plan

#### Scenario: New change on an unresolvable name still errors

- **WHEN** `cospec new totally-unknown some-slug` runs and `totally-unknown`
  resolves as `kind: 'unknown'`
- **THEN** cospec exits 1 with the existing unknown-type error and does not
  create a change
