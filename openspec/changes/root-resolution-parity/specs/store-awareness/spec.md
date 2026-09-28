# Spec Delta

## MODIFIED Requirements

### Requirement: Deterministic root resolution

The system SHALL resolve exactly one operating root per command, using the same
selection the wrapped binary uses, so that cospec and bare `openspec` agree on
which root a command targets from any directory.

An explicit `--store <id>` flag SHALL win outright. Without it, the system SHALL
walk from the canonical invocation directory towards the filesystem root and
stop at the nearest `openspec/` directory that qualifies. An `openspec/`
directory SHALL qualify when it has a planning shape (a `specs/` or `changes/`
directory that does not carry store identity metadata) or a project config file
(`openspec/config.yaml`, else `openspec/config.yml`). An `openspec/` directory
with neither SHALL NOT qualify and the walk SHALL continue past it, so that a
home directory holding registered stores at `~/openspec/<id>` is never mistaken
for a root. The resolved local root's path SHALL be canonical.

A `store:` pointer in the qualifying directory's config SHALL be followed only
when that directory has no planning shape. When a planning root carries a
pointer, the system SHALL use the local root and SHALL print one warning on
stderr naming the config file and the ignored store id. A pointer that cannot be
parsed as YAML, or whose `store` value is not a string, SHALL fail the command
with the `invalid_store_pointer` code, and an empty-string pointer SHALL fail
with the `invalid_store_id` code, whenever that pointer would be followed.

When no qualifying root exists, the system SHALL consult the machine's global
`defaultStore` setting and target that store. `defaultStore` SHALL change only
the failure path and SHALL NEVER outrank a qualifying local root. It SHALL be
read through the wrapped binary rather than by reimplementing global-config path
discovery, and it SHALL only be probed after the earlier tiers miss, so the
common local path costs no extra work. When no qualifying root and no
`defaultStore` exist but at least one store is registered, the system SHALL fail
with the `no_root_with_registered_stores` code and name every registered store
id. Only when no store is registered SHALL the invocation directory be used as
an implicit root.

The system SHALL fail loudly on an unregistered store id, whether it comes from
`--store`, a `store:` pointer or `defaultStore`, rather than falling back to the
local repository. Every resolver failure SHALL exit non-zero and SHALL carry the
wrapped binary's diagnostic code and a fix line that names `cospec` commands,
never bare `openspec`. The resolved root SHALL record its provenance as one of
`store`, `declared`, `nearest`, `global_default` or `implicit`, matching the
wrapped binary's `root.source` for the same invocation.

Whichever way a store is selected, the system SHALL verify the registered store
on disk before using it: missing or mismatched identity metadata SHALL fail with
`store_identity_mismatch`, unreadable identity metadata with
`invalid_store_metadata`, and a store root without a usable `openspec/`
directory and config file with `unhealthy_store_root`, each with a fix naming
`cospec store doctor <id>`. In human mode, a store-selected root SHALL print
`Using OpenSpec root: <id> (<path>)` on stderr exactly once per command, and a
`--json` run SHALL print no such line. Wrapped calls SHALL receive `--store`
only when the user passed `--store`, so that relayed JSON reports the wrapped
binary's own provenance for a pointer or `defaultStore` root. In a `--json` run,
a resolver failure SHALL print exactly one JSON document carrying a `status`
array with the diagnostic on stdout and exit 1. An empty `--store` value SHALL
reach the resolver on every command that selects its root through `--store`, and
SHALL fail there with the `invalid_store_id` code, as the wrapped binary does.
On a command whose arguments the wrapped binary parses itself, the binary's own
parse refusal SHALL outrank a root-selection failure, as it does for bare
`openspec`, and asking the binary for it SHALL NOT run anything in the
invocation directory.

Before any walk or spawn, the system SHALL verify that the invocation directory
(`--cwd <path>`, or the process working directory) is an existing directory, and
otherwise SHALL fail with `directory not found: <path>`, the
`directory_not_found` code and exit 1, never with the runtime's own spawn error
and never by resolving an ancestor of the missing path.

#### Scenario: Unknown store id is rejected

- **WHEN** a command is given `--store` naming a store not in the machine
  registry
- **THEN** the command exits non-zero and names the registered stores

#### Scenario: A references list is not a root override

- **WHEN** the local config declares `references:` but no `store:` pointer
- **THEN** the command operates on the local repository

#### Scenario: defaultStore is used when no local root resolves

- **WHEN** a command runs from a directory with no qualifying `openspec/` root
  at or above it and the machine's global config declares a registered
  `defaultStore`
- **THEN** the command targets that store's tree with provenance
  `global_default`, the same root bare `openspec` would target

#### Scenario: A local root outranks defaultStore

- **WHEN** the same command runs inside a repository that has its own
  `openspec/` root while a `defaultStore` is configured
- **THEN** the command operates on the local repository and the global config is
  not consulted

#### Scenario: An explicit selection outranks defaultStore

- **WHEN** `--store <id>`, or a `store:` pointer in a config-only `openspec/`,
  selects a store while a different `defaultStore` is configured
- **THEN** the explicitly selected store wins

#### Scenario: A stale defaultStore fails loudly

- **WHEN** no local root resolves and the configured `defaultStore` names a
  store that is no longer registered
- **THEN** the command exits non-zero with the actionable unknown-store error
  rather than silently falling back

#### Scenario: A subdirectory resolves the enclosing root

- **WHEN** a command runs from `<repo>/src/deep` and `<repo>/openspec/` has a
  `changes/` directory
- **THEN** the command operates on `<repo>` with provenance `nearest`, and the
  subdirectory is never treated as a root

#### Scenario: A config-only openspec directory is a root

- **WHEN** a command runs inside, or below, a directory whose `openspec/` holds
  only a `config.yaml` with no `store:` key
- **THEN** that directory is the root with provenance `nearest`

#### Scenario: A planning root ignores its store pointer and warns

- **WHEN** a command runs in a repository whose `openspec/` has a `changes/`
  directory and whose `config.yaml` declares `store: platform`
- **THEN** the command operates on the local repository, not on `platform`, and
  stderr carries exactly one warning naming the config file and `platform`

#### Scenario: A config-only pointer is followed

- **WHEN** a command runs in a directory whose `openspec/` holds only a
  `config.yaml` declaring a registered `store: platform`
- **THEN** the command operates on `platform` with provenance `declared`

#### Scenario: A config.yml pointer is followed

- **WHEN** a command runs in a directory whose `openspec/` holds only a
  `config.yml`, with no `config.yaml`, declaring a registered `store: platform`
- **THEN** the command operates on `platform` with provenance `declared`, as it
  would for the same pointer in `config.yaml`

#### Scenario: A malformed store pointer fails the command

- **WHEN** a config-only `openspec/config.yaml` cannot be parsed as YAML, or
  declares `store:` as a list or mapping
- **THEN** the command exits non-zero with `invalid_store_pointer` and a fix
  line naming the config file, and no root is used

#### Scenario: Registered stores without a local root fail the command

- **WHEN** a command runs from a directory with no qualifying `openspec/` root
  at or above it, no `defaultStore` is set, and stores `alpha` and `beta` are
  registered
- **THEN** the command exits non-zero with `no_root_with_registered_stores`, and
  the message names `alpha` and `beta`

#### Scenario: The home store layout is not a phantom root

- **WHEN** stores are registered at `$HOME/openspec/<id>` and a command runs
  from `$HOME` or from a directory under it with no project root of its own
- **THEN** `$HOME` is not selected as a root, and the command fails with
  `no_root_with_registered_stores`

#### Scenario: A bare openspec directory is skipped by the walk

- **WHEN** a command runs below a directory whose `openspec/` holds neither
  `specs/`, `changes/` nor a config file, inside a repository that is a planning
  root
- **THEN** the walk skips the bare directory and the repository is the root

#### Scenario: A broken store fails the command

- **WHEN** a registered store has lost its `.openspec-store/store.yaml`, carries
  a different id there, or has no `openspec/config.yaml` or
  `openspec/config.yml`, and a command selects it
- **THEN** the command exits non-zero with `store_identity_mismatch` or
  `unhealthy_store_root` and a fix naming `cospec store doctor <id>`, and does
  not operate on that store

#### Scenario: A store-selected root is announced once

- **WHEN** a command runs in human mode against a root selected by `--store`, a
  `store:` pointer or `defaultStore`, including a command that relays the
  wrapped binary's stderr
- **THEN** stderr carries `Using OpenSpec root: <id> (<path>)` exactly once, and
  the same command with `--json` carries no such line

#### Scenario: Relayed JSON reports the binary's own provenance

- **WHEN** `cospec show <item> --json` runs from a config-only directory whose
  pointer names a registered store
- **THEN** the relayed document's `root.source` is `declared`, as bare
  `openspec show <item> --json` reports, and with an explicit `--store` it is
  `store`

#### Scenario: A missing invocation directory fails cleanly

- **WHEN** a command runs with `--cwd <path>` and `<path>` does not exist, even
  below a planning root or with an explicit `--store`
- **THEN** the command exits 1 with `cospec: directory not found: <path>` on
  stderr, nothing on stdout, and no mention of the runtime or its spawn path

#### Scenario: A resolver failure under --json is one JSON document

- **WHEN** a command runs with `--json` and root resolution fails
- **THEN** stdout is exactly one JSON document whose `status` array holds the
  diagnostic with its code and fix, and the command exits 1

#### Scenario: context and schemas keep their payload in the failure document

- **WHEN** `cospec context --json` or `cospec schemas --json` runs and root
  resolution fails
- **THEN** the one document carries the command's empty payload ahead of
  `status` (`root: null, members: []` for `context`; `schemas: [], root: null`
  for `schemas`), keys in the wrapped binary's order, as bare `openspec` prints
  it

#### Scenario: An empty store id fails selection

- **WHEN** `cospec list --store=` runs, and again with `--json`
- **THEN** the command exits 1 with `cospec: Store id must not be empty` and a
  `Fix:` line, and under `--json` with one document whose `status[0]` equals the
  wrapped binary's `invalid_store_id` diagnostic

#### Scenario: The binary's parse refusal outranks a selection failure

- **WHEN** `cospec schemas --bogus --store nosuch` runs and `nosuch` is not a
  registered store
- **THEN** the command exits 1 with the wrapped binary's
  `error: unknown option '--bogus'`, exactly as `openspec` prints it, and
  nothing is written under the invocation directory

## ADDED Requirements

### Requirement: Template and schema inspection spawn in every resolved root

`cospec templates` and every `cospec schema` subcommand SHALL never pass
`--store` to the wrapped binary, which rejects it on those commands. The system
SHALL instead spawn the wrapped call in every resolved root, with that root's
directory as the working directory: a root reached through `--store`, a `store:`
pointer or `defaultStore`, a local root found by the ancestor walk, and an
implicit root alike. Spawning in the resolved root for every root is a
deliberate superset of the wrapped binary, which reads its own working directory
for these commands; the store-backed roots were the broken case, not the limit
of the requirement. A `--store` before or after the command name SHALL select
the root the call spawns in. The relayed output and the mapped exit code SHALL
otherwise be unchanged, except that a remedy the wrapped binary names as a bare
`openspec` command SHALL name the cospec command of the same shape: `schema`'s
`"openspec schema fork"` on a failed call, in text and `--json`, and the last
next step of a successful `schema init`, spelled only where the binary alone
writes it. A failed `templates` call under `--json` that the wrapped binary
answers in text, with nothing on stdout, SHALL be relayed as that answer, with
exit 1 and no document of cospec's. When root selection fails and the user
passed no `--store`, these commands SHALL NOT fail on the selection: the system
SHALL spawn the wrapped call in the invocation directory, as the wrapped binary
always runs them, so its output, exit code and files written are the binary's
there. A selection failure under an explicit `--store`, and a missing invocation
directory, SHALL still fail the command.

#### Scenario: Templates succeed for a store selected by flag

- **WHEN** `cospec templates --json --store platform` runs from an unrelated
  directory
- **THEN** the command exits 0 with one parseable JSON document resolved against
  `platform`'s tree, and the wrapped call carried no `--store`

#### Scenario: Schema which succeeds for a store selected by pointer or default

- **WHEN** `cospec schema which feat --json` runs from a config-only directory
  whose pointer names `platform`, and again from a rootless directory whose
  global `defaultStore` is `platform`
- **THEN** both runs exit 0 and report the schema as `platform`'s tree resolves
  it

#### Scenario: Templates from a subdirectory use the enclosing root

- **WHEN** `cospec templates --json --schema feat` runs from a subdirectory of a
  repository whose `openspec/schemas/feat/` exists
- **THEN** the template paths resolve to that repository's project schema

#### Scenario: A templates failure under --json is the binary's text answer

- **WHEN** `cospec templates --schema nope --json` runs in a root that has no
  `nope` schema
- **THEN** the command exits 1 with nothing on stdout and the wrapped binary's
  `✖ Error: Schema 'nope' not found. …` on stderr, exactly as bare `openspec`
  prints it, and no wrapped-call violation

#### Scenario: A failed selection without --store runs templates and schema in the cwd

- **WHEN** `cospec templates --json` or `cospec schema init s1 --description d`
  runs from a rootless directory on a machine with registered stores, or from a
  directory whose `store:` pointer or global `defaultStore` names a missing or
  broken store
- **THEN** the command exits as bare `openspec` does in that directory, with the
  same stdout, stderr and files written, and no root-selection error

#### Scenario: A failed explicit --store still fails templates and schema

- **WHEN** `cospec templates --json --store nope` runs and `nope` is not
  registered
- **THEN** the command exits 1 with the `unknown_store` diagnostic and writes
  nothing

#### Scenario: A store before the command name selects the root

- **WHEN** `cospec --store platform schema which feat` runs and only
  `platform`'s tree holds `feat`
- **THEN** the command exits 0 and reports `platform`'s `feat` schema

#### Scenario: Schema init names cospec in its next step

- **WHEN** `cospec schema init my-flow --description d` succeeds
- **THEN** the output is the wrapped binary's, except that its last line reads
  `3. Use with: cospec new my-flow <slug>`, and a directory in the schema's path
  that reads like that line is printed unchanged
