# Spec Delta

## ADDED Requirements

### Requirement: Dynamic completion stays inside a startup budget

`cospec __complete` SHALL load only the modules completion needs, record no
telemetry, and SHALL have its startup time measured against a recorded budget by
an advisory CI benchmark that reports but never gates.

#### Scenario: Tab press

- **WHEN** the benchmark runs `cospec __complete changes` 20 times
- **THEN** the median is reported against the recorded budget, and an overrun is
  surfaced in the benchmark report without failing CI
