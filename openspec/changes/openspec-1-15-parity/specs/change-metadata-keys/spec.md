# Spec Delta

## MODIFIED Requirements

### Requirement: Recognized change metadata keys

`.openspec.yaml`'s `skip_specs` and `retire_capabilities` keys SHALL be
recognized boolean members of the loaded change metadata, exposed to commands
and rules rather than silently ignored as unknown keys. A non-boolean value for
either key SHALL be an ERROR naming the key. A key beginning with a lowercase
`x-` followed by at least one character SHALL be user extension metadata and
never reported. cospec's own `schemaVersion` key and every key the pinned
binary's change-metadata schema recognizes SHALL count as recognized, and no
`schemaVersion` warning from the delegated binary SHALL turn a cospec verdict or
a delegated archive red. Any other unrecognized key SHALL still load but be
named as a WARNING by `status`, `validate`, and `archive`.

#### Scenario: Keys load as booleans

- **WHEN** a change's `.openspec.yaml` declares `skip_specs: true` and
  `retire_capabilities: true`
- **THEN** the loaded change exposes both as booleans and `cospec validate`
  reports no unknown-key issue for them

#### Scenario: Non-boolean value is rejected

- **WHEN** `.openspec.yaml` declares `skip_specs: "yes"`
- **THEN** `cospec validate` emits an ERROR naming `skip_specs`

#### Scenario: Extension keys pass strict validation

- **WHEN** `.openspec.yaml` carries `x-goal: G-12` and `x-jiraKey: ABC-1`
- **THEN** `cospec validate --strict` reports no issue for either key

#### Scenario: cospec's schemaVersion stamp is not unknown

- **WHEN** a stamped change's `.openspec.yaml` carries `schemaVersion: 2`
- **THEN** `cospec validate --strict` and `cospec archive` report no unknown-key
  issue for it

#### Scenario: Other unknown keys still tolerated

- **WHEN** `.openspec.yaml` carries `skip_design: true`, `X-Tracker: 1`, or a
  bare `x-` key
- **THEN** the change still loads, `status`, `validate`, and `archive` name each
  key as ignored, and `cospec validate --strict` exits nonzero
