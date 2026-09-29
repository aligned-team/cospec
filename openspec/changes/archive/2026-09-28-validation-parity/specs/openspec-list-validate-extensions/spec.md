## ADDED Requirements

### Requirement: Each validation lane keeps its own severities

`cospec validate` SHALL give a finding the severity of the lane that owns the
change. A cospec-typed change SHALL keep cospec's severities, including where
cospec is stricter than the wrapped binary: `deltas/requirement-shape` stays an
ERROR for a body missing SHALL/MUST, where the binary warns. A legacy-lane
change, with a schema cospec does not type, SHALL receive every finding the
wrapped binary reports for it, at the binary's own level and with its message
unchanged, and cospec SHALL add no native rule from the change-rule families to
it.

A contract test SHALL act as the severity oracle for the legacy lane. On a
`spec-driven` fixture that trips the binary's SHALL/MUST, skipped-header,
empty-section, cross-section and task-numbering findings, every issue the pinned
binary reports SHALL appear in cospec's report with the same level and message,
and cospec SHALL report no further issue beyond its own classification INFO.

#### Scenario: Legacy-lane severities match the binary

- **WHEN** `cospec validate <change> --strict --json` runs on a `spec-driven`
  change and `openspec validate <change> --strict --json` runs on the same
  change
- **THEN** each of the binary's issues appears in cospec's report with the same
  level and message, and cospec adds only its legacy-schema INFO

#### Scenario: A cospec-typed change keeps cospec's severity

- **WHEN** a `feat` change's ADDED requirement body lacks SHALL/MUST
- **THEN** cospec reports `deltas/requirement-shape` at ERROR, not the binary's
  WARNING
