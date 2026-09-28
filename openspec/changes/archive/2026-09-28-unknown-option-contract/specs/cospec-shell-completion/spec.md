# Spec Delta

## MODIFIED Requirements

### Requirement: Completion scripts are generated from cospec's own command table

`cospec completion [bash|zsh|fish]` SHALL print a shell completion script for
the `cospec` binary to stdout and exit 0, deriving every command name, summary,
positional source and flag from cospec's own command table
(`apps/cli/src/core/command-table.ts`) and the global-flag list rather than from
the wrapped binary's registry. The command SHALL have no side effects — it SHALL
NOT write to, read, or offer to modify any shell rc file — and SHALL NOT emit
any instruction that invokes bare `openspec`. Hidden command entries SHALL be
excluded from the generated script. Flags marked pending in the table SHALL be
excluded from completion until the change that implements them lands. Because
the completion spec, `--help` and the argv parser read the same table rows, a
flag the parser accepts SHALL always complete, and a flag that completes SHALL
always parse.

#### Scenario: Every non-hidden command appears in each shell's script

- **WHEN** `cospec completion bash`, `cospec completion zsh`, and
  `cospec completion fish` are generated
- **THEN** each script lists every non-hidden command in the table, lists no
  hidden entry, contains no `openspec` invocation, and per-command flags equal
  the table's handled and accepted-no-op flags for that command

#### Scenario: Generated scripts parse in their own shells

- **WHEN** each generated script is fed to its shell's syntax check
- **THEN** `bash -n`, `zsh -n`, and `fish --no-execute` all accept it without
  error

#### Scenario: Generating a script writes nothing

- **WHEN** `cospec completion zsh` runs
- **THEN** the script is written to stdout only, and no rc file or completion
  directory on disk is created or modified

#### Scenario: A pending flag does not complete

- **WHEN** a table row marks a flag pending
- **THEN** no generated script offers that flag, and it reappears in completion
  the moment its marking changes to handled
