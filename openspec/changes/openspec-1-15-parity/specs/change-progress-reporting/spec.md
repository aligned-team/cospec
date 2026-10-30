# Spec Delta

## ADDED Requirements

### Requirement: Workflow follow-up section is not tracked

cospec's task parser SHALL stop tracking checkboxes at a `## Workflow follow-up`
heading in `tasks.md` and resume at the next `## ` heading, exactly as the
pinned binary counts them, so the apply gate, archive task gate, `status`, and
`list` progress agree with the delegated archive.

#### Scenario: Follow-up bullets do not block archive

- **WHEN** every tracked task is checked and `## Workflow follow-up` holds
  unchecked bullets
- **THEN** `cospec archive` does not refuse on incomplete tasks and `status`
  reports full progress

#### Scenario: Counts match the binary

- **WHEN** the differential test parses the same `tasks.md` through cospec and
  the pinned binary
- **THEN** both report identical completed and total counts

### Requirement: Apply relays task source locations

`cospec apply --json` SHALL carry each task's `sourcePath` and `line` from the
pinned binary's apply instructions, so an agent edits the exact checkbox even
when tasks span several files.

#### Scenario: Multi-file tasks

- **WHEN** a schema tracks tasks through a glob that matches two files
- **THEN** every task in `cospec apply --json` names its own file and 1-based
  line

### Requirement: Completed tasks lead to verify, not archive

When every tracked task is checked, `cospec apply` and `cospec status` SHALL say
the tracked tasks are complete and name `/cospec:verify` (and
`cospec validate <slug> --strict`) as the next step, and SHALL NOT call the
change ready to archive until the verification ledger also passes.

#### Scenario: Ledger still open

- **WHEN** all tasks are checked but a verification row is bare `[ ]`
- **THEN** the next step names verification and `archiveReady` is `false`
