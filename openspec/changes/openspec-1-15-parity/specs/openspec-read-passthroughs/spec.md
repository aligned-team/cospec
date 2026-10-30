# Spec Delta

## MODIFIED Requirements

### Requirement: Show and view are disciplined read-only passthroughs

`cospec show <item>` SHALL wrap `openspec show` for both changes and specs,
forwarding `--type`/`--json`/`--deltas-only`/`--requirements`/
`--no-scenarios`/`-r` and `--store`. On `--json`, the command SHALL verify the
wrapped call emitted exactly one parseable JSON document before returning
success. `cospec view` SHALL be cospec's native dashboard (see "View dashboard
shows workflow and gate state"), not a passthrough, and SHALL exit 1 if no
`openspec/` root resolves.

#### Scenario: Show a change as JSON

- **WHEN** `cospec show <change> --json` runs on an existing change
- **THEN** stdout is exactly one JSON document containing at least `id` and
  `deltas`

#### Scenario: Show a spec's requirements

- **WHEN** `cospec show <spec> --json --requirements` runs on an existing
  capability spec
- **THEN** stdout is exactly one JSON document containing that spec's
  requirements

#### Scenario: Ambiguous or unknown item surfaces exit 1

- **WHEN** `cospec show <name>` is given a name that does not resolve to exactly
  one change or spec
- **THEN** the command exits 1 and does not emit a malformed or partial JSON
  document on `--json`

## ADDED Requirements

### Requirement: View dashboard shows workflow and gate state

`cospec view` SHALL list only active changes in its main section and archived
changes in a separate section. Each active change SHALL show its schema and
which artifacts are done, ready, blocked, or skipped, plus cospec's gate state,
verification-ledger progress, and archive readiness. Progress bars SHALL align
for names up to 48 characters.

#### Scenario: Archived changes kept out of the way

- **WHEN** a project has 3 active and 40 archived changes
- **THEN** the active section lists 3 changes and the archived section is shown
  separately

#### Scenario: Workflow load failure

- **WHEN** a change's schema cannot be loaded
- **THEN** that change still shows task progress and names the load failure

#### Scenario: Gate state column

- **WHEN** an active change has an unshipped `Blocked by` entry
- **THEN** its row shows `blocked` and `archiveReady` is false

### Requirement: Show JSON names requirements and scenarios

`cospec show --json` SHALL include each requirement's and scenario's `name`,
matching the header names archive uses.

#### Scenario: Cite without reparsing

- **WHEN** `cospec show <capability> --json` is read
- **THEN** each requirement object carries `name` equal to its
  `### Requirement:` header text
