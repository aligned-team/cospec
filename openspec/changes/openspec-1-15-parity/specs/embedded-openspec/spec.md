# Spec Delta

## ADDED Requirements

### Requirement: OpenSpec 1.15.0 pin

The dev/CI pin and the embedded bundle SHALL be `@fission-ai/openspec` 1.15.0,
with `EXPECTED_OPENSPEC_VERSION` equal to it and the accepted range unchanged at
`>=1.0.0 <2.0.0`. The contract, reachability, remedy-enumeration, key-oracle,
and optional-workflow differential suites SHALL pass against that pin with
`parity-pending.yaml` empty.

#### Scenario: Pin agreement

- **WHEN** `mise run check` runs
- **THEN** `package.json`, `mise.toml`, `EXPECTED_OPENSPEC_VERSION`, and the
  vendored bundle all name 1.15.0 and `vendor:openspec:check` reports no drift

#### Scenario: No pending surfaces

- **WHEN** the reachability test runs against the 1.15.0 dist
- **THEN** every command, flag, tool id and workflow resolves to the command
  table, an alias, or the single exception, and `parity-pending.yaml` is `[]`
