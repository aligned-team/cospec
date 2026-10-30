# Spec Delta

## ADDED Requirements

### Requirement: Dynamic completion stays inside a startup budget

`cospec __complete` SHALL load only the modules completion needs, record no
telemetry, and SHALL have its startup time measured against a recorded budget by
an advisory CI benchmark that reports but never gates.

#### Scenario: Tab press

- **WHEN** the benchmark runs `cospec __complete changes` 20 times
- **THEN** the median is reported against the recorded budget, and an overrun is
  surfaced in the benchmark report without failing CI

## MODIFIED Requirements

### Requirement: Completion scripts are generated from cospec's own command table

`cospec completion [bash|zsh|fish|powershell]` and
`cospec completion generate [shell]` SHALL print a completion script for
`cospec` to stdout and exit 0, deriving every command, summary, positional
source and flag from cospec's command table and global-flag list, never the
wrapped registry. Printing SHALL have no side effects on rc files or completion
directories, and SHALL exclude hidden commands and pending flags. A flag that
parses SHALL complete, and one that completes SHALL parse.

#### Scenario: Every non-hidden command appears in each shell's script

- **WHEN** `cospec completion bash`, `cospec completion zsh`,
  `cospec completion fish`, and `cospec completion powershell` are generated
- **THEN** each script lists every non-hidden command in the table, lists no
  hidden entry, has no line where `openspec` is a command token, and per-command
  flags equal the table's handled and accepted-no-op flags for that command

#### Scenario: Generated scripts parse in their own shells

- **WHEN** each generated script is fed to its shell's syntax check
- **THEN** `bash -n`, `zsh -n`, and `fish --no-execute` all accept it without
  error, and PowerShell's own parser accepts the PowerShell script wherever
  `pwsh` is installed

#### Scenario: Generating a script writes nothing

- **WHEN** `cospec completion zsh` runs, or `cospec completion generate zsh`
- **THEN** the script is written to stdout only, and no rc file or completion
  directory on disk is created or modified

#### Scenario: A pending flag does not complete

- **WHEN** a table row marks a flag pending
- **THEN** no generated script offers that flag, and it reappears in completion
  the moment its marking changes to handled

#### Scenario: Generated scripts never invoke bare openspec

- **WHEN** any shell's script is generated
- **THEN** no line invokes bare `openspec`, while the product name "OpenSpec"
  inside a description copied from the command table is allowed as prose

#### Scenario: Only install writes into the home

- **WHEN** either printing spelling runs
- **THEN** it neither reads, writes, nor offers to modify any shell rc file or
  completions directory; writing into a user's home is the job of
  `completion install` alone

### Requirement: Completion shell resolution and its refusals

Every completion spelling given no shell SHALL detect it from the basename of
`$SHELL`, stripping a leading `-`, or resolve `powershell` when `$SHELL` is
unset and `PSModulePath` is set, never forking to probe its parent. A shell
argument SHALL be case-insensitive. An undetectable or unsupported shell SHALL
exit 1 naming the supported shells and the explicit `cospec completion <shell>`
form. `--json` on any completion spelling SHALL exit 1 with a one-document error
envelope.

#### Scenario: Shell is detected from the environment

- **WHEN** `cospec completion` runs with `SHELL=/bin/zsh`
- **THEN** the zsh script is printed and the command exits 0

#### Scenario: An unsupported shell is named, not guessed

- **WHEN** `cospec completion` runs with `SHELL=/bin/tcsh`
- **THEN** the command exits 1, names bash, zsh, fish and powershell as
  supported, and prints no script
- **AND WHEN** `cospec completion install` runs with `SHELL=/bin/tcsh`
- **THEN** it exits 1 naming the same four shells, and writes nothing

#### Scenario: JSON is refused for a shell script

- **WHEN** `cospec completion zsh --json` is invoked
- **THEN** the command exits 1 emitting exactly one JSON error document and no
  shell script

#### Scenario: PowerShell is detected when no shell variable is set

- **WHEN** `cospec completion` runs with `SHELL` unset and `PSModulePath` set
- **THEN** the PowerShell script is printed and the command exits 0

#### Scenario: Shell argument is case-insensitive

- **WHEN** `cospec completion ZSH` runs
- **THEN** it prints the zsh script exactly as `cospec completion zsh` does

### Requirement: The dynamic completion source fails silently

Hidden `cospec __complete <changes|specs|types|schemas|archived-changes>` SHALL
emit one tab-separated id and description per line on stdout, and on any failure
(unresolvable root, wrapped-call error, unknown source) SHALL exit 1 with no
output on stdout or stderr. The source name SHALL match case-insensitively.
`changes`/`specs` SHALL come from the typed wrapped list calls, `types` from
`COSPEC_TYPES`, `schemas` from `openspec schemas --json`, `archived-changes`
from the archive directory.

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

#### Scenario: Schemas complete from the wrapped listing

- **WHEN** `cospec __complete schemas` runs in a root with a project fork
- **THEN** stdout lists the same schema names, in the same order, as
  `openspec __complete schemas`, the fork included

#### Scenario: Archived changes complete from the archive

- **WHEN** `cospec __complete ARCHIVED-CHANGES` runs in a root with two archived
  changes
- **THEN** stdout lists both directory names, as
  `openspec __complete archived-changes` does

#### Scenario: Source details

- **WHEN** `cospec __complete` serves `types`, `schemas` or `archived-changes`
- **THEN** `types` spawns no wrapped binary; `schemas` prints one line per
  schema name described by its `description`; `archived-changes` lists the
  non-dot directories under `openspec/changes/archive/`, sorted, each described
  `archived change`, with no wrapped spawn

### Requirement: Completion install wires a shell to cospec's script

`cospec completion install [shell] [--verbose]` SHALL write the script
`cospec completion <shell>` prints to the shell's completions location under
`os.homedir()` (never `ZDOTDIR`/`XDG_CONFIG_HOME`), wire the shell to load it in
a `# COSPEC:START`/`# COSPEC:END` rc block, and exit 0 reporting the reload
command. Nothing written SHALL contain the token `openspec`. An unwritable
script SHALL fail with `✗ <reason>` on stderr, exit 1, and leave every rc file
untouched.

#### Scenario: Install and uninstall round-trip under a temporary home

- **WHEN** `cospec completion install` and then `cospec completion uninstall -y`
  run for each of bash, zsh, fish and powershell under a temporary `HOME`
- **THEN** the script exists at the shell's location after install and not after
  uninstall, every rc file that existed before install is byte-identical after
  uninstall, and an rc file that did not exist holds no `COSPEC` marker

#### Scenario: The installed files call cospec

- **WHEN** a script is installed for each shell
- **THEN** the script and every rc block contain `cospec`, no line of either has
  `openspec` as a command token, and no rc block line mentions `openspec`

#### Scenario: Fish and Oh My Zsh edit no rc file

- **WHEN** `cospec completion install fish` runs, and
  `cospec completion install zsh` runs with `ZSH` set
- **THEN** no `config.fish` and no `~/.zshrc` is created or modified

#### Scenario: Auto-configuration can be switched off

- **WHEN** `cospec completion install zsh` runs with `OPENSPEC_NO_AUTO_CONFIG=1`
- **THEN** the script is written, `~/.zshrc` is not created or modified, and the
  `fpath` lines to add are printed

#### Scenario: Install never writes to the real home

- **WHEN** the install tests run
- **THEN** every one runs with `HOME`, `USERPROFILE`, `XDG_*`, `ZDOTDIR` and
  `PROFILE` under a temporary directory and with `ZSH`, `ZSH_CUSTOM` and
  `PSModulePath` removed, and a test whose resolved home is outside that
  directory fails

#### Scenario: Install locations per shell

- **WHEN** the script is installed
- **THEN** zsh writes `~/.zsh/completions/_cospec`, or
  `${ZSH_CUSTOM:-${ZSH:-~/.oh-my-zsh}/custom}/completions/_cospec` when Oh My
  Zsh is present (`$ZSH` set, or `~/.oh-my-zsh` a directory); bash writes
  `~/.local/share/bash-completion/completions/cospec`; fish writes
  `~/.config/fish/completions/cospec.fish`; PowerShell writes
  `CospecCompletion.ps1` beside `$PROFILE` (else `~/.config/powershell/` or, on
  Windows, `~/Documents/PowerShell/`)

#### Scenario: Rc block editing rules

- **WHEN** install wires `~/.zshrc` (standard zsh only), `~/.bashrc` or
  `$PROFILE`
- **THEN** a missing rc file is created holding the bare block; a zsh or bash
  block is inserted at the top followed by one blank line; a PowerShell block is
  appended; an existing block is replaced in place; and a start marker without
  its end marker, or the reverse, is not edited and is reported

#### Scenario: Written names and lines invoke cospec

- **WHEN** install writes files and rc lines
- **THEN** every name and line invokes `cospec`, none contains `openspec` as a
  command token, and no rc block line or file name contains `openspec` at all

#### Scenario: Verbose install reports its paths

- **WHEN** `cospec completion install --verbose` succeeds
- **THEN** it prints the installed path, the backup path when one was made, and
  the rc file configured

#### Scenario: An unwritable script leaves rc files untouched

- **WHEN** the completion script cannot be written
- **THEN** stderr carries `✗ <reason>`, the exit code is 1, and no rc file is
  modified

### Requirement: Completion uninstall confirms before removing

`cospec completion uninstall [shell] [-y|--yes]` SHALL remove the script and rc
block independently, failing with `✗ Completion script is not installed` on
stderr and exit 1 only when neither exists. Without `-y` it SHALL confirm on a
terminal, remove only on `y`/`yes`, and otherwise print `Uninstall cancelled.`
and exit 0; with no terminal on stdin it SHALL exit 1 naming `-y` and remove
nothing. An rc marker error SHALL exit 1.

#### Scenario: A non-interactive uninstall needs -y

- **WHEN** `cospec completion uninstall zsh` runs with stdin not a terminal and
  no `-y`
- **THEN** it exits 1 naming `-y`, and the script and the rc block are still
  present

#### Scenario: Declining the prompt removes nothing

- **WHEN** `cospec completion uninstall zsh` runs on a terminal and the answer
  is `n`
- **THEN** it prints `Uninstall cancelled.`, exits 0, and the script and the rc
  block are still present

#### Scenario: Uninstalling what was never installed fails

- **WHEN** `cospec completion uninstall zsh -y` runs under an empty `HOME`
- **THEN** it exits 1 printing that the completion script is not installed

#### Scenario: An orphaned rc block is still removed

- **WHEN** the script was deleted by hand and
  `cospec completion uninstall zsh -y` runs
- **THEN** the rc block is removed and the command exits 0

### Requirement: PowerShell completion registers cospec

`cospec completion powershell` SHALL print a script, rendered from the shared
command table, registering
`Register-ArgumentCompleter -Native -CommandName cospec` over commands,
subcommands, flags, shell values and `cospec __complete` sources. It SHALL be
ASCII only, never use `openspec` as a command token, and quote every string so
none expands. `cospec completion install powershell` SHALL keep the profile's
encoding (UTF-8, UTF-8 BOM, UTF-16 LE) and refuse UTF-16 BE.

#### Scenario: The PowerShell script is cospec's

- **WHEN** `cospec completion powershell` runs
- **THEN** the script registers a completer for `cospec`, lists every non-hidden
  command, offers each command's table flags, and has no line where `openspec`
  is a command token

#### Scenario: A profile keeps its encoding

- **WHEN** `cospec completion install powershell` runs over a `$PROFILE` that is
  UTF-16 LE with a BOM, and then `cospec completion uninstall powershell -y`
- **THEN** the profile is UTF-16 LE with a BOM throughout, and byte-identical to
  the original after uninstall

#### Scenario: A UTF-16 BE profile is refused

- **WHEN** `cospec completion install powershell` runs over a UTF-16 BE
  `$PROFILE`
- **THEN** the script is installed, the profile is not modified, and the reason
  is reported with the lines to add

### Requirement: A one-shot completion tip

After a command's own output, cospec SHALL print
`Tip: Run 'cospec completion install' for shell completions` once on stderr,
preceded by a blank line, recording it first as `completionTipSeen: true` in the
wrapped binary's global `<config dir>/openspec/config.json` by an atomic,
owner-only rewrite that re-reads the file and changes only that key. A missing
config SHALL count as empty; invalid JSON or a non-object root SHALL be left
unmodified and not tip; a failed write SHALL not tip.

#### Scenario: The tip shows once on a terminal

- **WHEN** a cospec command runs on a terminal with `CI` unset against a fresh
  config dir, and then runs again
- **THEN** the first run prints the tip on stderr after its own output and
  records `completionTipSeen: true`, and the second run prints nothing extra

#### Scenario: The tip never shows where nobody reads it

- **WHEN** a command runs with `--json`, with `CI=true`, with
  `OPENSPEC_NO_COMPLETIONS=1`, with stderr piped, as `completion`, as
  `__complete`, or as `help`
- **THEN** no tip is printed

#### Scenario: A parse refusal never tips, forwarded commands included

- **WHEN** a command runs on a terminal against a fresh config dir and ends in a
  parse refusal: `completion zsh --bogus`, an unknown command, or a forwarded
  command's own refusal such as `schemas --bogus` (exit 1,
  `error: unknown option '--bogus'` on stderr)
- **THEN** no tip is printed, and the config is not created or modified

#### Scenario: A deferred run keeps the tip owed

- **WHEN** a command runs with `--json`, or with stderr piped, against a fresh
  config dir
- **THEN** the config is not created or modified, and a later terminal run
  prints the tip

#### Scenario: The config write preserves other keys

- **WHEN** the tip is recorded over a config holding `{"telemetry": {...}}`
- **THEN** the file keeps its other keys and gains `completionTipSeen: true`,
  and a config whose root is an array is not modified

#### Scenario: An installed completion retires the tip silently

- **WHEN** the shell's script is installed and a command runs on a terminal
- **THEN** no tip is printed and `completionTipSeen` is recorded

#### Scenario: Config directory resolution

- **WHEN** the tip config path is resolved
- **THEN** the config dir is `$XDG_CONFIG_HOME`, else `%APPDATA%` on Windows,
  else `~/.config`

#### Scenario: Deferred runs leave the config unmodified

- **WHEN** `--json` was given, the command is `completion` (any subcommand),
  `help` or a hidden command, or stderr is not a terminal
- **THEN** the tip does not print and the config is left unmodified, so the tip
  stays owed

#### Scenario: Opted-out environments never read the config

- **WHEN** `CI` is set to anything but `''`, `false`, `0`, `no` or `off`
  (trimmed, case-insensitive), or `OPENSPEC_NO_COMPLETIONS` is `1`
- **THEN** the tip does not print and the config is not read

#### Scenario: Undetectable shell records without printing

- **WHEN** the shell is undetected or unsupported, or its script is already
  installed
- **THEN** the flag is recorded and the tip is not printed

#### Scenario: No tip after help, refusals or unknown commands

- **WHEN** the run was a help request, a parse refusal or an unknown command
- **THEN** no tip prints
