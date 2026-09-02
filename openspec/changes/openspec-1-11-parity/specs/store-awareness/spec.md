## MODIFIED Requirements

### Requirement: Deterministic root resolution

The system SHALL resolve exactly one operating root per command, preferring an
explicit `--store` flag, then a `store:` pointer in the local config, then the
local repository, and SHALL fail loudly on an unregistered store id rather than
falling back to the local repository. When none of those tiers yields a root —
that is, only when local-root resolution has already failed — the system SHALL
consult the machine's global `defaultStore` setting and target that store,
mirroring the wrapped binary's own root selection so cospec and bare `openspec`
agree on which root a command targets. `defaultStore` SHALL change only the
failure path and SHALL NEVER outrank a resolvable local repository. It SHALL be
read through the wrapped binary rather than by reimplementing global-config path
discovery, and it SHALL only be probed after the earlier tiers miss, so the
common local path costs no extra work. A `defaultStore` naming an unregistered
store SHALL produce the same actionable error an unknown `--store` id produces.

#### Scenario: Unknown store id is rejected

- **WHEN** a command is given `--store` naming a store not in the machine
  registry
- **THEN** the command exits non-zero and names the registered stores

#### Scenario: A references list is not a root override

- **WHEN** the local config declares `references:` but no `store:` pointer
- **THEN** the command operates on the local repository

#### Scenario: defaultStore is used when no local root resolves

- **WHEN** a command runs from a directory with no `openspec/` root above it and
  the machine's global config declares a registered `defaultStore`
- **THEN** the command targets that store's tree, the same root bare `openspec`
  would target

#### Scenario: A local root outranks defaultStore

- **WHEN** the same command runs inside a repository that has its own
  `openspec/` root while a `defaultStore` is configured
- **THEN** the command operates on the local repository and the global config is
  not consulted

#### Scenario: An explicit selection outranks defaultStore

- **WHEN** `--store <id>` or a local `store:` pointer selects a store while a
  different `defaultStore` is configured
- **THEN** the explicitly selected store wins

#### Scenario: A stale defaultStore fails loudly

- **WHEN** no local root resolves and the configured `defaultStore` names a
  store that is no longer registered
- **THEN** the command exits non-zero with the actionable unknown-store error
  rather than silently falling back
