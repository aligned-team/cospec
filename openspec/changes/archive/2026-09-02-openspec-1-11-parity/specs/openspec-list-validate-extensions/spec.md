## ADDED Requirements

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
