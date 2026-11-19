# Spec Delta

## MODIFIED Requirements

### Requirement: Delivery selects the surface a workflow is written to

A global `delivery` key SHALL select where workflows are written: `skills`,
`commands` or `both` (any other value, or unset). Each harness row is
`adapter-backed` (has a command surface), `skills-invocable` (`codex`, `warp`)
or `none`; skills SHALL be generated unless delivery is `commands` and the row
is not `skills-invocable`, commands only for `adapter-backed` rows unless
delivery is `skills`. A switch SHALL remove the dropped surface's managed files,
the workflow staying installed.

#### Scenario: Skills only

- **WHEN** the global config holds `{"delivery": "skills"}` and
  `cospec init --harness claude` runs
- **THEN** the twelve skills are written, no `.claude/commands/cospec/` file
  exists, and no skill body names a `/cospec:` command

#### Scenario: Commands only

- **WHEN** the global config holds `{"delivery": "commands"}` and
  `cospec init --harness claude` runs
- **THEN** the twelve commands are written and no `.claude/skills/cospec-*`
  directory exists

#### Scenario: Switching moves the files both ways

- **WHEN** a repo initialised with `both` is updated under `skills`, and then
  under `commands`, and then under `both`
- **THEN** each step removes only cospec-managed files of the dropped surface,
  keeps every workflow installed, and the last step restores both surfaces

#### Scenario: A skills-only row under commands writes nothing

- **WHEN** delivery is `commands` and `cospec init --harness agents` runs
- **THEN** no skill is written and the receipt names `agents` in the line above

#### Scenario: Codex keeps its skills under commands

- **WHEN** delivery is `commands` and `cospec init --harness codex` runs
- **THEN** the skills under `.agents/skills` are written

#### Scenario: Skills delivery details

- **WHEN** delivery is `skills`, or several selected rows share a skills root
- **THEN** an `adapter-backed` row's skill bodies are spelled with skill
  references, and shared-root skills are generated when any sharing row
  generates them

#### Scenario: A row that generates nothing is named

- **WHEN** a row generates nothing under `commands`
- **THEN** the receipt names it with
  `No skills or commands were generated for <names>: delivery is set to 'commands' but it supports only skills. Run 'cospec config set delivery both' to generate skills.`
