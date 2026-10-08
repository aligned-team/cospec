# Spec Delta

## MODIFIED Requirements

### Requirement: completion generate is upstream's spelling

`cospec completion generate [shell]` SHALL behave exactly as
`cospec completion [shell]`: the same script, the same `$SHELL` detection, the
same refusals and the same `--json` refusal document. On both spellings the
shell name SHALL be read case-insensitively, as upstream's `completion generate`
lowercases it, `powershell` included.

#### Scenario: The same script under both spellings

- **WHEN** `cospec completion generate zsh` and `cospec completion zsh` run
- **THEN** both print the same script and exit 0

#### Scenario: The shell name is case-insensitive

- **WHEN** `cospec completion generate BASH` runs
- **THEN** it prints what `cospec completion generate bash` prints, exit 0
- **AND WHEN** `cospec completion generate POWERSHELL` runs
- **THEN** it prints what `cospec completion generate powershell` prints, which
  is what `cospec completion powershell` prints, exit 0
