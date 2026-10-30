# Spec Delta

## ADDED Requirements

### Requirement: The change stamp is an x- extension key

`cospec new` and `cospec migrate` SHALL stamp a change's schema version as
`x-cospec-schema-version` in `.openspec.yaml`, the namespace OpenSpec 1.14+
reserves for tool metadata, so bare `openspec validate --strict` passes on
cospec changes. cospec SHALL read the legacy `schemaVersion` key as an equal
fallback, `cospec migrate` SHALL rewrite it, and `cospec doctor` SHALL list
changes still carrying it.

#### Scenario: New change passes upstream strict

- **WHEN** `cospec new feat demo` runs and the pinned
  `openspec validate demo --strict` checks it
- **THEN** `.openspec.yaml` carries `x-cospec-schema-version` and upstream
  reports no unknown key

#### Scenario: Legacy stamp still honoured

- **WHEN** a change carries only `schemaVersion: 2`
- **THEN** cospec treats it as version 2, `cospec doctor` names it, and
  `cospec migrate <slug>` rewrites it to `x-cospec-schema-version: 2`

## MODIFIED Requirements

### Requirement: Monotonic version-filtered enforcement

cospec SHALL keep an `introducedAt(artifact, type)` table where
`introducedAt(verification, {feat,fix,perf,refactor}) = 2` and every other entry
is `1`, and SHALL compute `enforcedApplyRequires(type, schemaVersion)` as
`TYPE_ARTIFACTS[type].applyRequires` minus every artifact whose `introducedAt`
exceeds the change's stamped `schemaVersion`. The filter SHALL be identical at
apply and archive, uniform rather than content-derived, and `introducedAt`
values SHALL only ever increase.

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
