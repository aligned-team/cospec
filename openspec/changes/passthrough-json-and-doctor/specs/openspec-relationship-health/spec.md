## ADDED Requirements

### Requirement: Doctor folds OpenSpec's relationship report on every root

`cospec doctor` SHALL run the wrapped `openspec doctor --json` on every
operating root — a plain local root included — and, for a store-backed root,
`openspec store doctor --json`, folding the returned root, store, reference and
top-level `status[]` diagnostics into cospec's own findings without attempting
any repair. Existing `cospec doctor` findings and exit-1-on-ERROR semantics
SHALL be unchanged. The `--json` document SHALL carry the binary's `root`,
`store`, `references` and `status` keys at its top level, beside `version`,
`findings` and `summary`, with the values the binary emitted for the same root;
the only bytes that differ are the binary's own remedy sentences in their
`message` and `fix` fields, spelled through cospec from the pinned binary's
allowlist. When cospec's own `initialized` check already reports that the
working directory has no OpenSpec root, the binary's no-root diagnostic SHALL be
carried in `status` and SHALL NOT be folded a second time into `findings`.

`cospec doctor` SHALL read the project config the way the binary does —
`openspec/config.yaml`, else `openspec/config.yml` — for its own `config` check.
Its own checks SHALL target the operating root the resolver selects for the
directory: run from a subdirectory of a project, the enclosing root the resolver
walks to, as `openspec doctor` does, and for a declared `store:` pointer or the
global `defaultStore`, the store that selection resolves to. With no root
selected its own checks SHALL NOT run: a directory with no root gets the one
`initialized` ERROR, and a selection that fails for any other reason is reported
by the binary's folded diagnostic alone. For an explicit `--store <id>` its own
checks SHALL read the invocation directory, not the store: run from a bare
workspace with no `openspec/`, `cospec doctor --store <id>` reports the
`initialized` ERROR and exits 1 where `openspec doctor --store <id>` exits 0.
Each line the delegated `openspec doctor --json` writes to stderr (its config
warnings, such as `Invalid 'context' field in config (must be string)`) that
cospec did not already print itself SHALL be one `openspec-stderr` WARNING
finding, its text spelled through the allowlist, so the text report prints it
and the `--json` document carries it; cospec's stderr SHALL NOT repeat it. When
the delegated call cannot be read, the WARNING finding's remedy SHALL name
`cospec doctor`, never a bare `openspec` command.

This requirement replaces "Doctor surfaces openspec root-relationship and store
health", whose rule that a plain local root omits the delegated section was the
defect. Its three surviving scenarios are carried over verbatim below.

#### Scenario: Doctor reports store metadata and git facts

- **WHEN** `cospec doctor` runs against a store-backed repo
- **THEN** the report includes a section with the delegated
  `openspec doctor --json` store metadata and git facts, folded into cospec's
  findings

#### Scenario: Doctor surfaces a broken references pointer

- **WHEN** `cospec doctor` runs against a repo whose `references:` entry points
  at a missing or invalid root
- **THEN** the delegated openspec diagnostic for the broken reference is
  surfaced in cospec's report and the command exits 1

#### Scenario: Stray openspec config profile is noted

- **WHEN** `cospec doctor` detects a stray native OpenSpec `config.yaml` profile
  or `workflows` block in the resolved root
- **THEN** the report includes a note-level finding stating the profile is
  superseded by cospec's canon + harness model, without exiting non-zero on that
  finding alone

#### Scenario: A plain local root carries upstream's report keys

- **WHEN** `cospec doctor --json` and `openspec doctor --json` run on the same
  plain local root with no store and no `references:`
- **THEN** cospec's document has `root`, `store`, `references` and `status`
  equal to the binary's, alongside `version`, `findings` and `summary`

#### Scenario: A references list in config.yml is read

- **WHEN** `cospec doctor` runs on a root whose only config file is
  `openspec/config.yml`, declaring a reference to an unregistered store
- **THEN** the binary's `reference_unresolved` diagnostic is a finding and
  appears under `references`, as `openspec doctor` reports it

#### Scenario: Folded remedies name cospec

- **WHEN** `cospec doctor`, text or `--json`, folds a diagnostic whose fix is
  `Run: openspec store doctor <id>` or
  `Get a checkout from a teammate and run: openspec store register <path> --id <id>`
- **THEN** the finding's remedy and the carried `fix` read `cospec store …`, the
  id and path unchanged, and no bare `openspec` command is printed

#### Scenario: No root is reported once

- **WHEN** `cospec doctor --json` runs in a directory with no OpenSpec root
- **THEN** `findings` has the one `initialized` ERROR, `status` carries the
  binary's no-root diagnostic with `cospec init` in its fix, and the command
  exits 1

#### Scenario: Doctor from a subdirectory diagnoses the enclosing root

- **WHEN** `cospec doctor` runs from a subdirectory of an initialized project
- **THEN** it reports on the enclosing project, with no `initialized` ERROR, as
  `openspec doctor` reports the same root

#### Scenario: Doctor on a pointer or defaultStore root diagnoses the store

- **WHEN** `cospec doctor --json` runs in a project whose `openspec/config.yaml`
  declares `store: <id>` (or one of its subdirectories), or in a rootless
  directory whose global config sets `defaultStore: <id>`, for an initialized
  store
- **THEN** `root.source` is the binary's (`declared`, `global_default`), the
  four keys equal the binary's, cospec's own checks report no ERROR on the
  store, and the exit code is the binary's

#### Scenario: Doctor folds OpenSpec's stderr config warnings

- **WHEN** `cospec doctor` or `cospec doctor --json` runs on a plain, pointer or
  `--store` root whose config has an invalid `context` or `references` field
- **THEN** each line `openspec doctor --json` writes to stderr on the same
  fixture is one `openspec-stderr` WARNING finding, in order, and none reaches
  cospec's stderr
- **AND** a line cospec's root selection already printed (an ignored `store:`
  pointer, an unparseable global config) is printed once and never folded

## REMOVED Requirements

- `### Requirement: Doctor surfaces openspec root-relationship and store health`
