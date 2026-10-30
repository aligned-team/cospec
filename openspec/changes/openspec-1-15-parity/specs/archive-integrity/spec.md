# Spec Delta

## ADDED Requirements

### Requirement: Spec writes preserve line endings

Every spec write cospec performs or verifies, including `sync-specs` scratch
merges and archive post-conditions, SHALL keep a file's dominant line ending,
and SHALL write a new spec with LF.

#### Scenario: CRLF spec

- **WHEN** a change modifies one requirement in a CRLF living spec
- **THEN** after `cospec archive` the spec is still CRLF and the diff touches
  only that requirement

### Requirement: Retirement cleanup failure is reported precisely

When the delegated archive moves a change but capability-retirement cleanup
fails, `cospec archive` SHALL report that the change was archived and cleanup
did not complete, and `--json` SHALL carry `archive_retirement_cleanup_failed`.

#### Scenario: Cleanup failure

- **WHEN** retirement cleanup fails after the move
- **THEN** cospec verifies the move on disk, still fans out blocker sync, and
  exits nonzero with that code
