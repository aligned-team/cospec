# Spec Delta

## MODIFIED Requirements

### Requirement: Status answers a schema cospec does not type from the binary

For a change whose schema is not a cospec type (a forked or project schema,
`spec-driven`, or a name that resolves nowhere), `cospec status` SHALL call the
wrapped `openspec status --change <id> --json`, or `--all --json` for a sweep,
once. In text mode it SHALL render that document the way the binary renders it,
with its `Next:` line spelled through cospec. Under `--json` it SHALL merge the
document into cospec's `{change, type, legacy: true}` entry. The command SHALL
exit with the binary's outcome: an unknown schema exits 1 in both modes. A
change directory without `.openspec.yaml` SHALL take its schema as the binary
does, from the root's `config.yaml` `schema:` and else `spec-driven`, at
`schemaVersion` 1; where that config exists but cannot be read or parsed, it
SHALL take `spec-driven` as the binary does and print the binary's
`Warning: could not parse <path> (<detail>); ignoring it.` line on stderr once.
No output SHALL name a bare `openspec` command.

#### Scenario: A forked schema gets real status

- **WHEN** `cospec status --change legacy-one` runs on a change whose schema is
  a project fork
- **THEN** the output lists the fork's artifacts with their state and a
  `Next: cospec instructions …` line, and names no bare `openspec` command

#### Scenario: An unknown schema fails under --json

- **WHEN** `cospec status --change ghost --json` runs on a change whose schema
  resolves nowhere
- **THEN** the document carries the binary's `Unknown schema` diagnostic and the
  command exits 1

#### Scenario: A hand-made change is typed by config.yaml

- **WHEN** `cospec status --change bare-dir --json` runs on a directory holding
  only `proposal.md` in a root whose `config.yaml` says `schema: feat`
- **THEN** the entry is a `feat` change graded at `schemaVersion` 1, and its
  `schemaName` is `feat` as the binary reports

#### Scenario: A hand-made change under a broken config falls back with the binary's warning

- **WHEN** `cospec status --change bare-dir` runs on a directory holding only
  `proposal.md` in a root whose `config.yaml` does not parse as YAML
- **THEN** the change is reported on `spec-driven`, as the binary reports it,
  stderr carries `Warning: could not parse <path> (<detail>); ignoring it.`
  once, and the command exits 0
