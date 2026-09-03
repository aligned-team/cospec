# change-metadata-keys Specification

## Purpose

Defines which keys in a change's `.openspec.yaml` metadata cospec recognizes and
type-checks, so a boolean-valued key like `skip_specs` or `retire_capabilities`
is exposed to commands and validation rules instead of being silently treated as
an unknown, ignorable field.

## Requirements

### Requirement: Recognized change metadata keys

`.openspec.yaml`'s `skip_specs` and `retire_capabilities` keys SHALL be
recognized boolean members of the loaded change metadata, exposed to commands
and rules rather than silently ignored as unknown keys. A non-boolean value for
either key SHALL be an ERROR naming the key. Unknown keys SHALL keep their
current tolerated handling, so a change written by a newer OpenSpec still loads.

#### Scenario: Keys load as booleans

- **WHEN** a change's `.openspec.yaml` declares `skip_specs: true` and
  `retire_capabilities: true`
- **THEN** the loaded change exposes both as booleans and `cospec validate`
  reports no unknown-key issue for them

#### Scenario: Non-boolean value is rejected

- **WHEN** `.openspec.yaml` declares `skip_specs: "yes"`
- **THEN** `cospec validate` emits an ERROR naming `skip_specs`

#### Scenario: Other unknown keys still tolerated

- **WHEN** `.openspec.yaml` carries a key cospec does not know
- **THEN** the change still loads and the key is ignored, unchanged from today's
  behavior

### Requirement: skip_specs precedence and conflict

`skip_specs: true` SHALL act as a persisted equivalent of the
`cospec archive --skip-specs` flag and SHALL additionally satisfy the specs
requirement of the `cospec apply` gate, so a spec-bearing type that legitimately
produces no deltas has an escape hatch on the record. Precedence SHALL be: an
explicit CLI flag first, then the persisted marker, then the structural per-type
artifact matrix. Declaring the marker while any file exists under the change's
`specs/` directory SHALL be an ERROR.

#### Scenario: Marker satisfies the apply gate

- **WHEN** `cospec apply` runs on a `feat` change whose `.openspec.yaml`
  declares `skip_specs: true` and whose `specs/` directory is empty
- **THEN** the gate does not block on the missing specs artifact

#### Scenario: Marker and deltas together are an error

- **WHEN** a change declares `skip_specs: true` and also carries a file under
  `specs/`
- **THEN** `cospec validate` emits an ERROR naming the conflict, and
  `cospec apply` blocks

#### Scenario: CLI flag outranks the marker

- **WHEN** `cospec archive --skip-specs` runs on a change with no marker, and
  when a marked change is archived without the flag
- **THEN** both skip the spec-sync path, and the resolved precedence is reported
  the same way in `--json`

#### Scenario: Unmarked change is unaffected

- **WHEN** a spec-bearing change declares neither the marker nor the flag
- **THEN** the apply gate's specs requirement behaves exactly as before this
  change

### Requirement: retire_capabilities and the post-archive spot check

`cospec archive`'s post-archive spot check SHALL treat a capability whose living
`spec.md` was removed by the wrapped archive as an intentional retirement when
the change declares `retire_capabilities: true` and its deltas remove the
capability's last requirement. In that case cospec SHALL NOT report the
capability as missing from the living spec and SHALL NOT print its
invariant-breach "please file a bug" message. Without the marker, cospec SHALL
relay the wrapped binary's own refusal unchanged.

#### Scenario: Declared retirement archives cleanly

- **WHEN** a change whose `REMOVED` delta takes a capability's last requirement
  declares `retire_capabilities: true` and is archived
- **THEN** `cospec archive` succeeds and prints no invariant-breach message for
  the retired capability

#### Scenario: Undeclared retirement relays the wrapped refusal

- **WHEN** the same change is archived without the marker
- **THEN** cospec relays the wrapped binary's refusal and does not claim a
  cospec/openspec invariant breach

#### Scenario: Spot check still catches a real miss

- **WHEN** a `MODIFIED` delta names a requirement absent from the living spec
  after archive, on a capability that was not retired
- **THEN** the spot check reports the miss exactly as it does today
