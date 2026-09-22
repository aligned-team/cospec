## MODIFIED Requirements

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
