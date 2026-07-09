# openspec-relationship-health Specification

## Purpose

cospec's `doctor` surfaces OpenSpec's cross-repo relationship health as a single
read-only section. When the resolved root is store-backed or declares
`references:`, `cospec doctor` delegates `openspec doctor --json` (and, for a
store-backed root, `openspec store doctor --json`) and folds the returned
root-relationship, reference-resolution, and store/git diagnostics into cospec's
findings — never repairing anything — and notes a stray OpenSpec config
profile/workflows block that cospec's canon/harness supersedes.

## Requirements

### Requirement: Doctor surfaces openspec root-relationship and store health

`cospec doctor` SHALL add a delegated, read-only section that, when the resolved
root is store-backed or the repo declares a `references:` entry, runs
`openspec doctor --json` and folds its `status[]` diagnostics into cospec's own
findings, without attempting any repair. When the resolved root is a plain local
repo with no store or `references:` pointer, this section SHALL be omitted.
Existing `cospec doctor` findings and exit-1-on-ERROR semantics SHALL be
unchanged.

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

#### Scenario: Plain local repo omits the relationship section

- **WHEN** `cospec doctor` runs against a repo with no store and no
  `references:` entry
- **THEN** the report contains no delegated relationship/store-health section

#### Scenario: Stray openspec config profile is noted

- **WHEN** `cospec doctor` detects a stray native OpenSpec `config.yaml` profile
  or `workflows` block in the resolved root
- **THEN** the report includes a note-level finding stating the profile is
  superseded by cospec's canon + harness model, without exiting non-zero on that
  finding alone
