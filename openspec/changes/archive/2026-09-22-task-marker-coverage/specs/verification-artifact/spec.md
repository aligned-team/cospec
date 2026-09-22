## MODIFIED Requirements

### Requirement: Verification artifact grammar and location

cospec SHALL define a machine-parsed `verification` artifact that generates
`verification.md` at the change root — never under a directory named `specs/` —
and SHALL parse it with the existing checkbox lexer: groups written
`## <N>. <behavior description>` with an optional trailing `[critical]`, and
rows written `- [<state>] <N>.<M> @<layer> [(<owner>)] <probe> -> <result>`,
where `<state>` is one of a space (planned), `x` (verified), or `~` (deferred).

Detection of a checkbox-like row SHALL cover every CommonMark list marker — `-`,
`*`, `+`, `<N>.` and `<N>)` — so a row written with a non-canonical marker is
reported as `verification/row-grammar` rather than dropped from the parse. A
line whose bracketed span is immediately followed by `(` or `[` is a markdown
link, not a checkbox, and SHALL NOT be reported. The conforming row grammar
itself is unchanged: `- [<state>] <N>.<M> ...` remains the single canonical
form.

#### Scenario: Well-formed verification file parses

- **WHEN** `cospec validate` runs on a change whose `verification.md` has at
  least one group, each group has at least one grammatical row, and every row
  names a known layer
- **THEN** no `verification/*` issue is emitted for that file

#### Scenario: Missing declared verification file

- **WHEN** a change's schema declares `verification` in `apply.requires` but no
  `verification.md` exists at the change root
- **THEN** cospec emits `verification/missing`

#### Scenario: Structure requires at least one group and row

- **WHEN** `verification.md` has zero groups, or a group with zero rows
- **THEN** cospec emits `verification/structure`

#### Scenario: Malformed row fails the grammar

- **WHEN** a row line cannot be parsed into the state, number, layer, optional
  owner, probe, and `->` result shape
- **THEN** cospec emits `verification/row-grammar` with the offending line

#### Scenario: Verification file is never placed under specs/

- **WHEN** the artifact table resolves the `generates` path for `verification`
- **THEN** the path resolves to the change root and no segment is literally
  `specs`, so the pinned openspec binary's hardcoded `CHANGE_NO_DELTAS` rule —
  behavior cospec has relied on since 1.3.1 — is never tripped

#### Scenario: A non-canonical list marker is reported, not dropped

- **WHEN** `verification.md` contains a row written
  `+ [ ] 1.1 @unit probe -> result` or `1. [ ] 1.1 @unit probe -> result`
- **THEN** cospec emits `verification/row-grammar` for that line, and the
  archive verdict counts it as a blocker instead of reporting `0/0 verified`

#### Scenario: A markdown link bullet is not a verification row

- **WHEN** `verification.md` contains the line `- [Some doc](./doc.md)`
- **THEN** no `verification/row-grammar` issue is emitted for that line
