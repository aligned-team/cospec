# Spec Delta

## MODIFIED Requirements

### Requirement: Placeholder Purpose is flagged

The `specs/purpose-tbd` rule SHALL fire both for the archive-generated
`TBD - created by archiving` text and for a `## Purpose` section whose first
non-blank line opens with a placeholder marker: `TBD`/`TODO` in capitals
whatever follows, or any other casing only when followed by the end of the
Purpose, a line break, or marker punctuation. Rule id, severity, empty-Purpose
handling, and single reporting SHALL be unchanged.

#### Scenario: Leading TODO purpose is flagged

- **WHEN** a capability spec's `## Purpose` begins with `TODO: describe this`
- **THEN** `cospec validate` emits `specs/purpose-tbd` as a WARNING, and as an
  ERROR under `--strict`

#### Scenario: Archive placeholder still fires once

- **WHEN** a `## Purpose` carries the archive-generated
  `TBD - created by archiving` text
- **THEN** `specs/purpose-tbd` fires exactly once for that spec

#### Scenario: Empty purpose is unchanged

- **WHEN** a capability spec's `## Purpose` section is empty
- **THEN** the issues reported for that spec are unchanged from before this
  change

#### Scenario: Ordinary word Todo is not a marker

- **WHEN** a spec's Purpose begins "Todo el flujo de pago…" or "Todo o fluxo…"
- **THEN** `specs/purpose-tbd` does not fire, while `todo -` and `tbd.` still do

### Requirement: Recursive capability discovery

cospec SHALL discover capability spec files through one shared module
(`core/spec-paths.ts`) used by `cospec validate`, the scenario-preservation gate
and the post-archive spot check. Discovery SHALL recurse, skip dot-directories,
emit posix-style ids sorted by id, and take a file's capability from its
immediate parent directory, not the first path segment. Reading a directory, it
SHALL swallow only `ENOENT` and propagate every other error rather than return a
short list.

#### Scenario: Nested capability resolves to its own directory

- **WHEN** a change carries a delta at `specs/<area>/<capability>/spec.md`
- **THEN** validation, the scenario-preservation gate, and the post-archive spot
  check all resolve its capability to `<capability>`, not `<area>`

#### Scenario: Nested living specs are enumerated

- **WHEN** `openspec/specs/` contains capabilities nested under an area
  directory
- **THEN** the living-capability list used by validation includes every nested
  capability, keyed by its posix id

#### Scenario: An escaping symlink is rejected

- **WHEN** a capability's `spec.md` is a symlink resolving outside the project
- **THEN** discovery reports an error for that capability rather than including
  it

#### Scenario: An unreadable directory is not silently dropped

- **WHEN** reading a directory under `openspec/specs/` fails with anything other
  than `ENOENT`
- **THEN** the error propagates and the command fails loudly instead of
  proceeding with a partial capability list

#### Scenario: Symlinked spec files are confined to their capability

- **WHEN** a capability's `spec.md` is a symlink
- **THEN** discovery resolves it when it stays inside its capability directory
  or anywhere else inside the project, rejects it when it resolves outside the
  project, and skips it when it dangles

## ADDED Requirements

### Requirement: Symlinked layouts inside the project are accepted

`list --specs`, `show`, `validate`, `sync-specs`, and `archive` SHALL accept a
symlinked `openspec/`, `openspec/changes`, or `openspec/specs` wherever it
resolves. A symlinked `specs/<capability>/spec.md` SHALL be accepted only when
its realpath stays inside the project, and refused otherwise. An `archive/`
directory SHALL be accepted only when it resolves inside `changes/`.

#### Scenario: Linked spec file

- **WHEN** `openspec/specs/auth/spec.md` is a symlink to `docs/auth-spec.md`
- **THEN** `cospec validate --strict` and `cospec archive` treat it as a normal
  spec

#### Scenario: Escaping link

- **WHEN** a symlinked `specs/<capability>/spec.md` resolves outside the project
  root
- **THEN** cospec refuses with an error naming the path

#### Scenario: Linked directories resolve anywhere

- **WHEN** `openspec/specs` is a symlink to a directory outside the project
- **THEN** `cospec validate --strict` and `cospec archive` accept it and read
  the specs through the link

#### Scenario: Archive directory escaping changes

- **WHEN** `openspec/changes/archive` resolves outside `openspec/changes/`
- **THEN** `cospec archive` refuses with an error naming the path

### Requirement: Glob patterns are bounded

An artifact `generates` or `apply.tracks` pattern that nests braces or
parentheses more than 16 levels, or brace-expands to more than 1024 paths, SHALL
be rejected with a clear error before matching. Brace-expanded paths SHALL stay
confined to the change directory.

#### Scenario: Deep nesting

- **WHEN** a schema declares a `generates` pattern with 17 nested brace levels
- **THEN** `cospec status` exits with an error naming the artifact and limit,
  not a stack overflow
