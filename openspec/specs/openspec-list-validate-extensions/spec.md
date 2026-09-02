# openspec-list-validate-extensions Specification

## Purpose

cospec closes the spec-listing and bulk-validation gaps in its existing commands
without adding new surface. `cospec list --specs` delegates to
`openspec list --specs` and renders a spec/requirement-count table;
`cospec validate --all|--specs|--changes` delegates the spec and bulk paths to
`openspec validate` while keeping single-change validation on cospec's own
change-centric rules, preserving current exit-code semantics (any failed item
exits 1).

## Requirements

### Requirement: List --specs enumerates capability specs

`cospec list --specs` SHALL delegate to `openspec list --specs --json` and
render the resulting capability specs as a typed table (or `--json` passthrough
of the parsed result), alongside the existing changes-only `cospec list`
behavior which SHALL be unchanged when `--specs` is absent.

#### Scenario: List --specs renders capability specs

- **WHEN** `cospec list --specs` runs in a repo with capability specs under
  `openspec/specs/`
- **THEN** the command renders one row per capability spec, delegated from
  `openspec list --specs --json`

#### Scenario: Default list behavior is unchanged

- **WHEN** `cospec list` runs without `--specs`
- **THEN** the command's changes-only table output is unchanged from before this
  change

### Requirement: Validate bulk and standalone-spec modes

`cospec validate` SHALL accept `--all`, `--specs`, and `--changes` flags that
delegate the bulk and standalone-spec validation paths to `openspec validate`,
merging delegated spec issues into cospec's existing issue-reporting shape via
the existing delegated-issue mapping. Single-change validation (no bulk flag)
SHALL continue to run cospec's own rules unchanged. A bulk run SHALL exit 1 if
the delegated call reports any failed item.

#### Scenario: Validate --specs delegates and surfaces spec issues

- **WHEN** `cospec validate --specs` runs against a repo with an invalid
  capability spec
- **THEN** the command delegates to `openspec validate --specs` and surfaces the
  resulting spec issue in cospec's issue-reporting shape, exiting 1

#### Scenario: Validate --all aggregates changes and specs

- **WHEN** `cospec validate --all` runs
- **THEN** the command aggregates cospec's own change-rule results with
  delegated spec/bulk results from `openspec validate --all` into one report

#### Scenario: Single-change validation is unaffected

- **WHEN** `cospec validate <change-slug>` runs without any bulk flag
- **THEN** the command's existing single-change rule-and-delegation behavior is
  unchanged

### Requirement: Validate --archived delegates archived-change validation

`cospec validate` SHALL accept `--archived`, which validates archived changes by
pure delegation to `openspec validate --archived`, threading the resolved root's
store arguments and the non-interactive/JSON flags the other delegated modes
use. cospec's own change-centric rules SHALL NOT run for this mode, since they
are written against active changes. The delegated envelope SHALL be rendered
through cospec's existing issue-reporting shape, and the run SHALL exit 1 when
the delegated call reports any failed item. Single-change and bulk validation
behavior SHALL be unchanged when `--archived` is absent.

#### Scenario: An invalid archived change is surfaced

- **WHEN** `cospec validate --archived --json` runs in a repo whose archive
  contains a change with an incomplete task list
- **THEN** the delegated ERROR is surfaced in cospec's issue-reporting shape and
  the command exits 1

#### Scenario: A clean archive passes

- **WHEN** `cospec validate --archived` runs against an archive with no issues
- **THEN** the command reports no issues and exits 0

#### Scenario: Other validate modes are unchanged

- **WHEN** `cospec validate <slug>`, `cospec validate --specs`, and
  `cospec validate --all` run
- **THEN** their behavior and exit codes are unchanged from before this change

#### Scenario: An older runtime relays a clean error

- **WHEN** the resolved wrapped binary predates `validate --archived`
- **THEN** cospec relays the wrapped unknown-flag error and exits non-zero
  rather than reporting a clean archive
