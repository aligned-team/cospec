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

## ADDED Requirements

### Requirement: Symlinked layouts inside the project are accepted

`list --specs`, `show`, `validate`, `sync-specs`, and `archive` SHALL accept a
symlinked `openspec/`, `openspec/changes`, `openspec/specs`, or
`specs/<capability>/spec.md` whose realpath stays inside the project, and SHALL
refuse one that resolves outside it.

#### Scenario: Linked spec file

- **WHEN** `openspec/specs/auth/spec.md` is a symlink to `docs/auth-spec.md`
- **THEN** `cospec validate --strict` and `cospec archive` treat it as a normal
  spec

#### Scenario: Escaping link

- **WHEN** the link resolves outside the project root
- **THEN** cospec refuses with an error naming the path

### Requirement: Glob patterns are bounded

An artifact `generates` or `apply.tracks` pattern that nests braces or
parentheses more than 16 levels, or brace-expands to more than 1024 paths, SHALL
be rejected with a clear error before matching. Brace-expanded paths SHALL stay
confined to the change directory.

#### Scenario: Deep nesting

- **WHEN** a schema declares a `generates` pattern with 17 nested brace levels
- **THEN** `cospec status` exits with an error naming the artifact and limit,
  not a stack overflow
