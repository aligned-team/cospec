# Spec Delta

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
