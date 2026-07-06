## ADDED Requirements

### Requirement: Composed schema version and per-change stamping

The composer SHALL stamp `version: 2` into every regenerated `schema.yaml`, and
`cospec new` SHALL stamp a `schemaVersion: 2` field into the new change's
`.openspec.yaml`. The `meta/openspec-yaml` rule SHALL accept `schemaVersion`
only as a positive integer when present; an absent `schemaVersion` SHALL be
treated as `1`.

#### Scenario: New change is stamped v2

- **WHEN** `cospec new feat some-slug` runs
- **THEN** the created `.openspec.yaml` contains `schemaVersion: 2`

#### Scenario: Absent schemaVersion is treated as v1

- **WHEN** a change's `.openspec.yaml` has no `schemaVersion` field
- **THEN** cospec treats the change as `schemaVersion` 1

#### Scenario: Non-integer schemaVersion is rejected

- **WHEN** a `.openspec.yaml` sets `schemaVersion: two`
- **THEN** cospec emits `meta/openspec-yaml`

### Requirement: Monotonic version-filtered enforcement

cospec SHALL maintain an `introducedAt(artifact, type)` table where
`introducedAt(verification, {feat,fix,perf,refactor}) = 2` and every other entry
is `1`, and SHALL compute `enforcedApplyRequires(type, schemaVersion)` as
`TYPE_ARTIFACTS[type].applyRequires` minus every artifact whose
`introducedAt(artifact, type)` exceeds the change's stamped `schemaVersion`.
This filter SHALL be applied identically at apply and archive, SHALL be a
uniform monotonic version filter rather than content-derived promotion, and its
`introducedAt` values SHALL only ever increase.

#### Scenario: v1 change drops verification from enforcement

- **WHEN** `enforcedApplyRequires('feat', 1)` is computed
- **THEN** the result excludes `verification`

#### Scenario: v2 change keeps verification enforced

- **WHEN** `enforcedApplyRequires('feat', 2)` is computed
- **THEN** the result includes `verification`

#### Scenario: Same filter at apply and archive

- **WHEN** a v1 `feat` change is applied and later archived
- **THEN** neither the apply gate nor the archive gate enforces `verification`
  for it

### Requirement: Grandfathering of pre-v2 changes

An in-flight change stamped (or defaulted to) `schemaVersion` 1 SHALL NOT be
hard-blocked by the verification retrofit: apply and archive SHALL skip the
verification gate for it, and `cospec validate` SHALL emit a non-blocking
`meta/schema-outdated` INFO naming `cospec migrate`.

#### Scenario: v1 change is not blocked by verification

- **WHEN** `cospec apply` runs on a v1 `feat` change with no `verification.md`
- **THEN** the gate does not block on the missing verification artifact

#### Scenario: Validate advises migration

- **WHEN** `cospec validate` runs on a v1 change
- **THEN** it emits `meta/schema-outdated` at INFO level naming `cospec migrate`

### Requirement: The migrate command

cospec SHALL provide a `cospec migrate <slug>` command that scaffolds a
`verification.md` from the change's type template with every row set to `[~]`
and `defer: pre-v2 change, verified out-of-band`, and bumps the change's stamped
`schemaVersion` to 2. The command SHALL be opt-in and SHALL never run
automatically.

#### Scenario: Migrate scaffolds a deferred ledger

- **WHEN** `cospec migrate some-slug` runs on a v1 `feat` change
- **THEN** a `verification.md` is created with all rows deferred with the pre-v2
  reason, and the change's `schemaVersion` becomes 2

#### Scenario: Migrate is never automatic

- **WHEN** any other cospec command runs on a v1 change
- **THEN** that command does not rewrite the change's `schemaVersion` or
  scaffold `verification.md`

### Requirement: Doctor lists pre-v2 changes

The existing `cospec doctor` command SHALL list active changes still on
`schemaVersion` 1 so teams can migrate on their own cadence.

#### Scenario: Doctor surfaces a v1 change

- **WHEN** `cospec doctor` runs with at least one active `schemaVersion` 1
  change present
- **THEN** its output names that change as still on schema version 1
