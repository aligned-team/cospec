# Spec Delta

## MODIFIED Requirements

### Requirement: The dynamic completion source fails silently

`cospec __complete <changes|specs|types|schemas|archived-changes>` SHALL be a
hidden command emitting one tab-separated id and description pair per line on
stdout, and SHALL exit 1 with **no output on stdout or stderr** on any failure —
an unresolvable root, a wrapped-call error, an unknown source name — because a
Tab press must never be corrupted by an error message. The source name SHALL be
matched case-insensitively, as the wrapped binary matches it. `changes` and
`specs` SHALL be sourced from the existing typed wrapped list calls; `types`
SHALL be sourced from `COSPEC_TYPES` with no wrapped spawn at all; `schemas`
SHALL be sourced from `openspec schemas --json`, one line per schema name
described by its `description`; `archived-changes` SHALL list the non-dot
directories under the resolved root's `openspec/changes/archive/`, sorted, each
described `archived change`, with no wrapped spawn.

#### Scenario: Change ids complete inside a repo

- **WHEN** `cospec __complete changes` runs in a repo with active changes
- **THEN** stdout lists each active change id with a tab-separated description
  and the command exits 0

#### Scenario: Types complete without spawning the wrapped binary

- **WHEN** `cospec __complete types` runs
- **THEN** the eleven cospec conventional-commit types are listed and no wrapped
  binary is spawned

#### Scenario: Failure is silent on both streams

- **WHEN** `cospec __complete changes` runs outside any resolvable openspec
  root, or `cospec __complete nonsense` is invoked
- **THEN** the command exits 1 having written nothing to stdout and nothing to
  stderr

#### Scenario: Schemas complete from the wrapped listing

- **WHEN** `cospec __complete schemas` runs in a root with a project fork
- **THEN** stdout lists the same schema names, in the same order, as
  `openspec __complete schemas`, the fork included

#### Scenario: Archived changes complete from the archive

- **WHEN** `cospec __complete ARCHIVED-CHANGES` runs in a root with two archived
  changes
- **THEN** stdout lists both directory names, as
  `openspec __complete archived-changes` does

## ADDED Requirements

### Requirement: Generated scripts complete schema names

The bash, zsh and fish scripts `cospec completion` generates SHALL complete the
value of every `--schema` option a table row declares, and the first positional
of `schema which`, `schema validate` and `schema fork`, from
`cospec __complete schemas`, the positions where the wrapped binary's scripts
complete schema names. No generated script SHALL call the `openspec` binary.

#### Scenario: A --schema value completes

- **WHEN** the generated zsh script completes `cospec status --schema <Tab>`
- **THEN** it calls `cospec __complete schemas`
