# cospec-shell-completion Specification

## Purpose

cospec ships completion for the binary users actually type, generated from its
own exported `COMMANDS` table and `GLOBAL_OPTIONS` rather than passed through
from OpenSpec — upstream's installer would write a completion function for the
`openspec` binary into the user's rc file, permanently instructing a dotfile to
call the bare binary this repo forbids. `cospec completion [bash|zsh|fish]`
prints to stdout only, writes nothing, and detects the shell from `$SHELL` when
omitted. The hidden `cospec __complete <changes|specs|types>` is the dynamic
source behind the generated scripts, and its failure contract — exit 1 with both
streams empty — is what keeps a failure from ever corrupting a Tab press.

## Requirements

### Requirement: Completion scripts are generated from cospec's own command table

`cospec completion [bash|zsh|fish]` SHALL print a shell completion script for
the `cospec` binary to stdout and exit 0, deriving every command name, summary,
and flag from cospec's own exported `COMMANDS` table and `GLOBAL_OPTIONS` rather
than from the wrapped binary's registry. The command SHALL have no side effects
— it SHALL NOT write to, read, or offer to modify any shell rc file — and SHALL
NOT emit any instruction that invokes bare `openspec`. Hidden command entries
SHALL be excluded from the generated script. Per-command flags SHALL be
extracted from each entry's help text by a pure function covered by a snapshot
test, so a command or flag the extractor cannot parse fails the build rather
than silently disappearing from completion.

#### Scenario: Every non-hidden command appears in each shell's script

- **WHEN** `cospec completion bash`, `cospec completion zsh`, and
  `cospec completion fish` are generated
- **THEN** each script lists every non-hidden command in `COMMANDS`, lists no
  hidden entry, contains no `openspec` invocation, and per-command flags match
  the extraction snapshot

#### Scenario: Generated scripts parse in their own shells

- **WHEN** each generated script is fed to its shell's syntax check
- **THEN** `bash -n`, `zsh -n`, and `fish --no-execute` all accept it without
  error

#### Scenario: Generating a script writes nothing

- **WHEN** `cospec completion zsh` runs
- **THEN** the script is written to stdout only, and no rc file or completion
  directory on disk is created or modified

### Requirement: Completion shell resolution and its refusals

`cospec completion` invoked with no shell argument SHALL detect the shell from
the basename of `$SHELL`, stripping a leading `-`, and SHALL NOT fork a process
to probe its parent. An undetectable or unsupported shell SHALL exit 1 with a
message naming the supported shells and the explicit `cospec completion <shell>`
form. `cospec completion --json` SHALL exit 1 with a one-document error
envelope, because a shell script is not a JSON document and emitting it under
`--json` would break the single-document invariant.

#### Scenario: Shell is detected from the environment

- **WHEN** `cospec completion` runs with `SHELL=/bin/zsh`
- **THEN** the zsh script is printed and the command exits 0

#### Scenario: An unsupported shell is named, not guessed

- **WHEN** `cospec completion` runs with `SHELL=/bin/tcsh`
- **THEN** the command exits 1, names bash, zsh, and fish as supported, and
  prints no script

#### Scenario: JSON is refused for a shell script

- **WHEN** `cospec completion zsh --json` is invoked
- **THEN** the command exits 1 emitting exactly one JSON error document and no
  shell script

### Requirement: The dynamic completion source fails silently

`cospec __complete <changes|specs|types>` SHALL be a hidden command emitting one
tab-separated id and description pair per line on stdout, and SHALL exit 1 with
**no output on stdout or stderr** on any failure — an unresolvable root, a
wrapped-call error, an unknown source name — because a Tab press must never be
corrupted by an error message. `changes` and `specs` SHALL be sourced from the
existing typed wrapped list calls; `types` SHALL be sourced from `COSPEC_TYPES`
with no wrapped spawn at all.

#### Scenario: Change ids complete inside a repo

- **WHEN** `cospec __complete changes` runs in a repo with active changes
- **THEN** stdout lists each active change id with a tab-separated description
  and the command exits 0

#### Scenario: Types complete without spawning the wrapped binary

- **WHEN** `cospec __complete types` runs
- **THEN** the eleven cospec conventional-commit types are listed and no wrapped
  binary is spawned

#### Scenario: Failure is silent on both streams

- **WHEN** `cospec __complete changes` runs outside any resolvable openspec
  root, or `cospec __complete nonsense` is invoked
- **THEN** the command exits 1 having written nothing to stdout and nothing to
  stderr
