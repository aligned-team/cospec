## MODIFIED Requirements

### Requirement: Config argv is built locally, not by the shared passthrough helper

`cospec config` SHALL build its wrapped argv with a local, pure builder rather
than routing through `core/passthrough-command.ts`, and SHALL NOT call
`resolveRoot`, because OpenSpec's config is machine-global rather than
root-scoped. The built argv SHALL never contain `--store` or any store argument,
SHALL never append a trailing `--no-color` (cospec's spawn already prefixes
`--no-color` ahead of the subcommand, so a second copy is redundant — upstream
declares the flag on the program and accepts it in trailing position), SHALL
append `--json` only for the `list` subcommand, and SHALL emit an extracted
`--scope <value>` between `config` and the subcommand rather than after it. A
`--scope` value other than `global` SHALL be relayed to the wrapped binary
unmodified so upstream's own refusal is what the user sees.

With no subcommand (`cospec config`, `cospec config --scope global`), cospec
SHALL print its own `config` help — the text `cospec config --help` prints — on
stderr and exit 1, where the binary prints its own help naming bare `openspec`
on stderr and exits 1; with `--json`, the binary's own refusal of `--json` at
the `config` level SHALL be relayed. A `--cwd` that is not a directory SHALL be
answered with the resolver's `directory not found` refusal before anything is
spawned.

#### Scenario: Built argv carries no store and no trailing no-color

- **WHEN** the argv builder runs for each of `path`, `list`, `get`, `set`,
  `unset`, `reset`, `profile`, and `edit`
- **THEN** no built argv contains a `--store` token or a `--no-color` token, and
  `--json` appears only in the argv built for `list`

#### Scenario: Scope is hoisted ahead of the subcommand

- **WHEN** `cospec config get <key> --scope global` is invoked, in either the
  `--scope global` or `--scope=global` spelling
- **THEN** the built argv is `config --scope global get <key>`, with the scope
  option ahead of the subcommand

#### Scenario: A store flag is refused rather than ignored

- **WHEN** `cospec config --store <id> list` is invoked
- **THEN** the command exits 1 with a message stating that `--store` does not
  apply because OpenSpec config is machine-global, and no wrapped binary is
  spawned

#### Scenario: A missing subcommand is a usage error

- **WHEN** `cospec config` or `cospec config --scope global` is invoked with no
  subcommand and no `--json`
- **THEN** the command exits 1 with cospec's `config` help, listing the
  supported subcommands, on stderr, and no wrapped binary is spawned
- **AND WHEN** `cospec config --json` runs
- **THEN** stderr is the binary's `error: unknown option '--json'` and the exit
  code is 1, as `openspec config --json` answers

### Requirement: Non-interactive config subcommands are piped disciplined passthroughs

`cospec config path|list|get|set|unset|reset --all -y|profile <preset>` SHALL
run as piped `passthroughOpenspec` calls declaring `expect.exitCodes` of
`[0, 1]`, because upstream sets exit 1 for ordinary negative results — an unset
key, an unknown key, an invalid stored config — which are results to relay
rather than wrapped-call violations. Any other exit code, or a deny-listed
stdout marker, SHALL surface as a cospec failure rather than as a relayed
result. Wrapped stdout and stderr SHALL be relayed as the binary wrote them,
except that a failed answer's remedy sentences and a successful answer's
next-step lines (`Config updated. Run \`openspec update\` in your projects to
apply.`) SHALL be spelled through cospec from the pinned binary's allowlist, a
next-step line only where it is a whole line. cospec SHALL NOT re-implement
upstream's key validation, value coercion, or its prototype-pollution guard, nor
read or write the global config file itself.

#### Scenario: Reading the config path and list succeeds

- **WHEN** `cospec config path` and `cospec config list --json` run against the
  real pinned binary with a sandboxed config home
- **THEN** `path` prints the global config path and exits 0, and `list --json`
  emits exactly one parseable JSON document relayed verbatim from upstream

#### Scenario: An unset key is relayed as exit 1, not as a wrapper failure

- **WHEN** `cospec config get <key>` runs for a key with no stored value
- **THEN** the command exits 1 with upstream's own message and does not report a
  wrapped-call discipline violation

#### Scenario: A profile preset's next step names cospec

- **WHEN** `cospec config profile core` succeeds
- **THEN** stdout reads
  ``Config updated. Run `cospec update` in your projects to apply.`` and no bare
  `openspec` command is printed

### Requirement: Interactive config subcommands hand over the terminal

Three config subcommands SHALL be terminal-handover execs: `cospec config edit`,
`cospec config profile` with no preset argument, and `cospec config reset --all`
invoked without `-y`/`--yes`. The wrapped binary is version-asserted first, then
spawned with inherited stdio, `shell: false`, and the handover environment
`BUN_BE_BUN=1`, `OPENSPEC_TELEMETRY=0`, `OPENSPEC_NO_COMPLETIONS=1`, and the
child's exit code SHALL be propagated unchanged — including `130`, which
upstream sets when a prompt is cancelled. These calls SHALL declare no
`RunExpectation`, the documented exception the terminal-handover class already
carries, because inherited stdio leaves nothing for a stdout deny-list to
inspect.

Before handing the terminal over, each SHALL pre-validate: the subcommand's argv
is parsed against the command table and a refusal commander would raise is
answered on cospec's own streams exactly as the binary answers it, ahead of the
`--json` envelope; `config profile` with no preset, when cospec's stdout is not
a TTY (the binary's own test for that subcommand), runs as a piped call whose
answer is relayed through the allowlist; and `config profile` reads the global
config with a read-only `config list --json` first, relaying the binary's
unreadable-config refusal, respelled, without handing over. `config reset --all`
without `-y`, when cospec's stdin is not a TTY (the binary's own test, its
confirm reading stdin), SHALL run as a piped call that forwards cospec's stdin
to the confirm as the binary under Node reads it: input already waiting when the
prompt is drawn is discarded, input that arrives after is taken, and a closed
input cancels the prompt with exit `130`.

#### Scenario: Editing hands the terminal to the editor

- **WHEN** `cospec config edit` is invoked
- **THEN** cospec spawns the wrapped `openspec config edit` with inherited stdio
  and exits with exactly the child's exit code

#### Scenario: A cancelled prompt propagates 130

- **WHEN** `cospec config profile` is cancelled at its interactive menu and the
  wrapped process exits 130
- **THEN** `cospec config profile` exits 130 rather than normalising the code

#### Scenario: A piped answer reaches the reset confirm as it reaches the binary's

- **WHEN** `cospec config reset --all` runs with stdin a pipe
- **THEN** `echo y |` and `</dev/null` cancel it with `Reset cancelled.` and
  exit `130`, resetting nothing, and `(sleep 1; echo y) |` resets the global
  config with exit `0`, as the binary answers each under Node

#### Scenario: A non-TTY caller gets upstream's own refusal

- **WHEN** `cospec config profile` runs with no preset and no TTY attached
- **THEN** upstream's own interactive-mode-required error is relayed, its
  `openspec config profile core` spelled `cospec config profile core`, and its
  exit code propagated, with no cospec-invented substitute

#### Scenario: A handover leaf's parse refusal is answered before the handover

- **WHEN** `cospec config edit --bogus`, `cospec config reset --all --bogus` or
  `cospec config profile --bogus` runs, with or without `--json`
- **THEN** stderr is the refusal the binary prints for the same argv, the exit
  code is 1, and no editor or prompt is started

### Requirement: Every config subcommand honours the one-JSON-document invariant

`cospec config --json` SHALL emit exactly one parseable JSON document on stdout
for every subcommand, not only for the one upstream supports. `list --json`
SHALL relay upstream's document verbatim under the single-document check.
`path`, `get`, `set`, `unset`, and `reset` SHALL emit cospec-owned envelopes
carrying `version: 1` and the invoked `command`, with `get` reporting the raw
printed string in `value` plus a `found` boolean, and `set`/`unset`/`reset`
reporting an `ok` boolean and a `message`. `--json` against a terminal-handover
subcommand SHALL be refused with an envelope whose `ok` is `false` and exit 1,
never faked by suppressing the interaction. A refusal the binary's commander
raises while it parses the argv (an unknown option, a missing value, a missing
argument, too many arguments) comes before any output the binary could shape and
SHALL be relayed as its text on stderr with exit 1 and no document, ahead of
every envelope — the forward-row contract's rule for a parse refusal.

#### Scenario: A cospec-owned envelope is exactly one document

- **WHEN** `cospec config get <unset-key> --json` runs
- **THEN** stdout is exactly one JSON document with `version: 1`,
  `found: false`, and a null `value`, and the command exits 1

#### Scenario: JSON is refused for an interactive subcommand

- **WHEN** `cospec config edit --json` is invoked
- **THEN** stdout is exactly one JSON document reporting `ok: false` and naming
  the subcommand as interactive, the command exits 1, and no editor is spawned

#### Scenario: A parse refusal is relayed, not enveloped

- **WHEN** `cospec config get foo --bogus --json` or
  `cospec config path --bogus --json` runs
- **THEN** stderr is the binary's `error: unknown option '--bogus'`, stdout is
  empty, and the exit code is 1, as `openspec` answers the same argv
