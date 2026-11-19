# Spec Delta

## MODIFIED Requirements

### Requirement: Composed schema version and per-change stamping

The composer SHALL stamp `version: 2` into every regenerated `schema.yaml`, and
`cospec new` SHALL stamp `x-cospec-schema-version: 2` into the new change's
`.openspec.yaml`. The `meta/openspec-yaml` rule SHALL accept the stamp, under
`x-cospec-schema-version` or the legacy `schemaVersion`, only as a positive
integer when present; an absent stamp SHALL be treated as version `1`.

#### Scenario: New change is stamped v2

- **WHEN** `cospec new feat some-slug` runs
- **THEN** the created `.openspec.yaml` contains `x-cospec-schema-version: 2`
  and no `schemaVersion` key

#### Scenario: Absent schemaVersion is treated as v1

- **WHEN** a change's `.openspec.yaml` has neither `x-cospec-schema-version` nor
  `schemaVersion`
- **THEN** cospec treats the change as `schemaVersion` 1

#### Scenario: Non-integer schemaVersion is rejected

- **WHEN** a `.openspec.yaml` sets `x-cospec-schema-version: two` (or
  `schemaVersion: two`)
- **THEN** cospec emits `meta/openspec-yaml`

### Requirement: The migrate command

cospec SHALL provide a `cospec migrate <slug>` command that scaffolds a
`verification.md` from the change's type template with every row set to `[~]`
and `defer: pre-v2 change, verified out-of-band`, and bumps the change's stamped
`x-cospec-schema-version` to 2. A change already at version 2 that still carries
the legacy `schemaVersion` key SHALL have only that key rewritten as
`x-cospec-schema-version`. The command SHALL be opt-in and SHALL never run
automatically.

#### Scenario: Migrate scaffolds a deferred ledger

- **WHEN** `cospec migrate some-slug` runs on a v1 `feat` change
- **THEN** a `verification.md` is created with all rows deferred with the pre-v2
  reason, and the change's `x-cospec-schema-version` becomes 2

#### Scenario: Migrate is never automatic

- **WHEN** any other cospec command runs on a v1 change
- **THEN** that command does not rewrite the change's stamp or scaffold
  `verification.md`

## ADDED Requirements

### Requirement: The change stamp is an x- extension key

`cospec new` and `cospec migrate` SHALL stamp a change's schema version as
`x-cospec-schema-version` in `.openspec.yaml`, the namespace OpenSpec 1.14+
reserves for tool metadata, so bare `openspec validate --strict` passes on
cospec changes. cospec SHALL read the legacy `schemaVersion` key as an equal
fallback, `cospec migrate` SHALL rewrite it, and `cospec doctor` SHALL list
changes still carrying it.

#### Scenario: New change reports no unknown key upstream

- **WHEN** `cospec new feat demo` runs and the pinned
  `openspec validate demo --strict` checks it
- **THEN** `.openspec.yaml` carries `x-cospec-schema-version` and upstream
  reports no unknown key

#### Scenario: Legacy stamp still honoured

- **WHEN** a change carries only `schemaVersion: 2`
- **THEN** cospec treats it as version 2, `cospec doctor` names it, and
  `cospec migrate <slug>` rewrites it to `x-cospec-schema-version: 2`
