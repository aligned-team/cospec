# Spec Delta

## ADDED Requirements

### Requirement: Version command reports both tools

`cospec version` SHALL print cospec's version, its install type (`npm-global`,
`npx`, `bunx`, `standalone`, `mise`, or `source`), and the wrapped OpenSpec
version with how it was resolved (`embedded` or `package`). It SHALL exit 0 and
SHALL make no network request without `--check`.

#### Scenario: Plain version report

- **WHEN** a user runs `cospec version` from the compiled standalone binary
- **THEN** it prints the cospec version, install type `standalone`, and the
  embedded OpenSpec version `1.15.0`, and exits 0

#### Scenario: Top-level --version is unchanged

- **WHEN** a user runs `cospec --version`
- **THEN** it still prints only cospec's bare version string

### Requirement: Version JSON keeps upstream's document shape

`cospec version --json` SHALL emit one document with upstream's `schemaVersion`,
`version`, and `install` keys, and with `--check` also its `update` object
(`status` of `available|current|disabled|offline`, `latest`, `command`,
`canSelfUpgrade`), describing cospec. cospec-only facts SHALL sit under a
non-colliding `openspec` key: `version`, `source`, `inRange`.

#### Scenario: Key oracle without check

- **WHEN** the key oracle compares `cospec version --json` with the pinned
  `openspec version --json`
- **THEN** no upstream key is missing and `openspec` carries the wrapped facts

#### Scenario: Key oracle with check

- **WHEN** the key oracle compares `cospec version --check --json` with
  `openspec version --check --json`
- **THEN** `update` carries every upstream key with upstream's status vocabulary

### Requirement: Version check reports update availability

`cospec version --check` SHALL read the latest cospec release from the npm
registry through an injectable endpoint, report `update.status` and an upgrade
`command` spelled for the detected install type, and SHALL degrade to `offline`
(unreachable, timeout, malformed answer) or `disabled`
(`COSPEC_NO_UPDATE_CHECK=1`) with exit 0.

#### Scenario: Update available

- **WHEN** the registry fixture answers with a newer version
- **THEN** `update.status` is `available` and `command` matches the install type

#### Scenario: Offline

- **WHEN** the registry fixture times out or answers malformed JSON
- **THEN** the local report still prints, `update.status` is `offline`, and the
  exit code is 0

#### Scenario: Wrapped binary out of range

- **WHEN** the resolved OpenSpec version falls outside `>=1.0.0 <2.0.0`
- **THEN** the report flags `openspec.inRange: false` and names the remedy
