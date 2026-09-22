# Spec Delta

## ADDED Requirements

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
