# Spec Delta

## ADDED Requirements

### Requirement: init declares --profile and --language

`init` SHALL declare upstream's `--profile <profile>` (values `core` and
`custom`) and `--language <language>` as handled flags in the command table,
with no pending marking, and the two corresponding entries SHALL NOT appear in
`apps/cli/test/contract/parity-pending.yaml`. Their behaviour is the
`workflow-profiles` capability's.

#### Scenario: The flags are handled

- **WHEN** `cospec init --profile core --help` and the reachability test run
- **THEN** `--profile` and `--language` are listed in `init`'s help from the
  table, and the reachability test resolves both to the table alone

### Requirement: The parity pending list is empty

Once every change that owned a pending surface has landed, the reachability test
SHALL assert that `apps/cli/test/contract/parity-pending.yaml` holds no entry,
and every negative case that needs a pending entry SHALL build it on a synthetic
table row, not on a real surface, so that closing a surface never breaks a test
that was only using it as a fixture.

#### Scenario: A leftover entry fails

- **WHEN** `parity-pending.yaml` holds any entry
- **THEN** the reachability test fails naming it

#### Scenario: The docs page renders an empty list

- **WHEN** the docs data loader reads an empty `parity-pending.yaml`
- **THEN** the build succeeds and the page shows no capabilities as still being
  implemented
