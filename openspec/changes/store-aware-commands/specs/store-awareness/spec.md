## ADDED Requirements

### Requirement: Store-scoped operating root

The system SHALL run any change-lifecycle command against a registered OpenSpec
store when a `--store <id>` flag or a `store:` config pointer selects one,
reading and writing that store's `openspec/` tree instead of the local
repository.

#### Scenario: A change is created in the store, not the cwd

- **WHEN** `cospec new feat epic --store platform` runs from an unrelated
  directory
- **THEN** the change is created under the store's `openspec/changes/` and the
  invocation directory is left untouched

#### Scenario: The gate and archive operate on the store

- **WHEN** `cospec apply` and `cospec archive` run with `--store platform`
- **THEN** the blocker gate, verification gate, filesystem-verified move, and
  blocker fan-out all read and write the store's tree

### Requirement: Deterministic root resolution

The system SHALL resolve exactly one operating root per command, preferring an
explicit `--store` flag, then a `store:` pointer in the local config, then the
local repository, and SHALL fail loudly on an unregistered store id rather than
falling back to the local repository.

#### Scenario: Unknown store id is rejected

- **WHEN** a command is given `--store` naming a store not in the machine
  registry
- **THEN** the command exits non-zero and names the registered stores

#### Scenario: A references list is not a root override

- **WHEN** the local config declares `references:` but no `store:` pointer
- **THEN** the command operates on the local repository
