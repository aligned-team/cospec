## ADDED Requirements

### Requirement: Store lifecycle wrapped with typed post-conditions

`cospec store setup|register|unregister|remove|list|ls|doctor` SHALL wrap the
corresponding `openspec store *` subcommand via the disciplined passthrough
runner, threading `--path`/`--remote`/`--id`/`--yes`/`--json`/`--no-init-git`
unchanged. Each subcommand SHALL verify its effect against a typed JSON
post-condition — `store.root` present on disk after `setup`/`register`,
`registry.removed` reflected in the store registry after `remove`/ `unregister`
— and SHALL NOT treat a zero exit code alone as success.

#### Scenario: Setup creates and registers a store

- **WHEN** `cospec store setup <id> --path <p>` runs against a path with no
  existing OpenSpec root
- **THEN** the command creates `<p>/openspec/` on disk, registers `<id>` in the
  OpenSpec store registry, and reports success only after both facts are
  observed — not merely a zero exit code

#### Scenario: Remove deletes and unregisters

- **WHEN** `cospec store remove <id> --yes` runs against a registered store
- **THEN** the store's root is deleted from disk and its registry entry is
  removed; the command reports success only after both are verified

#### Scenario: Passthrough exit codes and deny-list apply

- **WHEN** any `cospec store` subcommand invokes the wrapped `openspec store`
  binary and it returns a non-allow-listed exit code or emits a deny-listed
  stdout marker
- **THEN** `cospec store` surfaces exit 1 and does not report success

### Requirement: Store setup and register auto-init cospec

`cospec store setup` and `cospec store register` SHALL, on a successful store
creation or registration, auto-run
`cospec init <resolved-store-root> --harness none` as a post-step so the store
gains cospec's typed schemas in one command. This SHALL be skippable with
`--no-cospec-init`. This reverses the prior split where store management stayed
native and cospec-init was a separate manual step.

#### Scenario: Setup auto-initializes cospec schemas

- **WHEN** `cospec store setup <id> --path <p>` succeeds and `--no-cospec-init`
  is not given
- **THEN** `<p>/openspec/schemas/` exists on disk after the command returns,
  written by an auto-run `cospec init --harness none` against the resolved store
  root

#### Scenario: Register auto-initializes cospec schemas

- **WHEN** `cospec store register <path>` succeeds in registering an existing
  OpenSpec root and `--no-cospec-init` is not given
- **THEN** the registered root gains `openspec/schemas/` if it did not already
  have cospec-managed schemas

#### Scenario: Opt-out skips auto-init

- **WHEN** `cospec store setup <id> --path <p> --no-cospec-init` succeeds
- **THEN** the store is created and registered but no `cospec init` is auto-run,
  and `openspec/schemas/` is not written by this command

### Requirement: Store doctor surfaces per-store health

`cospec store doctor <id>` SHALL wrap `openspec store doctor` and render the
delegated store's git facts and metadata diagnostics without repairing them.

#### Scenario: Doctor reports a registered store's facts

- **WHEN** `cospec store doctor <id>` runs against a registered store
- **THEN** the command renders that store's git and metadata facts as reported
  by the wrapped `openspec store doctor --json` call
