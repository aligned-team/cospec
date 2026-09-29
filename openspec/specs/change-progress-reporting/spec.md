# change-progress-reporting Specification

## Purpose

Governs how cospec reports progress across changes: `cospec status --all` sweeps
every active change in one call without letting one bad change abort the rest,
and cospec's own task accounting stays provably consistent with the task totals
re-emitted from the wrapped `openspec instructions apply --json` payload.

## Requirements

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

Detection of a checkbox-like task line SHALL cover every CommonMark list marker
— `-`, `*`, `+`, `<N>.` and `<N>)` — so a task written with a non-canonical
marker is reported as `tasks/checkbox-grammar`, with a `corrected:` hint
carrying the canonical rewrite, rather than dropped from the parse and counted
toward neither the completed nor the total count. A line whose bracketed span is
immediately followed by `(` or `[` is a markdown link, not a checkbox, and SHALL
NOT be reported. The conforming task grammar itself is unchanged:
`- [ ] <N>.<M> ...` remains the single canonical form.

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

#### Scenario: A non-canonical list marker is reported, not dropped

- **WHEN** `tasks.md` contains an unchecked task written `+ [ ] 1.1 do the work`
  or `1. [ ] 1.1 do the work`
- **THEN** cospec emits `tasks/checkbox-grammar` for that line with a
  `corrected:` hint of `- [ ] 1.1 do the work`, and `cospec archive` refuses the
  change instead of reporting its tasks complete

#### Scenario: A markdown link bullet is not a task

- **WHEN** `tasks.md` contains the line `- [Some doc](./doc.md)`
- **THEN** no `tasks/checkbox-grammar` issue is emitted for that line and it is
  counted as neither a complete nor an incomplete task

### Requirement: Wrapped apply advisories are declared and relayed

`cospec apply` SHALL declare, rather than pass through untyped, the advisory
fields the wrapped `openspec instructions apply --json` payload carries:
`warnings`, a list of non-blocking observations about the change, and
`missingPrerequisites`, the wrapped binary's own view of what the change still
needs. Both SHALL be optional, because a wrapped binary at the low end of the
accepted range emits neither.

Both fields SHALL be advisory only. Neither SHALL move `cospec apply`'s exit
code, and neither SHALL introduce a block: cospec's own apply gate runs first
and decides the outcome, so `missingPrerequisites` is a superset of cospec's
`missingArtifacts` rather than a competing verdict. Where cospec's own
`skip_specs` precedence has already decided a change correctly skips specs, a
contradicting wrapped warning about the same marker SHALL NOT change that
decision.

`warnings` SHALL reach the human transcript as well as `--json`, so a reader of
the human run sees the same advisories an agent reading `--json` sees.

#### Scenario: Warnings are declared and relayed on both surfaces

- **WHEN** `cospec apply --json` runs on a change the wrapped binary warns about
- **THEN** the document carries a typed `warnings` array, the same warnings
  appear in the human transcript, and the exit code is `0`

#### Scenario: Missing prerequisites never add a block

- **WHEN** `cospec apply --json` runs on a change missing several artifacts
- **THEN** the wrapped `missingPrerequisites` is a superset of cospec's own
  `missingArtifacts`, and the exit code is the one cospec's own gate decided

#### Scenario: cospec's skip_specs precedence still wins

- **WHEN** a change cospec considers correctly specs-skipping is applied, and
  the wrapped payload warns about the same marker
- **THEN** the warning is relayed as an advisory and cospec's precedence
  decision is unchanged

#### Scenario: A wrapped binary that emits neither field is tolerated

- **WHEN** the resolved wrapped binary predates these fields
- **THEN** `cospec apply --json` omits them rather than emitting empty arrays or
  failing to parse the payload

### Requirement: Ambiguous task numbering warns

For a cospec-typed change, `cospec validate` SHALL report two task-numbering
WARNINGs over `tasks.md`, ported from the wrapped binary's
`findTaskNumberingIssues`. `tasks/id-mismatch` SHALL fire on a task whose id's
leading group number differs from its enclosing `## N.` heading's number, with
leading zeros normalised on both sides. `tasks/id-duplicate` SHALL fire on every
later declaration of a task id that an earlier task already declared, naming the
line of the first declaration.

A task id SHALL be read by the exported `TASK_NUM_RE` of `core/tasks.ts`, with
the binary's task-id shape: at least two dot-separated number groups and an
optional letter suffix, followed by whitespace or end of text (`1.2`, `1.2.3`,
`1.3a`). So `1.2.3` and `1.2.4` are two ids, not two copies of `1.2`. Numbering
SHALL be read only inside a `## N.` group. Any other level-two heading ends the
group, a task outside every group SHALL NOT be checked, and a file with no
`## N.` heading SHALL be skipped entirely. Lines inside a fenced code block
SHALL NOT be read as tasks.

Both rules SHALL be WARNINGs, so `cospec validate --strict` fails on them. A
legacy-lane change keeps receiving the wrapped binary's own numbering WARNINGs
through delegation, and cospec SHALL NOT run these rules there.

#### Scenario: A task under the wrong group warns

- **WHEN** a cospec-typed change's `tasks.md` has `- [ ] 2.1 Wrong group` under
  `## 1. Impl`
- **THEN** `cospec validate` reports `tasks/id-mismatch` at WARNING on that
  line, and `cospec validate --strict` exits 1

#### Scenario: A duplicated task id warns

- **WHEN** `- [ ] 1.1 Do it` appears twice under `## 1. Impl`
- **THEN** `tasks/id-duplicate` is a WARNING on the second line, naming the
  first line

#### Scenario: Deeper ids are distinct

- **WHEN** `- [ ] 1.2.3 Deep` and `- [ ] 1.2.4 Deep sibling` sit under
  `## 1. Impl`
- **THEN** neither `tasks/id-duplicate` nor `tasks/id-mismatch` is raised

#### Scenario: A leading zero is not a mismatch

- **WHEN** `- [ ] 01.1 Padded` sits under `## 1. Impl`
- **THEN** no `tasks/id-mismatch` is raised

#### Scenario: Tasks outside a numbered group are ignored

- **WHEN** a task `- [ ] 3.1 Stray` sits under an unnumbered `## Notes` heading
  that follows `## 1. Impl`
- **THEN** no task-numbering issue is raised for it

#### Scenario: A legacy change is not double-reported

- **WHEN** a `spec-driven` change's `tasks.md` has a mismatched and a duplicated
  task id
- **THEN** the report carries the wrapped binary's two WARNINGs and no
  `tasks/id-mismatch` or `tasks/id-duplicate`
