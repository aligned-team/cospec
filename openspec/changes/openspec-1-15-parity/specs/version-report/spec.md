# Spec Delta

## ADDED Requirements

### Requirement: Version command reports both tools

`cospec version` SHALL print cospec's version, its install type (`npm-global`,
`npx`, `bunx`, `standalone`, `mise`, or `source`), and the wrapped OpenSpec
version with how it was resolved (`embedded` or `package`). It SHALL exit 0 and
never spawn a network request without `--check`.

#### Scenario: Plain version report

- **WHEN** a user runs `cospec version` from the compiled standalone binary
- **THEN** it prints the cospec version, install type `standalone`, and the
  embedded OpenSpec version `1.15.0`, and exits 0

#### Scenario: Top-level --version is unchanged

- **WHEN** a user runs `cospec --version`
- **THEN** it still prints only cospec's bare version string

### Requirement: Version JSON document is additive over upstream

`cospec version --json` SHALL emit one JSON document carrying every key
`openspec version --json` emits for the same facts, plus cospec's own keys
`openspec.version`, `openspec.source`, and `openspec.inRange`.

#### Scenario: Key oracle

- **WHEN** the key oracle compares `cospec version --json` with
  `openspec version --json` from the pinned binary
- **THEN** no upstream key is missing and the cospec-only keys are present

### Requirement: Version check reports update availability

`cospec version --check` SHALL query the latest published cospec release and
report `current`, `latest`, and `updateAvailable`. A network failure SHALL be
reported as `check: unavailable` with exit 0, never as an error that hides the
local report.

#### Scenario: Update available

- **WHEN** the latest release is newer than the running version
- **THEN** `--check --json` reports `updateAvailable: true` and an upgrade
  command spelled for the detected install type

#### Scenario: Offline

- **WHEN** the release lookup fails
- **THEN** the local report still prints and the check is marked unavailable

#### Scenario: Wrapped binary out of range

- **WHEN** the resolved OpenSpec version falls outside `>=1.0.0 <2.0.0`
- **THEN** the report flags `openspec.inRange: false` and names the remedy
