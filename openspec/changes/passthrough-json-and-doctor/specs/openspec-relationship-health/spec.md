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
Run from a subdirectory of a project, its own checks SHALL target the enclosing
root the resolver walks to, as `openspec doctor` does. When the delegated call
cannot be read, the WARNING finding's remedy SHALL name `cospec doctor`, never a
bare `openspec` command.

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

## REMOVED Requirements

- `### Requirement: Doctor surfaces openspec root-relationship and store health`
