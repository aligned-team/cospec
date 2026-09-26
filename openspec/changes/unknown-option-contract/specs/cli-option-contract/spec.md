# Spec Delta

## ADDED Requirements

### Requirement: One command table declares every command surface

cospec SHALL hold one command table (`apps/cli/src/core/command-table.ts`) that
declares, for every cospec command, its positionals and every flag, including
every flag the pinned `COMMAND_REGISTRY` gives the same-named upstream command.
Each flag SHALL be marked exactly one of **handled**, **accepted no-op**, or
**pending** (carrying the slug of the change that implements it). cospec's own
flags SHALL sit in the same table, marked **handled**. Each command row SHALL
carry a parse policy, `table` or `forward`. The same table SHALL drive argv
parsing, per-command `--help` and the completion spec, so none of the three can
drift from the others.

#### Scenario: A registry flag is present in the table

- **WHEN** the pinned `COMMAND_REGISTRY` lists a flag on a command that cospec
  implements under the same name
- **THEN** the command's table row declares that flag with one of the three
  markings, and `cospec <command> --help` lists it unless it is pending

#### Scenario: Help and completion come from the table

- **WHEN** a flag is added to a command's table row
- **THEN** `cospec <command> --help` and `cospec completion <shell>` both list
  it with no other edit

### Requirement: Table-parsed commands reject what the table does not declare

On a command whose parse policy is `table`, cospec SHALL parse argv with the
table parser and SHALL accept only declared positionals and flags, in both the
`--flag value` and `--flag=value` forms. An undeclared option SHALL fail with
`cospec <command>: unknown option '<x>'` on stderr, a closest-match suggestion
on the next line when one is within edit distance, and exit 1, before the
command does any work. A declared value-taking flag with no value SHALL fail
with `cospec <command>: option '<flag> <placeholder>' argument missing` and
exit 1. A flag marked pending SHALL consume its value if it takes one and SHALL
fail with `cospec <command>: '<flag>' is not supported yet` and exit 1. A
positional beyond the row's declared slots SHALL fail with
`cospec <command>: too many arguments. Expected N argument(s) but got M.` and
exit 1, before any work, on every `table` row; it SHALL never be dropped while
the command runs on the rest. No flag or flag value SHALL ever be read as a
positional. Each `table` row SHALL declare whether it accepts the global
`--json`; on a row that does not, `--json` SHALL be refused with exactly one
JSON document on stdout (`{version: 1, command, ok: false, message}`, the
`cospec completion` precedent) and exit 1, before the command does any work, and
SHALL never be silently ignored.

#### Scenario: Unknown option is refused before any work

- **WHEN** `cospec list --bogus` runs in a repo with active changes
- **THEN** stderr is `cospec list: unknown option '--bogus'`, nothing is listed,
  and the exit code is 1

#### Scenario: An excess positional is refused, not dropped

- **WHEN** `cospec new feat add login` runs
- **THEN** stderr is
  `cospec new: too many arguments. Expected 2 arguments but got 3.`, no change
  named `add` is created, and the exit code is 1

#### Scenario: A pending flag never leaks its value into a positional

- **WHEN** `cospec validate --type change x` runs and `--type` is pending
- **THEN** cospec exits 1 with `cospec validate: '--type' is not supported yet`,
  and no item named `change` or `x` is validated

#### Scenario: A pending value-taking flag on init scaffolds nothing

- **WHEN** `cospec init --language fr .` runs and `--language` is pending
- **THEN** cospec exits 1 with the not-supported-yet message and no `fr`
  directory is created

#### Scenario: A command that takes no --json refuses it with one JSON document

- **WHEN** `cospec view --json` runs in a repo with an `openspec/` directory
- **THEN** stdout is exactly one JSON document with `command` `view` and `ok`
  `false`, no dashboard is printed, the wrapped `openspec view` is not spawned,
  and the exit code is 1

#### Scenario: Missing value is refused

- **WHEN** `cospec status --change` runs with no following token
- **THEN** cospec exits 1 with
  `cospec status: option '--change <slug>' argument missing`

#### Scenario: Closest match is suggested

- **WHEN** `cospec status --schem custom` runs
- **THEN** the refusal names `--schema` as the suggestion and exits 1

### Requirement: The global version flag is honoured in any position

cospec SHALL treat `-V` / `--version` as a global flag in any position before a
`--` terminator, on every command (`table` and `forward` alike), as the pinned
binary's program-level option is. A version request SHALL print cospec's own
version on stdout and exit 0, ahead of `--help`, an unknown option, a
`--store-path` refusal and the command itself, and SHALL do no work.

#### Scenario: A post-command version flag prints the version

- **WHEN** `cospec list --version` or `cospec validate x -V` runs
- **THEN** stdout is cospec's version, nothing is listed or validated, and the
  exit code is 0

#### Scenario: A version flag wins over an unknown option

- **WHEN** `cospec list --bogus --version` runs
- **THEN** stdout is cospec's version and the exit code is 0

### Requirement: An undeclared option before the command name is refused

cospec SHALL refuse any option before the command name that is not one of its
global flags (`--json`, `--no-color`, `-h`/`--help`, `-V`/`--version`, `--cwd`,
`--store`) or `--store-path`, on every command (`table` and `forward` alike) and
when the command is unknown or absent, with `cospec: unknown option '<x>'` on
stderr, a closest-match suggestion among the global flags on the next line when
one is within edit distance, and exit 1, before the command does any work, as
the pinned binary's program-level commander refuses it. The refusal SHALL come
after a version request, a missing global value given before the command name
and `--help`, and ahead of a missing or empty global value given after the
command name, a `--store-path` refusal and the command itself, since the pinned
binary refuses it before it parses the subcommand at all. `--store-path` before
the command name with no undeclared option SHALL keep its redirect. A `--`
before the command name is a terminator, not an undeclared option.

#### Scenario: An unknown option before the command does not run it

- **WHEN** `cospec --bogus list` runs in a repo with active changes
- **THEN** stderr is `cospec: unknown option '--bogus'`, nothing is listed, and
  the exit code is 1, as `openspec --bogus list` refuses

#### Scenario: A post-command missing value does not outrank it

- **WHEN** `cospec --bogus list --store` runs
- **THEN** stderr is `cospec: unknown option '--bogus'` and the exit code is 1,
  as `openspec --bogus list --store` refuses

#### Scenario: A near-miss global flag is suggested

- **WHEN** `cospec --jsn list` runs
- **THEN** stderr is `cospec: unknown option '--jsn'` followed by
  `Did you mean '--json'?`, and the exit code is 1

### Requirement: Global flags stop at a -- terminator

cospec SHALL recognise its global flags (`--json`, `--no-color`, `-h`/`--help`,
`-V`/`--version`, `--cwd`, `--store`) before the command name and anywhere after
it up to a `--` terminator, and SHALL treat every token after a post-command
`--` as an operand of the command, as the pinned binary's commander does. The
`--` and its operands SHALL reach the table parser, or the wrapped binary on a
`forward` row, unchanged, and a global flag cospec threads onto a wrapped call
SHALL be inserted before that `--`. A `--` before the command name SHALL NOT be
refused as an unknown option: the token after it is the command name, the next
one is still read as the subcommand on a command that has subcommands, and every
later token is an operand of the command, as the pinned binary's program-level
commander treats it.

#### Scenario: A global flag after -- is an operand

- **WHEN** `cospec list -- --json` runs
- **THEN** stderr is
  `cospec list: too many arguments. Expected 0 arguments but got 1.`, nothing is
  listed, and the exit code is 1, as `openspec list -- --json` refuses

#### Scenario: A -- before the command runs the command

- **WHEN** `cospec -- list` runs
- **THEN** `list` runs as `cospec list` does, as `openspec -- list` does, and
  `cospec -- list --help` is refused as too many arguments with exit 1, as
  `openspec -- list --help` is

#### Scenario: A forwarded command receives the operand verbatim

- **WHEN** `cospec templates -- --json` runs
- **THEN** the wrapped binary's `error: too many arguments for 'templates'` is
  relayed on stderr and the exit code is 1

### Requirement: Global --cwd and --store refuse a missing or empty value

cospec SHALL refuse a global `--cwd` or `--store` given with no value, in any
position before a `--` terminator, with
`cospec <command>: option '<flag> <placeholder>' argument missing` on stderr
(`cospec: …` when no command was given) and exit 1, and one given an empty value
(`--store=`, `--cwd ''`) with
`cospec <command>: option '<flag> <placeholder>' argument must not be empty` and
exit 1. A missing value SHALL be refused after a version request and ahead of
`--help`, an unknown option, a `--store-path` refusal and the command itself, as
the pinned binary raises its own `option '--store <id>' argument missing` while
it parses a command level — except that a missing value after the command name
SHALL yield to an undeclared option before it, which the pinned binary refuses
at the program level before it parses the subcommand. An empty value SHALL be
refused only after every parse-time answer — a version request, `--help`, an
unknown option, a `--store-path` refusal, an unknown command and the command's
own parse refusals — and before the command does any work, as the pinned binary
accepts an empty value while it parses and refuses an empty store id in its
action code. The command SHALL never run against the local repo instead.

#### Scenario: A trailing --store is refused, not dropped

- **WHEN** `cospec list --store` runs in a repo with active changes
- **THEN** stderr is `cospec list: option '--store <id>' argument missing`,
  nothing is listed, and the exit code is 1

#### Scenario: An empty --cwd is refused

- **WHEN** `cospec list --cwd=` runs
- **THEN** stderr is
  `cospec list: option '--cwd <path>' argument must not be empty` and the exit
  code is 1

#### Scenario: Help wins over an empty value

- **WHEN** `cospec list --store= --help` runs
- **THEN** stdout is the `list` help and the exit code is 0, as
  `openspec list --store= --help` prints its help

### Requirement: Forwarded commands are declared, not re-parsed

On a command whose parse policy is `forward`, cospec SHALL declare the command's
positionals and flags in the table for reachability, `--help` and completion.
The wrapper MAY consume its own declared cospec-only flags and MAY apply its own
pre-spawn guards (a subcommand check, a canon-type destination refusal, the
`--store-path` interception), but SHALL pass every remaining token to the
wrapped binary unchanged after threading the global flags, and SHALL add no
rejection of its own for a token the table does not declare — the wrapped binary
remains the authority on unknown options for the surfaces it owns.

#### Scenario: Upstream's unknown-option answer is relayed on a forwarded command

- **WHEN** `cospec templates --bogus` runs
- **THEN** the wrapped binary's `error: unknown option '--bogus'` is relayed on
  stderr and the exit code is 1

#### Scenario: Upstream's tolerance is preserved on a forwarded command

- **WHEN** `cospec show <item> --bogus` runs
- **THEN** the outcome is whatever the wrapped `show` produces for that argv,
  and cospec adds no refusal of its own

### Requirement: Three upstream flags are accepted as no-ops

cospec SHALL accept `init --no-animation`, `archive -y` / `archive --yes` and
`list --changes` without error and without changing behaviour, because cospec
already behaves as each flag requests.

#### Scenario: Accepted no-ops do not fail

- **WHEN** `cospec archive <change> -y`, `cospec init --no-animation .` and
  `cospec list --changes` run
- **THEN** each behaves exactly as it does without the flag

### Requirement: --store-path is refused with a redirect

cospec SHALL refuse `--store-path`, in the space and `=` forms, both before and
after the command name and on every command, with exit 1 and upstream's redirect
text respelled to name `cospec store register <path>` and `--store <id>`. Under
`--json` the refusal SHALL be exactly one JSON document on stdout carrying
`status[0].code` `store_path_not_supported`, `target` `store.id`, and `message`
and `fix` respelled the same way. The text SHALL never name bare `openspec`.

#### Scenario: --store-path after the command name

- **WHEN** `cospec list --store-path /x` or `cospec list --store-path=/x` runs
- **THEN** stderr carries the redirect text naming `cospec store register` and
  `--store <id>`, nothing is listed, and the exit code is 1

#### Scenario: --store-path before the command name

- **WHEN** `cospec --store-path /x list` runs
- **THEN** cospec prints the same redirect text, treats no part of the
  invocation as a command name, and exits 1

#### Scenario: --store-path under --json

- **WHEN** `cospec list --json --store-path /x` runs
- **THEN** stdout is one JSON document whose `status[0].code` is
  `store_path_not_supported` and whose `fix` names `cospec store register`

### Requirement: Per-command help is rendered from the table

`cospec <command> --help` SHALL render the command's positionals and every
handled or accepted-no-op flag from the table, with each flag's placeholder and
description. `cospec show --help` SHALL list `--diff` and `--requirements`, and
SHALL describe `--requirements-only` as the deprecated alias of `--deltas-only`.

#### Scenario: show --help lists the spec and diff flags

- **WHEN** `cospec show --help` runs
- **THEN** stdout lists `--diff`, `--requirements`, `--deltas-only`,
  `--requirements-only`, `--no-scenarios`, `-r, --requirement <id>` and
  `--type <change|spec>`, and exits 0

### Requirement: Every pinned upstream surface resolves somewhere

A contract test SHALL import, in tests only, `COMMAND_REGISTRY` from the pinned
dist's `core/completions/command-registry.js`, `AI_TOOLS` and `TOOL_ID_ALIASES`
from `core/config.js`, and `ALL_WORKFLOWS` from `core/profiles.js`. For every
command path, positional, flag and flag value in the registry, every tool id and
alias, and every workflow id, the test SHALL require that the entry resolves to
exactly one of: the command table, `apps/cli/src/canon/parity/aliases.yaml`,
`exceptions.yaml`, `deprecated.yaml`, or
`apps/cli/test/contract/parity-pending.yaml`. An entry resolving nowhere, or in
two places, SHALL fail the test. A `deprecated.yaml` entry SHALL count only when
the pinned binary marks the surface deprecated, either in its registry
description or by printing its deprecation warning on stderr when the surface
runs. Every `parity-pending.yaml` entry SHALL carry the slug of the change that
removes it. The resolution SHALL be two-way: every table flag or flag value
marked pending SHALL have exactly one `parity-pending.yaml` entry with the same
owner slug, and every `parity-pending.yaml` entry SHALL name a surface the walk
produces (or a declared hidden fixture) that the table marks pending for that
owner; a stale entry SHALL fail the test. The test SHALL read cospec's harness
ids only through the `HARNESS_NAMES` export of
`apps/cli/src/harness/adapters.ts`. `exceptions.yaml` SHALL hold exactly one
entry: upstream `update`'s offer to self-upgrade the wrapped binary.

#### Scenario: A registry entry that resolves nowhere fails the test

- **WHEN** the pinned registry gains a flag that no table row, alias, exception,
  deprecation or pending entry names
- **THEN** the reachability test fails naming that entry

#### Scenario: A pending entry is tagged with its owner

- **WHEN** `parity-pending.yaml` is read
- **THEN** every entry carries a change slug, and the test fails on an untagged
  entry

#### Scenario: A stale pending entry fails the test

- **WHEN** `parity-pending.yaml` lists a surface the table marks handled, or a
  surface the pinned registry no longer has, or the table marks a flag pending
  that no `parity-pending.yaml` entry names
- **THEN** the reachability test fails naming that entry

#### Scenario: Deprecation is verified against the binary

- **WHEN** `deprecated.yaml` lists the `change` and `spec` noun groups
- **THEN** the test confirms `change` is marked deprecated in the registry
  description and `spec` prints its deprecation warning on stderr when
  `openspec spec list` runs, and fails if either mark is absent

### Requirement: A per-command differential fixture pins the parse contract

For every `table` command, a contract fixture SHALL run the same argv through
`cospec` and the pinned binary in the same fixture repo and SHALL classify each
run as parse-rejected (an unknown-option, argument-missing, too-many- arguments
or `--store-path` refusal) or parsed (any other outcome). Both tools SHALL land
in the same class, and when both are parse-rejected the exit codes SHALL be
equal. A fixture row declared `cospec-only` SHALL assert that cospec parses and
the binary parse-rejects; a row declared `pending` SHALL assert that cospec
fails with the not-supported-yet message and exit 1.

#### Scenario: Same accept-or-reject answer

- **WHEN** the fixture runs `validate --typo x`, `status --schem custom`,
  `list --changes`, `archive c -y` and `init --no-animation .` through both
  tools
- **THEN** each pair lands in the same class with the same exit code when
  rejected

#### Scenario: cospec-only surfaces are expected divergence

- **WHEN** the fixture runs `list --blocked` or `validate --fast`
- **THEN** cospec parses, the binary parse-rejects, and the row passes
