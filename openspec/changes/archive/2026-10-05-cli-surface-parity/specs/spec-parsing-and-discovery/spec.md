# Spec Delta

## ADDED Requirements

### Requirement: Delegated duplicate matching is linear and covers quoted headers

Each `DUPLICATE_CLASSES` pattern SHALL match a delegated message in time linear
in the message's length, whatever text a spec author puts in a requirement
header. A pattern that reads a list of defect lines SHALL match the fixed head
once and then each line on its own, with no repeated group around a quantified
span. The `archive/target-invalid` pairing SHALL recognise a
structurally-invalid-target message whose quoted header text itself contains
`"`, so a header such as `### Requirement: Widget "quoted" name` is reported
once, by cospec's rule.

#### Scenario: A quoted header is reported once

- **WHEN** `cospec validate --json` runs on a change whose living spec
  duplicates `### Requirement: Widget "quoted" name`
- **THEN** the report carries cospec's `archive/target-invalid` ERROR and not
  the binary's structurally-invalid INFO for the same spec

#### Scenario: An adversarial message is matched quickly

- **WHEN** the dedupe runs on a structurally-invalid message of two hundred
  quote-heavy defect lines followed by a line that doesn't match
- **THEN** it finishes within the unit test's bound, a bound the previous
  pattern exceeds on the same input
