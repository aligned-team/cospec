# Spec Delta

## ADDED Requirements

### Requirement: Zsh uninstall restores the rc file exactly

`cospec completion uninstall zsh` SHALL return `.zshrc` byte-for-byte as
`completion install zsh` found it, leading blank lines and line endings
included, removing only the separator install added.

#### Scenario: Round trip

- **WHEN** a `.zshrc` that starts with two blank lines goes through install then
  uninstall
- **THEN** the file is byte-identical to the original

### Requirement: Dynamic completion stays inside a startup budget

`cospec __complete` SHALL load only the modules completion needs, record no
telemetry, and stay within a startup budget enforced by an advisory benchmark in
CI.

#### Scenario: Tab press

- **WHEN** the benchmark runs `cospec __complete changes` 20 times
- **THEN** the median stays under the recorded budget
