# Spec Delta

## MODIFIED Requirements

### Requirement: Completion scripts are generated from cospec's own command table

`cospec completion [bash|zsh|fish|powershell]` and its upstream spelling
`cospec completion generate [shell]` SHALL print a shell completion script for
the `cospec` binary to stdout and exit 0, deriving every command name, summary,
positional source and flag from cospec's own command table
(`apps/cli/src/core/command-table.ts`) and the global-flag list rather than from
the wrapped binary's registry. Printing SHALL have no side effects: neither
spelling SHALL write to, read, or offer to modify any shell rc file or
completions directory, and no generated script SHALL emit any instruction that
invokes bare `openspec`. The product name "OpenSpec" inside a flag or command
description copied from the command table is prose, not an invocation, and is
allowed. Hidden command entries SHALL be excluded from the generated script.
Flags marked pending in the table SHALL be excluded from completion until the
change that implements them lands. Because the completion spec, `--help` and the
argv parser read the same table rows, a flag the parser accepts SHALL always
complete, and a flag that completes SHALL always parse. Writing a script into a
user's home is the job of `completion install` alone.

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

### Requirement: Completion shell resolution and its refusals

`cospec completion`, `cospec completion generate`, `cospec completion install`
and `cospec completion uninstall` invoked with no shell argument SHALL detect
the shell from the basename of `$SHELL`, stripping a leading `-`, and, when
`$SHELL` is unset and `PSModulePath` is set, SHALL resolve `powershell`. No
spelling SHALL fork a process to probe its parent. A shell argument SHALL be
read case-insensitively. An undetectable or unsupported shell SHALL exit 1 with
a message naming the supported shells (`bash`, `zsh`, `fish`, `powershell`) and
the explicit `cospec completion <shell>` form of the operation that was asked.
`cospec completion --json`, and the same flag on any completion subcommand,
SHALL exit 1 with a one-document error envelope, because a shell script is not a
JSON document and emitting it under `--json` would break the single-document
invariant.

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

## ADDED Requirements

### Requirement: Completion install wires a shell to cospec's script

`cospec completion install [shell] [--verbose]` SHALL write the script
`cospec completion <shell>` prints to the shell's completions location and wire
the shell to load it, and SHALL exit 0 reporting the reload command. The
locations, derived from the home directory (`os.homedir()`) and never from
`ZDOTDIR` or `XDG_CONFIG_HOME`, are: zsh `~/.zsh/completions/_cospec`, or
`${ZSH_CUSTOM:-${ZSH:-~/.oh-my-zsh}/custom}/completions/_cospec` when Oh My Zsh
is present (`$ZSH` set, or `~/.oh-my-zsh` a directory); bash
`~/.local/share/bash-completion/completions/cospec`; fish
`~/.config/fish/completions/cospec.fish`; PowerShell `CospecCompletion.ps1`
beside `$PROFILE` (else `~/.config/powershell/` or, on Windows,
`~/Documents/PowerShell/`). Wiring SHALL edit `~/.zshrc` (standard zsh only),
`~/.bashrc` or `$PROFILE` inside a block bracketed by `# COSPEC:START` and
`# COSPEC:END`, and SHALL NOT edit any rc file for fish or Oh My Zsh. A missing
rc file SHALL be created holding the bare block; a zsh or bash block SHALL be
inserted at the top followed by one blank line; a PowerShell block SHALL be
appended; an existing block SHALL be replaced in place; a start marker without
its end marker, or the reverse, SHALL NOT be edited and SHALL be reported. Every
name and line cospec writes SHALL invoke `cospec` and SHALL NOT contain
`openspec` as a command token, and no rc block line and no file name SHALL
contain the token `openspec` at all. With `OPENSPEC_NO_AUTO_CONFIG=1` the rc
file SHALL NOT be edited and the lines to add SHALL be printed instead. With
`--verbose` the installed path, the backup path when one was made, and the rc
file configured SHALL be printed. A script that cannot be written SHALL fail
with `✗ <reason>` on stderr and exit 1, leaving every rc file untouched.

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

### Requirement: Completion install is idempotent and backs up a changed script

`cospec completion install` run again over a script whose bytes equal the
generated script SHALL report `already installed (up to date)`, exit 0, and
change nothing on disk: no script write, no backup, and an rc block that is
byte-identical. Run over a script whose bytes differ, it SHALL copy the existing
script to `<script>.backup-<ISO timestamp with ":" and "." replaced by "-">`
before overwriting it, and SHALL NOT back up an rc file. A script that did not
exist SHALL produce no backup.

#### Scenario: A second install changes nothing

- **WHEN** `cospec completion install zsh` runs twice with no change between
- **THEN** the second run reports the script is already installed, exits 0, and
  every file under `HOME` is byte-identical and keeps its modification time

#### Scenario: A changed script is backed up first

- **WHEN** an installed script is edited and `cospec completion install` runs
  again
- **THEN** the script is regenerated, a `.backup-` copy holding the edited bytes
  exists beside it, and `--verbose` prints the backup path

### Requirement: Completion install coexists with OpenSpec's own install

`cospec completion install` and `cospec completion uninstall` SHALL name files
`_cospec`, `cospec`, `cospec.fish` and `CospecCompletion.ps1` and rc markers
`# COSPEC:START` and `# COSPEC:END`, and SHALL NOT read, replace or remove a
file or an `# OPENSPEC:START` … `# OPENSPEC:END` block the wrapped binary's
`completion install` wrote.

#### Scenario: Uninstalling cospec's completions leaves OpenSpec's alone

- **WHEN** OpenSpec's `completion install zsh` and then cospec's run under one
  temporary `HOME`, and `cospec completion uninstall -y` runs
- **THEN** `_openspec` and the `# OPENSPEC:START` block in `~/.zshrc` are
  byte-identical to what OpenSpec wrote, and `_cospec` and the `COSPEC` block
  are gone

### Requirement: Completion uninstall confirms before removing

`cospec completion uninstall [shell] [-y|--yes]` SHALL remove the script and the
rc block independently, answering `✗ Completion script is not installed` on
stderr with exit 1 only when neither exists. Without `-y` it SHALL ask for
confirmation on a terminal, remove only on `y` or `yes`, and otherwise print
`Uninstall cancelled.` and exit 0 having removed nothing. Without `-y` and
without a terminal on stdin it SHALL refuse with exit 1, naming `-y`, and remove
nothing. A marker error in the rc file SHALL be a failure (exit 1).

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

`cospec completion powershell` SHALL print a PowerShell script rendered from the
same command table as the other shells that registers a native argument
completer for `cospec`
(`Register-ArgumentCompleter -Native -CommandName cospec`), completing commands,
subcommands, flags, the closed shell values and the dynamic sources through
`cospec __complete`. The script SHALL be ASCII only, SHALL have no line where
`openspec` is a command token, and SHALL quote every string so that no summary
or description can expand in PowerShell. `cospec completion install powershell`
SHALL wire the profile as the install requirement describes, reading and writing
the profile in the encoding it already has (UTF-8, UTF-8 with a BOM, or UTF-16
LE) and refusing a UTF-16 BE profile.

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
`Tip: Run 'cospec completion install' for shell completions`, preceded by a
blank line, once, on stderr. The tip SHALL be recorded as shown by writing
`completionTipSeen: true` into `<config dir>/openspec/config.json` (the
machine-global config the wrapped binary reads: `$XDG_CONFIG_HOME`, else
`%APPDATA%` on Windows, else `~/.config`), before the message prints. The write
SHALL re-read the file, change only that key, and replace the file atomically
with owner-only permissions. A missing config SHALL be treated as empty; a
config that is not valid JSON, or whose root is not an object, SHALL be left
unmodified and SHALL NOT tip. The tip SHALL NOT print, and SHALL leave the
config unmodified (deferred, not consumed), when `--json` was given, the command
is `completion` (any subcommand), `help`, or a hidden command, or stderr is not
a terminal. It SHALL NOT print, and SHALL NOT read the config, when `CI` is set
to anything but `''`, `false`, `0`, `no` or `off` (trimmed, case-insensitive) or
`OPENSPEC_NO_COMPLETIONS` is `1`. When the shell is undetected or unsupported,
or the shell's script is already installed, it SHALL record the flag without
printing. It SHALL NOT print after a help request, a parse refusal or an unknown
command. A write that fails SHALL leave the tip unprinted.

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
