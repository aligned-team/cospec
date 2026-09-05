## ADDED Requirements

### Requirement: Config argv is built locally, not by the shared passthrough helper

`cospec config` SHALL build its wrapped argv with a local, pure builder rather
than routing through `core/passthrough-command.ts`, and SHALL NOT call
`resolveRoot`, because OpenSpec's config is machine-global rather than
root-scoped. The built argv SHALL never contain `--store` or any store argument,
SHALL never append a trailing `--no-color` (cospec's spawn already prefixes
`--no-color` ahead of the subcommand, and upstream declares the flag on the
program rather than the leaf), SHALL append `--json` only for the `list`
subcommand, and SHALL emit an extracted `--scope <value>` between `config` and
the subcommand rather than after it. A `--scope` value other than `global` SHALL
be relayed to the wrapped binary unmodified so upstream's own refusal is what
the user sees.

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

- **WHEN** `cospec config` is invoked with no subcommand
- **THEN** the command exits 1 with a usage message listing the supported
  subcommands, and no wrapped binary is spawned

### Requirement: Non-interactive config subcommands are piped disciplined passthroughs

`cospec config path|list|get|set|unset|reset --all -y|profile <preset>` SHALL
run as piped `passthroughOpenspec` calls declaring `expect.exitCodes` of
`[0, 1]`, because upstream sets exit 1 for ordinary negative results — an unset
key, an unknown key, an invalid stored config — which are results to relay
rather than wrapped-call violations. Any other exit code, or a deny-listed
stdout marker, SHALL surface as a cospec failure rather than as a relayed
result. Wrapped stdout and stderr SHALL be relayed verbatim, and cospec SHALL
NOT re-implement upstream's key validation, value coercion, or its
prototype-pollution guard, nor read or write the global config file itself.

#### Scenario: Reading the config path and list succeeds

- **WHEN** `cospec config path` and `cospec config list --json` run against the
  real pinned binary with a sandboxed config home
- **THEN** `path` prints the global config path and exits 0, and `list --json`
  emits exactly one parseable JSON document relayed verbatim from upstream

#### Scenario: An unset key is relayed as exit 1, not as a wrapper failure

- **WHEN** `cospec config get <key>` runs for a key with no stored value
- **THEN** the command exits 1 with upstream's own message and does not report a
  wrapped-call discipline violation

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

#### Scenario: Editing hands the terminal to the editor

- **WHEN** `cospec config edit` is invoked
- **THEN** cospec spawns the wrapped `openspec config edit` with inherited stdio
  and exits with exactly the child's exit code

#### Scenario: A cancelled prompt propagates 130

- **WHEN** `cospec config profile` is cancelled at its interactive menu and the
  wrapped process exits 130
- **THEN** `cospec config profile` exits 130 rather than normalising the code

#### Scenario: A non-TTY caller gets upstream's own refusal

- **WHEN** `cospec config profile` runs with no preset and no TTY attached
- **THEN** upstream's own interactive-mode-required error is relayed verbatim
  and its exit code propagated, with no cospec-invented substitute

### Requirement: Every config subcommand honours the one-JSON-document invariant

`cospec config --json` SHALL emit exactly one parseable JSON document on stdout
for every subcommand, not only for the one upstream supports. `list --json`
SHALL relay upstream's document verbatim under the single-document check.
`path`, `get`, `set`, `unset`, and `reset` SHALL emit cospec-owned envelopes
carrying `version: 1` and the invoked `command`, with `get` reporting the raw
printed string in `value` plus a `found` boolean, and `set`/`unset`/`reset`
reporting an `ok` boolean and a `message`. `--json` against a terminal-handover
subcommand SHALL be refused with an envelope whose `ok` is `false` and exit 1,
never faked by suppressing the interaction.

#### Scenario: A cospec-owned envelope is exactly one document

- **WHEN** `cospec config get <unset-key> --json` runs
- **THEN** stdout is exactly one JSON document with `version: 1`,
  `found: false`, and a null `value`, and the command exits 1

#### Scenario: JSON is refused for an interactive subcommand

- **WHEN** `cospec config edit --json` is invoked
- **THEN** stdout is exactly one JSON document reporting `ok: false` and naming
  the subcommand as interactive, the command exits 1, and no editor is spawned

### Requirement: Config notes name the keys cospec's own behaviour overrides

`cospec config` SHALL print an advisory note on **stderr** — never stdout, so
the one-JSON-document invariant holds — after a successful write to a key whose
effect cospec overrides or bypasses. After `set telemetry.enabled`, the note
SHALL state that cospec forces `OPENSPEC_TELEMETRY=0` on every wrapped call, so
the setting affects bare `openspec` runs only. After a successful `profile`, or
a `set` of `profile`, `workflows`, or `delivery`, the note SHALL state that
cospec's harness files are generated from cospec canon and direct the user to
`cospec update` rather than upstream's suggested `openspec update`. No other key
SHALL be annotated.

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
