# Spec Delta

## MODIFIED Requirements

### Requirement: Config argv is built locally, not by the shared passthrough helper

`cospec config` SHALL build its wrapped argv with a local, pure builder, not
`core/passthrough-command.ts`, and SHALL NOT call `resolveRoot` (config is
machine-global). The argv SHALL never contain `--store` or a store argument, nor
a trailing `--no-color` (the spawn already prefixes one), SHALL append `--json`
only for `list`, and SHALL emit an extracted `--scope <value>` between `config`
and the subcommand. A `--scope` other than `global` SHALL be relayed unmodified
so upstream refuses it.

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

#### Scenario: A missing subcommand prints cospec's config help

- **WHEN** `cospec config` or `cospec config --scope global` runs without
  `--json`
- **THEN** cospec prints the text `cospec config --help` prints on stderr and
  exits 1, where the binary prints its own help naming bare `openspec`

#### Scenario: A non-directory cwd is refused before spawning

- **WHEN** `cospec config` runs with a `--cwd` that is not a directory
- **THEN** it answers with the resolver's `directory not found` refusal and
  nothing is spawned

### Requirement: Non-interactive config subcommands are piped disciplined passthroughs

`cospec config path|list|get|set|unset|reset --all -y|profile <preset>` SHALL
run as piped `passthroughOpenspec` calls with `expect.exitCodes` `[0, 1]`, since
upstream exits 1 for negative results (an unset or unknown key, an invalid
stored config). Any other exit code or a deny-listed stdout marker SHALL be a
cospec failure. cospec SHALL NOT re-implement upstream's key validation, value
coercion or prototype-pollution guard, nor read or write the global config file
itself.

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

#### Scenario: Output is relayed with remedies respelled

- **WHEN** a piped config subcommand answers
- **THEN** its stdout and stderr are relayed as the binary wrote them, except
  that a failed answer's remedy sentences and a successful answer's next-step
  lines (``Config updated. Run `openspec update` in your projects to apply.``)
  are spelled through cospec from the pinned binary's allowlist, a next-step
  line only where it is a whole line

### Requirement: Interactive config subcommands hand over the terminal

`cospec config edit`, `config profile` with no preset, and `config reset --all`
without `-y`/`--yes` SHALL be terminal-handover execs: the binary is
version-asserted, then spawned with inherited stdio, `shell: false`, and
`BUN_BE_BUN=1`, `OPENSPEC_TELEMETRY=0`, `OPENSPEC_NO_COMPLETIONS=1`, and the
child's exit code, including `130` for a cancelled prompt, SHALL propagate
unchanged. They SHALL declare no `RunExpectation` (the handover exception). Each
SHALL pre-validate before handing over.

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
- **THEN** `</dev/null` cancels it with `Reset cancelled.` and exit `130`,
  resetting nothing, and `(sleep 3; echo y) |` resets the global config with
  exit `0`, as the binary answers each under Node with telemetry off

#### Scenario: An answer already waiting on the pipe is taken

- **WHEN** `cospec config reset --all` runs with `y` or `n` already waiting on
  its stdin pipe when the prompt is drawn
- **THEN** `echo y |` resets the global config and `echo n |` prints
  `Reset cancelled.`, resetting nothing, each with exit `0`

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

#### Scenario: Pre-validation answers parse refusals on cospec's streams

- **WHEN** a handover subcommand's argv is parsed against the command table and
  commander would refuse it
- **THEN** cospec answers on its own streams exactly as the binary does, ahead
  of the `--json` envelope

#### Scenario: Profile without a TTY or with an unreadable config is piped

- **WHEN** `cospec config profile` runs with no preset
- **THEN** it first reads the global config with a read-only
  `config list --json`, relaying the binary's unreadable-config refusal
  respelled without handing over, and when cospec's stdout is not a TTY (the
  binary's own test) it runs as a piped call relayed through the allowlist

#### Scenario: Reset without a TTY forwards stdin to the confirm

- **WHEN** `cospec config reset --all` without `-y` runs with cospec's stdin not
  a TTY (the binary's own test, its confirm reading stdin)
- **THEN** it runs as a piped call forwarding stdin unmodified: input arriving
  after the prompt is drawn is taken, a closed input cancels with exit `130`,
  and input already waiting when it is drawn is taken, as the binary answers
  under Node with telemetry off

### Requirement: Every config subcommand honours the one-JSON-document invariant

`cospec config --json` SHALL emit exactly one JSON document on stdout for every
subcommand. `list --json` SHALL relay upstream's document verbatim under the
single-document check. `path`, `get`, `set`, `unset`, and `reset` SHALL emit
cospec-owned envelopes with `version: 1` and the invoked `command`, `get` adding
the raw printed string in `value` and a `found` boolean, and
`set`/`unset`/`reset` an `ok` boolean and a `message`.

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

#### Scenario: JSON for a handover subcommand is refused, not faked

- **WHEN** `--json` is given for a terminal-handover subcommand
- **THEN** it is refused with an envelope whose `ok` is `false` and exit 1,
  never faked by suppressing the interaction

#### Scenario: Commander parse refusals precede every envelope

- **WHEN** the binary's commander refuses the argv while parsing it (an unknown
  option, a missing value or argument, too many arguments)
- **THEN** its text is relayed on stderr with exit 1 and no document, ahead of
  every envelope, per the forward-row contract's rule for a parse refusal

### Requirement: Config notes name the keys cospec's own behaviour overrides

`cospec config` SHALL print an advisory note on **stderr**, never stdout, after
a successful write to a key whose effect cospec overrides. After
`set telemetry.enabled` it SHALL state that cospec forces `OPENSPEC_TELEMETRY=0`
on every wrapped call, so the setting affects bare `openspec` runs only. After a
`profile`, or a `set` of `profile`, `workflows` or `delivery`, it SHALL state
that harness files come from cospec canon and direct the user to
`cospec update`. No other key SHALL be annotated.

#### Scenario: Telemetry note accompanies a successful write

- **WHEN** `cospec config set telemetry.enabled true` succeeds
- **THEN** the forced-environment note appears on stderr, stdout carries only
  the wrapped success output, and under `--json` stdout is still exactly one
  document

#### Scenario: Profile note redirects to cospec update

- **WHEN** `cospec config profile <preset>` succeeds
- **THEN** a stderr note states that cospec's harness files come from cospec
  canon and names `cospec update` as the command to run

#### Scenario: An unannotated key produces no note

- **WHEN** `cospec config set defaultStore <id>` succeeds
- **THEN** no advisory note is printed on stderr
