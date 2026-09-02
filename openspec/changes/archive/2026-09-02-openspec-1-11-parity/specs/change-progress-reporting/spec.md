## ADDED Requirements

### Requirement: Status sweeps every active change

`cospec status` SHALL accept `--all`, mutually exclusive with `--change`, which
computes the existing per-change status for every active change under the
resolved root, ordered by change id. A failure computing one change's status
SHALL NOT abort the sweep: that change SHALL appear as a failure entry carrying
its id and the error, and the command SHALL exit 1 while still emitting the
complete envelope. `--all --json` SHALL emit `{ changes: [...], root }`; text
mode SHALL render one blank-line-separated block per change. The single-change
output shape, both text and `--json`, SHALL be unchanged.

#### Scenario: Sweep lists every active change in id order

- **WHEN** `cospec status --all` runs in a repo with several active changes
- **THEN** one status block per change is rendered, ordered by change id

#### Scenario: One bad change does not abort the sweep

- **WHEN** one active change cannot have its status computed
- **THEN** the other changes are still reported, the bad change appears as a
  failure entry naming it, and the command exits 1

#### Scenario: Flags are mutually exclusive

- **WHEN** `cospec status --all --change <slug>` runs
- **THEN** the command reports the conflict and exits non-zero without computing
  any status

#### Scenario: Single-change output is unchanged

- **WHEN** `cospec status --change <slug> --json` runs
- **THEN** the emitted document is byte-identical to the shape emitted before
  this change

### Requirement: Task accounting agrees with the wrapped payload

cospec SHALL report one task total per `cospec apply --json` document. That
command re-emits the wrapped `openspec instructions apply --json` payload's
`progress`/`tasks` alongside cospec's own task accounting, and the two SHALL
agree on how a change's task rows are counted, so one document never reports two
different totals for the same `tasks.md`. Where cospec deliberately counts
differently from the wrapped binary, the divergence SHALL be documented and
covered by a contract test against the real binary rather than left implicit.

#### Scenario: One document, one task total

- **WHEN** `cospec apply --json` runs on a change whose `tasks.md` contains
  nested sub-task checkboxes
- **THEN** cospec's own task total and the re-emitted wrapped `progress.total`
  agree

#### Scenario: Counting is proven against the real binary

- **WHEN** the contract suite runs against the pinned openspec binary
- **THEN** a test asserts the agreement above on a fixture with nested
  checkboxes, so a future upstream change to the payload fails the suite instead
  of silently drifting
