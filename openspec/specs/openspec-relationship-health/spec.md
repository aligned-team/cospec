# openspec-relationship-health Specification

## Purpose

cospec's `doctor` surfaces OpenSpec's cross-repo relationship health as a single
read-only section. On every root, `cospec doctor` delegates
`openspec doctor --json` (and, for a store-backed root,
`openspec store doctor --json`), folds the returned root-relationship,
reference-resolution, and store/git diagnostics into cospec's findings — never
repairing anything — and carries OpenSpec's `root`, `store`, `references` and
`status` keys in its own `--json` document; it also notes a stray OpenSpec
config profile/workflows block that cospec's canon/harness supersedes.

## Requirements

### Requirement: Doctor folds OpenSpec's relationship report on every root

`cospec doctor` SHALL run the wrapped `openspec doctor --json` on every
operating root, a plain local root included, plus `openspec store doctor --json`
for a store-backed root, folding the returned root, store, reference and
top-level `status[]` diagnostics into its findings, repairing nothing. Its own
checks SHALL target the root the resolver selects, never the invocation
directory, and read the config as the binary does. Existing findings and
exit-1-on-ERROR semantics SHALL be unchanged.

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

#### Scenario: Doctor with an explicit --store diagnoses the store

- **WHEN** `cospec doctor --store <id>` or `cospec doctor --store <id> --json`
  runs, for an initialized store, from a bare workspace with no `openspec/`,
  from a subdirectory of one, or from inside another project
- **THEN** `root.source` is the binary's (`store`), the four keys equal the
  binary's, cospec's own checks read the store and report no ERROR (no
  `initialized` ERROR, nothing about the other project), and the exit code is
  the binary's, 0

#### Scenario: Doctor folds OpenSpec's stderr config warnings

- **WHEN** `cospec doctor` or `cospec doctor --json` runs on a plain, pointer or
  `--store` root whose config has an invalid `context` or `references` field
- **THEN** each line `openspec doctor --json` writes to stderr on the same
  fixture is one `openspec-stderr` WARNING finding, in order, and none reaches
  cospec's stderr
- **AND** a line cospec's root selection already printed (an ignored `store:`
  pointer, an unparseable global config) is printed once and never folded

#### Scenario: The JSON document carries the binary's report keys

- **WHEN** `cospec doctor --json` runs on any root
- **THEN** the document carries the binary's `root`, `store`, `references` and
  `status` keys at top level beside `version`, `findings` and `summary`, with
  the values the binary emitted for that root, except the binary's remedy
  sentences in `message` and `fix`, which are spelled through cospec from the
  pinned binary's allowlist

#### Scenario: The no-root diagnostic is not folded twice

- **WHEN** cospec's `initialized` check already reports no OpenSpec root
- **THEN** the binary's no-root diagnostic is carried in `status` and not folded
  again into `findings`

#### Scenario: The config is read as the binary reads it

- **WHEN** cospec's own `config` check runs
- **THEN** it reads `openspec/config.yaml`, else `openspec/config.yml`

#### Scenario: Own checks follow the resolver's selection

- **WHEN** `cospec doctor` runs from a project subdirectory, or with an explicit
  `--store <id>`, a declared `store:` pointer or the global `defaultStore`
- **THEN** its own checks target the enclosing root the resolver walks to, or
  the store that selection resolves to, so `cospec doctor --store <id>` from a
  bare workspace with no `openspec/`, from its subdirectory or from inside
  another project checks the store and exits as `openspec doctor --store <id>`
  does

#### Scenario: No selected root runs no own checks

- **WHEN** no root is selected
- **THEN** cospec's own checks do not run: a directory with no root gets the one
  `initialized` ERROR, and a selection that fails for any other reason is
  reported by the binary's folded diagnostic alone

#### Scenario: Delegated stderr lines become findings once

- **WHEN** the delegated `openspec doctor --json` writes a line to stderr that
  cospec did not already print, such as
  `Invalid 'context' field in config (must be string)`
- **THEN** it becomes one `openspec-stderr` WARNING finding, its text spelled
  through the allowlist, printed by the text report and carried by `--json`, and
  cospec's stderr does not repeat it

#### Scenario: An unreadable delegated call names cospec in its remedy

- **WHEN** the delegated doctor call cannot be read
- **THEN** the resulting WARNING finding's remedy names `cospec doctor`, never a
  bare `openspec` command
