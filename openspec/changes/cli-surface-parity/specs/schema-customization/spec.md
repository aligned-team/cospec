# Spec Delta

## ADDED Requirements

### Requirement: Schema classification reads the binary's user schema directory

When cospec classifies a change's `schema:` value, the user tier SHALL be the
directory the wrapped binary reads user schemas from:
`$XDG_DATA_HOME/openspec/schemas` when `XDG_DATA_HOME` is set and non-empty,
else `%LOCALAPPDATA%\openspec\schemas` on Windows (falling back to
`~/AppData/Local/openspec/schemas`), else `~/.local/share/openspec/schemas`. It
SHALL never read `~/.config/openspec/schemas`. cospec SHALL compute that
directory in one place, and every reader of the user tier SHALL use it.

#### Scenario: A user-level fork is a legacy schema

- **WHEN** a change names schema `house-style` that exists only under
  `$XDG_DATA_HOME/openspec/schemas/house-style/schema.yaml`
- **THEN** cospec classifies it as a legacy schema from the user tier, as the
  binary resolves it, and `cospec validate` delegates it rather than reporting
  an unknown schema

#### Scenario: The config directory is not a schema tier

- **WHEN** the schema exists only under `~/.config/openspec/schemas/`
- **THEN** cospec classifies it as unknown, as the binary does
