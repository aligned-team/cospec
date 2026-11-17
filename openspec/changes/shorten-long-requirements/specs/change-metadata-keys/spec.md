# Spec Delta

## MODIFIED Requirements

### Requirement: retire_capabilities and the post-archive spot check

`cospec archive`'s post-archive spot check SHALL treat a capability whose living
`spec.md` the wrapped archive removed as an intentional retirement when the
change declares `retire_capabilities: true` and its deltas remove the
capability's last requirement; cospec SHALL then neither report the capability
missing nor print its invariant-breach "please file a bug" message. Without the
marker, cospec SHALL relay the wrapped binary's refusal unchanged.

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
