# Spec Delta

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
