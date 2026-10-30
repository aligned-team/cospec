# openspec-store-management Specification

## Purpose

cospec owns the OpenSpec store lifecycle so a user never drops out to bare
`openspec`. `cospec store setup|register|unregister|remove|list|ls|doctor` wraps
the native store surface with typed, filesystem-verified post-conditions
(trusting the registry and disk, never the wrapped exit code), and
`setup`/`register` auto-run `cospec init <root> --harness none` so a new or
newly-adopted store gets cospec's typed schemas in one command. This reverses PR
16's "store management stays native" split and closes the documented manual
two-step footgun.

## Requirements

### Requirement: Store lifecycle wrapped with typed post-conditions

`cospec store setup|register|unregister|remove|list|ls|doctor` SHALL wrap the
matching `openspec store *` subcommand via the disciplined passthrough runner,
threading `--path`/`--remote`/`--id`/`--yes`/`--json`/`--no-init-git` unchanged,
and SHALL verify each effect against a typed JSON post-condition — `store.root`
on disk after `setup`/`register`, `registry.removed` reflected in the registry
after `remove`/`unregister` — never a zero exit alone.

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

### Requirement: Store group refusals and diagnostics are the binary's, spelled through cospec

`cospec store` with a missing, unknown or option-shaped subcommand, or one after
`--`, SHALL delegate the argv (`--` kept, `--json` threaded when asked) to the
wrapped `openspec store` and relay its answer respelled via the pinned
allowlist. Each diagnostic printed from a wrapped document SHALL have its `fix`,
and on failure its `message`, spelled through cospec in text and `--json` alike.
A non-directory `--cwd` SHALL get the resolver's `directory not found` refusal
before any spawn.

#### Scenario: An unknown store subcommand is one document

- **WHEN** `cospec store bogus --json`, `cospec store --json` or
  `cospec store --bogus --json` runs
- **THEN** stdout is exactly one JSON document whose `status[0].code` is
  `unknown_store_subcommand`, whose message names `cospec store`, and whose
  other fields equal the binary's for the same argv, exit 1

#### Scenario: An unknown store subcommand's text names cospec

- **WHEN** `cospec store new change x` runs
- **THEN** stderr is the binary's refusal with
  `Error: unknown command 'new' for 'cospec store'.` and the example
  `cospec new <type> x --store <id>`, exit 1

#### Scenario: A store diagnostic's fix names cospec

- **WHEN** `cospec store doctor <unregistered-id>` runs, text and `--json`
- **THEN** the fix reads `Run cospec store list to see registered stores.`, the
  code, target and message are the binary's, and the exit code is 1

#### Scenario: A missing working directory is refused before spawning

- **WHEN** `cospec store list --cwd <path>` runs and `<path>` does not exist
- **THEN** stderr is `cospec: directory not found: <path>`, the exit code is 1,
  and no wrapped call is made

#### Scenario: The unknown-subcommand relay shapes

- **WHEN** `cospec store bogus` runs with and without `--json`
- **THEN** under `--json` stdout is exactly one document whose `status[0]` is
  the binary's `unknown_store_subcommand` diagnostic, and otherwise the binary's
  `Error: …` text is printed with its lifecycle example spelled as the cospec
  command of the same shape

#### Scenario: Every wrapped status array is respelled

- **WHEN** a wrapped mutation, cleanup, list or doctor payload carries
  diagnostics in its `status[]` or in any `stores[].status[]`
- **THEN** each such diagnostic's `fix` is spelled through cospec and every
  field other than `fix` and `message` is unchanged
