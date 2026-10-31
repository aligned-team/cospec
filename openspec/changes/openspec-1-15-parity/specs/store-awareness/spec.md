# Spec Delta

## ADDED Requirements

### Requirement: Store edit scope includes the declaring project

For a store-backed change, `cospec status --json`'s
`actionContext.allowedEditRoots` SHALL list the project on the current path that
declares the store alongside the store. When no project on the path declares it,
the constraint SHALL tell the agent to ask which repository to edit.

#### Scenario: Declaring project present

- **WHEN** `cospec status --change x --json` runs inside a repo whose config
  points at store `plans`
- **THEN** `allowedEditRoots` holds both the repo root and the store root

### Requirement: Init runs at a store-only repository root

`cospec init` at the root of a repository whose `openspec/` holds only a
`store:` pointer SHALL install harness integrations without changing the pointer
config and without creating local planning directories, matching OpenSpec
1.14.0. An invalid `store:` line SHALL still be refused.

#### Scenario: Store-only repo

- **WHEN** `cospec init --tools claude` runs at a repo whose
  `openspec/config.yaml` holds only `store: plans`
- **THEN** `.claude/` is written, the config is byte-identical, and no
  `openspec/changes` or `openspec/specs` is created

## MODIFIED Requirements

### Requirement: Deterministic root resolution

The system SHALL resolve one root per command as the wrapped binary does,
recording provenance (`store`, `declared`, `nearest`, `global_default`,
`implicit`) matching its `root.source`: `--store <id>`; else the nearest
qualifying `openspec/` above the canonical invocation directory; else the global
`defaultStore`; else, only with no store registered, the invocation directory.
Resolver failures SHALL exit non-zero with the binary's code and a fix naming
`cospec`, never bare `openspec`.

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

#### Scenario: A defaultStore is validated as written

- **WHEN** the global config sets `defaultStore` to `" beta "` and `beta` is
  registered, and a command runs from a rootless directory
- **THEN** the command fails with `invalid_store_id`, as bare `openspec` does,
  and does not select `beta`

#### Scenario: An unreadable global config carries no defaultStore

- **WHEN** the global config path is a directory, a file the user may not read,
  or a file that is not JSON, and a command runs from a rootless directory
- **THEN** the command answers as it does with no global config file, and only
  for the file that is not JSON prints the wrapped binary's invalid-JSON
  warning, once; `templates` and `schema` print no warning, as the wrapped
  binary does not

#### Scenario: An unreadable store registry fails selection

- **WHEN** the machine's store registry file is not valid YAML and a command
  selects its root with `--store`, a `store:` pointer, `defaultStore`, or from a
  rootless directory
- **THEN** the command exits 1 with the wrapped binary's
  `invalid_store_registry` diagnostic, behind the same origin prefix for a
  pointer or `defaultStore`, and never reports a wrapped-call violation

#### Scenario: A store registry the user may not read fails as the binary does

- **WHEN** the machine's store registry file cannot be opened (no read
  permission) and a command selects its root with `--store`, a `store:` pointer,
  `defaultStore`, or from a rootless directory
- **THEN** the command exits 1 with the wrapped binary's message for that
  failure, verbatim, with no origin prefix and no fix line, as the wrapped
  binary rethrows a failure that is not one of its store errors

#### Scenario: A selected store that cannot be read fails as the binary does

- **WHEN** a store selected with `--store`, a `store:` pointer or `defaultStore`
  has a `.openspec-store/store.yaml` that is a directory or unreadable, or an
  `openspec/` directory the user may not search
- **THEN** the command exits 1 with the message the wrapped binary prints under
  Node for that errno, verbatim (a path is in it only when Node's own message
  for that errno carries one — a failed `read`, `EISDIR`, does not), with no
  origin prefix and no fix line; under `--json` it prints exactly one document
  whose `status` entry carries that message; and `templates` and `schema` with
  no `--store` answer as the wrapped binary does in the invocation directory

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
  stderr carries exactly one warning naming the config file and `platform`,
  unless the command is `templates` or `schema`, whose stderr carries no such
  warning

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

- **WHEN** a command other than `templates` and `schema` runs in human mode
  against a root selected by `--store`, a `store:` pointer or `defaultStore`,
  including a command that relays the wrapped binary's stderr
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

#### Scenario: What qualifies as a root on the walk

- **WHEN** the walk meets an `openspec/` directory
- **THEN** it qualifies when it has a planning shape (a `specs/` or `changes/`
  directory carrying no store identity metadata) or a project config
  (`openspec/config.yaml`, else `openspec/config.yml`); one with neither is
  walked past, so a home holding stores at `~/openspec/<id>` is never a root;
  and the resolved local root's path is canonical

#### Scenario: Store pointer rules

- **WHEN** the qualifying directory's config carries a `store:` pointer
- **THEN** it is followed only when the directory has no planning shape; a
  planning root uses the local root and prints one stderr warning naming the
  config file and the ignored store id (never for `templates` or `schema`); and
  a followed pointer that is not YAML or whose `store` is not a string fails
  with `invalid_store_pointer`, an empty string with `invalid_store_id`

#### Scenario: defaultStore is read as the binary reads it

- **WHEN** no qualifying root exists and `defaultStore` is consulted
- **THEN** it is probed only after the earlier tiers miss, never outranks a
  local root, and is read from the global config at the path the binary reports
  as the raw JSON value: false-y counts as unset, anything else reaches store-id
  validation and registry lookup unchanged

#### Scenario: An unparseable global config has no defaultStore

- **WHEN** the global config cannot be read or parsed (a directory, no read
  permission, not JSON)
- **THEN** it counts as having no `defaultStore`, and a non-JSON file prints the
  binary's `Warning: Invalid JSON in <path>, using defaults` once per invocation
  on stderr, except for `templates` and `schema`

#### Scenario: Registered stores without any root

- **WHEN** no qualifying root and no `defaultStore` exist but a store is
  registered
- **THEN** the command fails with `no_root_with_registered_stores` naming every
  registered store id

#### Scenario: Unregistered ids never fall back locally

- **WHEN** a store id from `--store`, a `store:` pointer or `defaultStore` is
  unregistered
- **THEN** the command fails loudly rather than falling back to the local
  repository, except where the template-and-schema requirement runs in the
  invocation directory instead

#### Scenario: A selected store is verified on disk

- **WHEN** a store is selected by any route
- **THEN** missing or mismatched identity metadata fails with
  `store_identity_mismatch`, unreadable metadata with `invalid_store_metadata`,
  and a root without a usable `openspec/` directory and config with
  `unhealthy_store_root`, each with a fix naming `cospec store doctor <id>`

#### Scenario: Banner and --store threading

- **WHEN** a store-selected root is used
- **THEN** human mode prints `Using OpenSpec root: <id> (<path>)` on stderr once
  per command other than `templates` and `schema`, `--json` prints no such line,
  and wrapped calls receive `--store` only when the user passed it

#### Scenario: Resolver failure shapes

- **WHEN** root resolution fails
- **THEN** under `--json` exactly one JSON document with a `status` array
  carrying the diagnostic is printed on stdout with exit 1; an empty `--store`
  reaches the resolver on every command selecting through `--store` and fails
  with `invalid_store_id`; and on a command whose arguments the binary parses,
  the binary's parse refusal outranks the selection failure without running
  anything in the invocation directory

#### Scenario: The invocation directory is checked first

- **WHEN** the invocation directory (`--cwd <path>` or the process cwd) is not
  an existing directory
- **THEN** before any walk or spawn the command fails with
  `directory not found: <path>`, code `directory_not_found`, exit 1, never with
  the runtime's spawn error and never by resolving an ancestor

### Requirement: Template and schema inspection spawn in every resolved root

`cospec templates` and `cospec schema` subcommands SHALL never pass `--store` to
the binary, spawning instead in every resolved root's directory (store, pointer,
`defaultStore`, walked or implicit), a `--store` before or after the command
selecting it. Output and mapped exit code SHALL otherwise be unchanged. A failed
selection without `--store` SHALL run in the invocation directory; an explicit
`--store` failure or a missing invocation directory SHALL still fail.

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

#### Scenario: Templates and schema print no resolver line

- **WHEN** `cospec templates --json`, `cospec schema which spec-driven` or
  `cospec schema validate spec-driven` runs in a planning root whose config
  declares `store: platform` (from the root or a subdirectory), from a
  config-only `store: platform` directory, under `defaultStore` `platform`, or
  with `--store platform`
- **THEN** stderr carries neither the ignored-pointer warning nor the store
  banner, only the wrapped binary's own lines, byte for byte as bare `openspec`
  prints them for the same command

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

#### Scenario: Why every root spawns in place

- **WHEN** these commands run in any resolved root
- **THEN** spawning there is a deliberate superset of the binary, which reads
  its own working directory; the store-backed roots were the broken case, not
  the limit

#### Scenario: Bare openspec remedies are respelled

- **WHEN** the binary names a remedy as a bare `openspec` command
- **THEN** it names the cospec command of the same shape: `schema`'s
  `"openspec schema fork"` on a failed call, in text and `--json`, and the last
  next step of a successful `schema init`, spelled only where the binary alone
  writes it

#### Scenario: A text-answered templates failure carries no cospec document

- **WHEN** a failed `templates --json` call is answered by the binary in text
  with nothing on stdout
- **THEN** it is relayed as that answer, exit 1, with no document of cospec's

#### Scenario: A cwd fallback is the binary's run

- **WHEN** selection fails without `--store` and the call runs in the invocation
  directory
- **THEN** its output, exit code and files written are the binary's there

#### Scenario: Stderr is the binary's alone

- **WHEN** these commands select a root by any route
- **THEN** none of the resolver's lines (the ignored-pointer warning, the store
  banner, the invalid-global-config warning) is printed, because the binary
  never runs root selection for them
