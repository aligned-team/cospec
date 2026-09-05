## MODIFIED Requirements

### Requirement: Workset group passthrough with a terminal-handover exec

`cospec workset create|list|remove` SHALL wrap the corresponding
`openspec workset` subcommand, preserving `--member`/`--tool`/`--yes`/`--json`
and the JSON one-document failure mirror. `cospec workset open` SHALL be a
terminal-handover exec, the founding member of cospec's **terminal-handover
class**: a wrapped call whose child owns the terminal because it spawns an
editor or drives an interactive prompt. Every member of that class SHALL
version-assert the wrapped binary first, spawn it with inherited stdio and
`shell: false` (array argv, no shell interpolation), propagate the child
process's exit code unchanged — including `130`, which the wrapped binary sets
when a prompt is cancelled — emit no JSON of its own, and declare no
`RunExpectation`, which is the documented exception to wrapped-call discipline
because inherited stdio leaves no captured stdout for a deny-list to inspect.
`cospec workset open` SHALL NOT thread `--json` or `--no-color`, matching
OpenSpec's own rejection of `--json` for that subcommand. The class's other
members are the interactive `cospec config` subcommands, whose obligations are
specified by the config passthrough capability.

#### Scenario: Create then list shows the workset

- **WHEN** `cospec workset create <name>` succeeds and is followed by
  `cospec workset list --json`
- **THEN** the JSON list includes an entry for `<name>`

#### Scenario: Remove without confirmation is refused

- **WHEN** `cospec workset remove <name>` runs non-interactively without `--yes`
- **THEN** the command refuses and exits non-zero without deleting the workset

#### Scenario: Open propagates the child's exit code

- **WHEN** `cospec workset open <name>` is invoked
- **THEN** the command spawns `openspec workset open <name>` with inherited
  stdio and exits with exactly the child process's exit code

#### Scenario: A handover call declares no run expectation

- **WHEN** any terminal-handover member is invoked
- **THEN** it asserts the wrapped binary's version, spawns with inherited stdio
  and `shell: false`, declares no `RunExpectation`, and emits no JSON document
  of its own
