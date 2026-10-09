# Design

## Context

`completion.ts` renders bash, zsh and fish scripts from `COMMAND_TABLE` through
`buildCompletionSpec()` and prints one to stdout. Its header says "Generate-only
by design", and the `install` and `uninstall` rows are `pendingSub` rows. The
pinned `@fission-ai/openspec` 1.13.1 installs through four classes under
`dist/core/completions/installers/`, shows its tip from
`dist/core/completion-tip.js`, and wires both in `dist/cli/index.js`. Everything
below that says "upstream" was read from that dist by path, and the install and
uninstall flows were also probed against the pinned binary with `HOME`, `XDG_*`,
`ZDOTDIR`, `CODEX_HOME`, `USERPROFILE` and `PROFILE` pointed at a throwaway
directory.

Three facts shape the design:

- The generated scripts already call `cospec` and `cospec __complete`. Writing
  `renderCompletion(shell)` byte for byte is what makes "the installed line
  calls cospec" structural, not a text substitution over upstream's script.
- Upstream's installers name their files `_openspec`, `openspec`,
  `openspec.fish` and `OpenSpecCompletion.ps1`, and bracket their rc blocks with
  `# OPENSPEC:START` / `# OPENSPEC:END`. A cospec installer that reused any of
  them would remove a user's real OpenSpec block on `uninstall` and be
  overwritten by `openspec completion install`.
- Every wrapped spawn forces `OPENSPEC_NO_COMPLETIONS=1` (archive-integrity), so
  the binary never shows its own tip through cospec.

## Goals / Non-Goals

**Goals:**

- Port upstream's install, uninstall and tip behaviour natively and observably
  the same, with `cospec` in every name and every written line.
- Make every write reversible: `uninstall` restores an rc file byte for byte.
- Prove all of it against a temporary `HOME`; no test, and no probe of the
  pinned binary, may touch the real one.

**Non-Goals:**

- Relaying `openspec completion install`. It writes bare `openspec`.
- Completing subcommand names or subcommand flags in the bash, zsh and fish
  scripts. They do not complete any subcommand today, and this change leaves
  that model alone; the PowerShell script completes them, as upstream's does.
- Migrating, detecting or removing an existing OpenSpec completion install.
- Honouring `ZDOTDIR` or `XDG_CONFIG_HOME` for rc and completions paths (see
  decision 3).

## Decisions

### 1. The tracks and their files

T2 (`core/completions/powershell.ts`, `spec.ts`), T3
(`core/completions/ install.ts`), T1 (`commands/completion.ts` and its table
rows), T4 (the tip and its call in `cli.ts`), T5 (the integration test). Two
files the roadmap does not list are needed: `core/completion-tip.ts` (T4),
because the tip's decision logic must be unit-testable without a spawned CLI,
and the two table rows in `core/command-table.ts` (T1). The tracks are ordered
T2, T3, T1, T4 because each consumes the one before it, and each starts with its
tests.

### 2. Targets per shell, from the dist

| Shell      | Script                                                           | rc wiring                                                                      |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| zsh        | `~/.zsh/completions/_cospec`                                     | `~/.zshrc`: `fpath=('<dir>' $fpath)`, `autoload -Uz compinit`, `compinit`      |
| zsh (OMZ)  | `${ZSH_CUSTOM:-${ZSH:-~/.oh-my-zsh}/custom}/completions/_cospec` | none (Oh My Zsh loads that directory); print the `fpath` check upstream prints |
| bash       | `~/.local/share/bash-completion/completions/cospec`              | `~/.bashrc`: source every file in `<dir>` (upstream's loop, quoted)            |
| fish       | `~/.config/fish/completions/cospec.fish`                         | none: fish autoloads that directory                                            |
| PowerShell | `<dir of $PROFILE>/CospecCompletion.ps1`                         | `$PROFILE` (every profile path upstream lists on Windows): dot-source the file |

Oh My Zsh is detected as upstream detects it: `$ZSH` set, else `~/.oh-my-zsh` is
a directory. `$PROFILE` is read from the environment, else
`~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1` on Windows and
`~/.config/powershell/Microsoft.PowerShell_profile.ps1` elsewhere; on Windows
the Windows PowerShell 5.1 profile under `Documents/WindowsPowerShell` is wired
too, as upstream wires it.

**The binary wins over the roadmap's wording.** The roadmap lists "the fish
config" among the rc targets. Upstream's fish installer writes only the script
and never touches `config.fish`, because fish autoloads
`~/.config/fish/completions/`. (Its verbose output names `config.fish` as the
configured file, but the fish installer reports no configured flag, so that line
never prints.) cospec follows the binary: fish has a script target and no rc
target. Both the roadmap's wording and the binary's behaviour are recorded here.

### 3. Home-derived paths, as upstream derives them

Every path above is derived from the home directory (`os.homedir()`, which Bun
and Node read from `HOME`/`USERPROFILE`), never from `ZDOTDIR` or
`XDG_CONFIG_HOME`. A user whose zsh reads `$ZDOTDIR/.zshrc` gets a wired
`~/.zshrc` their shell never reads. Alternative rejected: reading `ZDOTDIR`. It
would be the right zsh behaviour, but it diverges from the binary cospec is a
drop-in for, with no oracle to prove it against, and the docs state the
limitation in one sentence. The tip's config file is the exception: it follows
the binary's `getGlobalConfigDir` exactly (`XDG_CONFIG_HOME`, else `%APPDATA%`
on Windows, else `~/.config`), because it is the file the binary itself reads.

### 4. Names and markers are cospec's own

`_cospec`, `cospec`, `cospec.fish`, `CospecCompletion.ps1`; rc blocks bracketed
by `# COSPEC:START` and `# COSPEC:END`, with the comment line
`# cospec shell completions configuration`. Nothing cospec writes contains the
token `openspec`, so the installed-line acceptance is checkable with one search.
Alternative rejected: upstream's names and markers, so one install satisfies
both tools. It makes each tool's `uninstall` delete the other's wiring.

### 5. rc blocks: insert as upstream inserts, remove as the exact inverse

Install follows `FileSystemUtils.updateFileWithMarkers`: a missing rc file gets
the bare block; an existing one with no markers gets the block at the top
followed by one blank line (zsh, bash) or the block appended after one blank
line (PowerShell); an existing block is replaced in place; one marker without
the other is refused ("Invalid marker state"). Uninstall removes the marker
span, and the single blank separator line install added next to it, so an rc
file that existed before install is restored byte for byte. Upstream's removers
differ per shell and are lossy (zsh strips every leading blank line, the
PowerShell remover trims and re-terminates the file); cospec has one remover.
Alternative rejected: porting the four removers as they are, which would make
the round trip depend on the shell.

An rc file that is not writable is reported, not skipped: the script is
installed, the command prints the manual lines to add (upstream's
`generateInstructions`), writes the reason to stderr and exits 0 so the user
still has a working script. A marker error is reported the same way on install,
and on uninstall it is a failure (exit 1) with the script already removed.

PowerShell profiles are read with encoding detection and written back in the
encoding they were read in: UTF-8 with or without a BOM, UTF-16 LE with its BOM;
UTF-16 BE is refused with upstream's message. The script file itself is written
as BOM-less UTF-8, so the generator emits ASCII only.

### 6. Backup convention

On install, an existing script whose bytes equal the generated script is
"already installed (up to date)": no write, no backup, exit 0. The rc block is
still checked: when it is present nothing is written, and when the user has
removed it, it is written back and the output says so instead of "up to date". A
script that differs is an update: it is copied to
`<script>.backup-<ISO timestamp with ":" and "." replaced by "-">` before the
overwrite, and `--verbose` prints that path. The rc file is never backed up, as
upstream never backs it up; the block is a bounded span and uninstall restores
it exactly. A script that does not exist is a fresh install and has no backup.
Alternative rejected: also backing up the rc file. A backup next to a user's
`.zshrc` on every install is clutter upstream chose not to create, and the
byte-exact removal makes it unnecessary.

### 7. Output and exit codes follow upstream, in cospec's words

Success prints `✓ <message>` on stdout, then any warnings, then the manual
instructions when the rc file was not wired, else
`Restart your shell or run: <exec zsh|exec bash|. $PROFILE>`. Fish, which
autoloads its completions directory, gets upstream's two sentences instead (a
fresh or updated install:
`Fish automatically loads completions from ~/.config/fish/completions/` and
`Completions are available immediately - no shell restart needed.`; an
up-to-date one: `Fish automatically loads completions

- they should be available
  immediately.`), never a restart line. `--verbose`adds`Installed to:`, `Backup
  created:`and`<rc file> configured automatically`. Failure prints `✗
  <message>`on stderr and exits 1: not installed (uninstall), a path that is not writable, an unsupported or undetected shell. There is no spinner, since a spinner is noise on a non-TTY and the operations are instant, and there is no`console.debug`line for a missing file: upstream prints`Unable
  to read existing completion file at <path>: ENOENT…` on every fresh install,
  which the probe confirmed. A missing script is an expected case and is handled
  without output.

`uninstall` removes the script and the rc block independently and answers "not
installed" (exit 1) only when neither exists. Upstream's zsh uninstaller does
the same, but its bash and PowerShell uninstallers return before touching the rc
file when the script is gone, orphaning the block; cospec does not.

`--json` stays refused on `completion` and both subcommands, with the existing
one-document refusal (the row's `json: 'refused'`).

### 8. Uninstall confirmation

Without `-y`, `uninstall` asks
`Remove cospec's completion script and its <rc file> block? (y/N)` and removes
only on `y` or `yes`; any other answer prints `Uninstall cancelled.` and exits
0, as upstream does. When stdin is not a terminal and `-y` was not given,
`uninstall` refuses with exit 1 and tells the user to pass `-y`. Upstream's
behaviour there is an inquirer crash,
`Error: User force closed the prompt with 0 null`, exit 1 (probed); an
agent-driven run gets a sentence instead of a stack-shaped line. Alternative
rejected: reading the answer from a piped stdin. A destructive default should
never be granted by whatever happens to be piped in.

### 9. Shell resolution is shared, and learns PowerShell

`generate`, `install` and `uninstall` resolve the shell the same way: an
explicit argument read case-insensitively, else `$SHELL`'s basename with a login
dash stripped, else, when `$SHELL` is unset and `PSModulePath` is set,
`powershell` (upstream's order, minus its parent-process probe). cospec does not
fork `ps` to read the parent process, as the living spec requires; the cost is
that a user whose login shell differs from their interactive one names the shell
explicitly. The refusals keep their wording and add the operation name:
`cospec completion install: unsupported shell 'tcsh' (supported: bash, zsh, fish, powershell)`.

### 10. PowerShell generator

`renderPowerShellCompletion(spec)` renders the same `CompletionSpec` as the
other three, so `--help`, the parser and completion cannot drift (the three-way
parity test gains PowerShell). It registers
`Register-ArgumentCompleter -Native -CommandName cospec` (PowerShell requires
`-Native` for an executable; upstream's registration omits it), completes
commands, flags, subcommands, shell values and the dynamic sources through
`cospec __complete <source>` with its failure swallowed in the script the way
the other shells' scripts swallow it, and uses single-quoted PowerShell strings
throughout, so no `$` or backtick in a summary can expand. `spec.ts` gains the
two things the model lacks and PowerShell needs: each flag's description for the
completion tooltip, and each command's subcommands with their flags and its
positional's closed value set. The data comes from the same table rows, through
the same `offeredFlags` pass, so a pending flag stays absent from PowerShell.
`pwsh` is not assumed: the syntax and tab-expansion checks run only where `pwsh`
is on `PATH`, as the three shells' syntax checks do.

### 11. The tip, rule for rule

Ported from `completion-tip.js` and `cli/index.js`, with `openspec` respelled
`cospec` in the message only:
`Tip: Run 'cospec completion install' for shell completions`, printed as a blank
line then the message on stderr.

- Suppressed outright, before the config is read: `CI` set to anything but `''`,
  `false`, `0`, `no` or `off` (trimmed, case-insensitive), or
  `OPENSPEC_NO_COMPLETIONS` exactly `1`.
- The config is `<config dir>/openspec/config.json`, read raw (not merged with
  defaults, so the write never stamps defaults into a file that lacked them). A
  missing file is `{}`; unparsable JSON, or a root that is not an object, is
  left strictly alone.
- `completionTipSeen === true` ends it.
- Deferred, not consumed, when nobody would read it: `--json`, the `completion`
  command (any subcommand), the hidden `__complete`, and a stderr that is not a
  TTY. A deferred run reads the config and returns before any write.
- Otherwise `decideTip`: the tip is retired without printing when the shell is
  undetected or unsupported (`install` would exit 1, so the tip is a dead end)
  or when the shell's script is already installed.
- The flag is recorded before the message prints, through an atomic write:
  re-read the config, add only `completionTipSeen: true`, write a randomly named
  temporary file with owner-only mode `0o600`, rename it over the config. If the
  write fails, the tip does not print, because staying quiet beats reprinting on
  every run.

Three additions upstream does not have, each forced by cospec's command set:
`help` never tips (upstream's `help` is commander's implicit command and never
runs a `postAction`), every hidden row never tips (`__complete` is upstream's
named case; `check-commit` is the same kind of machine entry point, run from git
hooks whose stderr can be a terminal), and the hook runs only after a command's
module ran, so a parse refusal, `--help` or an unknown command never tips, which
is commander's `postAction` semantics. The hook sits after `mod.run(ctx)`
returns in `runCommand`, whatever the exit code, so the tip trails the command's
own output.

A forward row is the exception to "the module ran": the binary parses its argv,
so its commander refusal (exit 1, `error: ...` on stderr, nothing on stdout)
comes back through the module like any answer. The pinned binary's tip is a
commander `postAction` hook (`dist/cli/index.js`), reached only once an action
runs; its own conditions are `CI`, `OPENSPEC_NO_COMPLETIONS`, a readable config,
`--json`, a `completion` or `__complete` run, a non-TTY stderr, and an installed
or unsupported shell, and none of them is the exit code, since actions that
return after setting `process.exitCode = 1` still tip. So the dispatcher tees
what a forward row relays and skips the tip when the run exited nonzero with a
parse refusal as its whole answer, in the binary's spelling (`isParseRejection`)
or cospec's own for the rows it pre-validates before a handover
(`isRelayedParseRefusal`, `core/parse-rejection.ts`). Any other forwarded
failure still tips, as before.

Error handling follows the repo rule, not upstream's blanket catch: a missing
config, malformed JSON, a config whose read fails with an `errno` error and a
failed write (an `errno` error) are the expected cases and are handled; anything
else propagates. A config that cannot be read is left alone exactly as malformed
JSON is: the tip is best-effort and the command's own output is already written,
and upstream's read never fails a command, so an unreadable config must not turn
every cospec command into a failure after its output. A shared key has one
consequence, accepted: a user who has already seen OpenSpec's tip has
`completionTipSeen` set and never sees cospec's.

### 12. `OPENSPEC_NO_AUTO_CONFIG=1`

Upstream's zsh and bash installers skip the rc edit and print the manual lines
when it is `1`; its PowerShell installer ignores it. cospec honours the same
variable, by its upstream name, on all three rc-editing shells. A user who set
it for upstream expects no dotfile edit from a drop-in replacement, and
honouring it on PowerShell is the safe side of the one place upstream is
inconsistent. Alternative rejected: a new `COSPEC_NO_AUTO_CONFIG`, which makes a
user learn a second name for a switch they already set.

### 13. Tests never see the real home

`cospec()` in `test/fixtures/support.ts` inherits the suite's environment and
sets `HOME`, `XDG_*` and `ZDOTDIR` only when asked. The installer reads `ZSH`,
`ZSH_CUSTOM`, `PROFILE`, `USERPROFILE`, `PSModulePath`, `CI`,
`OPENSPEC_NO_COMPLETIONS` and `OPENSPEC_NO_AUTO_CONFIG` as well, and a leaked
`ZSH` flips the zsh target to Oh My Zsh. T5 adds one helper that builds a
sandbox (`HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`,
`XDG_STATE_HOME`, `ZDOTDIR`, `CODEX_HOME`, `PROFILE` all under a fresh temporary
directory), sets `SHELL`, and deletes the ambient variables above through the
existing `unset` option. It also fails the test if the resolved `HOME` is not
under the temporary directory. The unit tests of `install.ts` take the home
directory and the environment as parameters, so they need no process-wide state.

## Risks / Trade-offs

- [A wired rc file the shell never reads (`ZDOTDIR`, a non-standard bash setup)]
  → the success output names the rc file it edited, `--verbose` names every
  path, and the docs state the home-derived rule.
- [The tip's pty test is the only way to prove "once on a TTY"; CI has no
  terminal] → the decision logic is a pure function with the TTY flag and the
  config path injected, proven at unit level; the integration test drives the
  real CLI through a pty (`script`) and skips where `script` is absent, as the
  shell syntax checks skip an absent shell.
- [Concurrent cospec and openspec processes writing the shared config] → the
  write re-reads the file immediately before the atomic rename and changes one
  key, so the window is a rename, not a read-modify-write across a `ps` spawn.
- [`pwsh` absent from CI, so the PowerShell script is not syntax-checked there]
  → the structural unit assertions (registration line, ASCII only, no
  `openspec`, no unescaped `$`) always run, and the parser check runs wherever
  `pwsh` exists.
- [Orphaned rc block if a user deletes the script by hand] → `uninstall` removes
  the block without the script, and answers "not installed" only when both are
  gone.

## Operational surface

CLI-only. No bind address, container, runner topology, network I/O or secret is
involved. The change writes local files: the completions script, the rc file's
marked block (`~/.zshrc`, `~/.bashrc`, `$PROFILE`), and the shared
`<config dir>/openspec/config.json` (one boolean key, mode `0o600`). It reads
`SHELL`, `PSModulePath`, `ZSH`, `ZSH_CUSTOM`, `PROFILE`, `CI`,
`OPENSPEC_NO_COMPLETIONS`, `OPENSPEC_NO_AUTO_CONFIG`, `XDG_CONFIG_HOME` and
`APPDATA`. It is identical under the node_modules path and the compiled
standalone binary, which share one command table. The wrapped binary is neither
spawned nor changed by any of it.
