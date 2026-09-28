# Spec Delta

## MODIFIED Requirements

### Requirement: Table-parsed commands reject what the table does not declare

On a command whose parse policy is `table`, cospec SHALL parse argv with the
table parser and SHALL accept only declared positionals and flags, in both the
`--flag value` and `--flag=value` forms — except on a row marked
`operands: 'lenient'` (`help`, whose upstream counterpart is commander's own
help command), which SHALL ignore an undeclared option and an excess operand as
that help command does. An undeclared option SHALL fail with
`cospec <command>: unknown option '<x>'` on stderr, a closest-match suggestion
on the next line when one is within edit distance, and exit 1, before the
command does any work. A declared value-taking flag with no value SHALL fail
with `cospec <command>: option '<flag> <placeholder>' argument missing` and
exit 1. A flag marked pending SHALL consume its value if it takes one and SHALL
fail with `cospec <command>: '<flag>' is not supported yet` and exit 1. A
positional beyond the row's declared slots SHALL fail with
`cospec <command>: too many arguments. Expected N argument(s) but got M.` and
exit 1, before any work, on every `table` row but a lenient one; it SHALL never
be dropped while the command runs on the rest. A required positional given
nothing SHALL fail with `cospec <command>: missing required argument '<name>'`
on stderr, followed by `cospec <command>: usage — <usage>`, exit 1, on every
`table` row, after the first unknown option or pending flag and before too many
arguments, a `--store-path` refusal or any check the command makes (its root
included), and as text even under `--json`, as commander refuses it while it
parses; a value holding a compound positional's separator
(`new "<type>: <description>"`) SHALL fill the positionals after it. No flag or
flag value SHALL ever be read as a positional. Each `table` row SHALL declare
whether it accepts the global `--json`; on a row that does not, `--json` SHALL
be refused with exactly one JSON document on stdout
(`{version: 1, command, ok: false, message}`, the `cospec completion` precedent)
and exit 1, before the command does any work, and SHALL never be silently
ignored. Every refusal of `new`'s own (no `openspec/` tree, an unknown type, a
cospec type the repo has no schema for, a slug it cannot derive, an invalid
slug, an existing or archived change, a failed wrapped call) SHALL, under
`--json`, be one JSON document on stdout in the shape the wrapped
`new change --json` gives its own failures
(`{change: null, status: [{severity: 'error', code: 'change_error', message}]}`),
exit 1, with nothing on stderr; a failed wrapped call SHALL be answered with the
binary's own reason (its `new change --json` document's message, after any
warning line the binary logs ahead of it), as `cospec new: <reason>` in text and
as the document's message under `--json`, with each of upstream's own remedy
sentences it holds verbatim spelled through cospec, and everything else left
untouched byte-for-byte: a path or name, however it reads (an apostrophe in it,
`run openspec init` or `(openspec list)` in a directory name, quoted or not),
prose naming a command, and everything from a schema load error's
`Failed to parse schema at '…':` / `Invalid schema at '…':` payload on (the
schema's path and quoted excerpt, the user's content even where it copies an
upstream sentence); a missing type or slug and an unknown option SHALL stay text
parse refusals, as the binary's commander refusals are, answered before any
other refusal (a missing `openspec/` tree included). `show` with no item (an
empty token is none, and a short option's attached value — `-r1`, `-r=1`, `-rr`
— is that option's value, as commander splits it) SHALL, under `--json`, be one
`{status: [{severity: 'error', code: 'missing_item', message}]}` document on
stdout, exit 1, with nothing on stderr. Each `table` row SHALL likewise declare
whether its command honours the global `--store <id>`; on a row that does not,
`--store` SHALL be refused as an unknown option in either form, after the
command name or before it, before the command does any work, and SHALL never be
silently ignored. A cospec-only positional that spells what an upstream flag
selects (`status`'s change, for `--change` and `--all`) SHALL count as an excess
argument when given together with that flag, as upstream, which has no such
positional, refuses it. A short-option cluster (`-yh`) SHALL split as commander
splits it: only when its first letter is a short flag the command declares — a
boolean leaving the rest as the next token, a value-taking flag taking the rest
as its value — and otherwise it SHALL be refused whole as one unknown option;
`-h` SHALL never start a split. On a `forward` row the cluster SHALL reach the
binary as typed, except that a `-h` the split would reach SHALL print cospec's
help.

#### Scenario: A status positional beside --change or --all is an excess argument

- **WHEN** `cospec status foo --change bar` or `cospec status foo --all` runs
- **THEN** stderr is
  `cospec status: too many arguments. Expected 0 arguments but got 1.`, nothing
  is reported, no JSON document is printed even under `--json`, and the exit
  code is 1, as the pinned binary refuses the same argv

#### Scenario: A short-option cluster splits as commander splits it

- **WHEN** `cospec archive c -yh` or `cospec config reset -yh` runs
- **THEN** stdout is cospec's help for that command and the exit code is 0,
  nothing is archived or reset, and no `Usage: openspec` screen is relayed
- **AND WHEN** `cospec archive c -yx`, `cospec archive c -hy` or
  `cospec list -yh` runs
- **THEN** the refusal names `-x`, `-hy` or `-yh` as the unknown option, exit 1,
  as the pinned binary answers

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

#### Scenario: new without its schema answers a --json caller with one document

- **WHEN** `cospec new feat x --json` runs in a repo with no `feat` schema
- **THEN** stdout is one JSON document whose `change` is `null` and whose
  `status[0].code` is `change_error`, stderr is empty, nothing is written, and
  the exit code is 1

#### Scenario: Every other new refusal answers a --json caller with one document

- **WHEN** `cospec new bogus x --json`, `cospec new feat Bad_Name --json`,
  `cospec new feat ex --json` (`ex` an active change) or
  `cospec new "feat: !!!" --json` runs
- **THEN** stdout is one JSON document whose `change` is `null` and whose
  `status[0].code` is `change_error`, stderr is empty, nothing is written, and
  the exit code is 1
- **AND WHEN** `cospec new feat --json` runs
- **THEN** stderr is `cospec new: missing required argument 'slug'` and `new`'s
  usage, stdout is empty, and the exit code is 1
- **AND WHEN** `cospec new feat` or `cospec new feat --json` runs where there is
  no `openspec/` tree
- **THEN** stderr carries the missing-argument refusal, not the root refusal,
  stdout is empty, and the exit code is 1

#### Scenario: A missing required positional is refused before --store-path

- **WHEN** `cospec new feat --store-path /x` runs, with or without `--json`
- **THEN** stderr is `cospec new: missing required argument 'slug'` followed by
  `cospec new: usage — cospec new <type> <slug> | cospec new "<type>: <description>"`,
  stdout is empty, nothing is written, and the exit code is 1, as the pinned
  binary's `new change --store-path /x` refuses its missing `name`
- **AND WHEN** `cospec apply --json`, `cospec migrate` or
  `cospec archive --store-path /x` runs
- **THEN** stderr names that command's missing positional, no document is
  printed, and the exit code is 1
- **AND WHEN** `cospec instructions --change x` runs, with or without `--json`
- **THEN** `[artifact]` is optional as upstream declares it, and the binary's
  own `Missing required argument <artifact>. Valid artifacts: …` answer is
  relayed — one JSON document under `--json` — exit 1
- **AND WHEN** `cospec feedback` or `cospec __complete` runs
- **THEN** the refusal is the missing-argument refusal the pinned binary gives
  the same argv, exit 1
- **AND WHEN** `cospec new "feat: add a thing" --store-path /x` runs
- **THEN** the compound value fills the slug and the `--store-path` redirect
  answers

#### Scenario: A failed wrapped new change answers with the binary's reason

- **WHEN** `cospec new broken x` runs and the project schema `broken` has a
  `schema.yaml` the binary cannot parse
- **THEN** stderr is `cospec new: Failed to parse schema at '<path>': …`, the
  binary's parse reason, not the wrapped call's exit code, and the exit code is
  1
- **AND WHEN** `cospec new broken x --json` runs
- **THEN** stdout is one JSON document whose `status[0].message` is that parse
  reason, stderr is empty, and the exit code is 1
- **AND WHEN** the parse reason's path or quoted schema excerpt contains
  `openspec init`
- **THEN** that text is relayed unchanged; only a remedy ahead of the payload is
  respelled to `cospec`
- **AND WHEN** the binary cannot create the change directory (EACCES) and the
  project path contains `openspec list`, `openspec new` or `openspec init`
- **THEN** the reason is the binary's
  `EACCES: permission denied, mkdir '<path>'` with the path unchanged, in text
  and as the `--json` document's message
- **AND WHEN** that path has an apostrophe in it (`Bob's run openspec init dir`)
- **THEN** the path is still relayed unchanged
- **AND WHEN** the project's `openspec/config.yaml` has a malformed `store:` key
  and its unquoted path contains `run openspec init` or `(openspec list)`
- **THEN** the reason is the binary's `Invalid store declaration in <path>: …`
  with the path unchanged

#### Scenario: show with an empty item name gives cospec's item-name error

- **WHEN** `cospec show ""` or `cospec show -- ""` runs
- **THEN** stderr is
  `cospec show: an item name is required (cospec show <change-or-spec>)`, the
  binary's "Nothing to show" screen is not relayed, and the exit code is 1
- **AND WHEN** `cospec show "" --json` runs
- **THEN** stdout is one JSON document whose `status[0].code` is `missing_item`,
  stderr is empty, and the exit code is 1
- **AND WHEN** `cospec show -r1`, `cospec show -r=1`, `cospec show -rr` or
  `cospec show --no-scenarios -r1` runs, with or without `--json`
- **THEN** it answers as for no item — the stderr error, or under `--json` the
  one `missing_item` document — exit 1, because commander gives `-r` the rest of
  its token as the value and the binary is left no item

#### Scenario: A command that never reads --store refuses it

- **WHEN** `cospec init --store nosuch --harness claude` or
  `cospec update --store foo` runs
- **THEN** stderr starts with `cospec init: unknown option '--store'` (or
  `cospec update: …`), nothing is scaffolded or regenerated, and the exit code
  is 1, as `openspec init --store nosuch` refuses it

#### Scenario: Missing value is refused

- **WHEN** `cospec status --change` runs with no following token
- **THEN** cospec exits 1 with
  `cospec status: option '--change <slug>' argument missing`

#### Scenario: Closest match is suggested

- **WHEN** `cospec status --schem custom` runs
- **THEN** the refusal names `--schema` as the suggestion and exits 1

#### Scenario: help ignores what commander's help command ignores

- **WHEN** `cospec help --bogus` or `cospec help list extra` runs
- **THEN** stdout is the program help, or `cospec list --help`'s text, and the
  exit code is 0, as the pinned binary answers the same argv

### Requirement: Forwarded commands are declared, not re-parsed

On a command whose parse policy is `forward`, cospec SHALL declare the command's
positionals and flags in the table for reachability, `--help` and completion.
The wrapper MAY consume its own declared cospec-only flags and MAY apply its own
pre-spawn guards (a subcommand check, a canon-type destination refusal), but
SHALL pass every remaining token to the wrapped binary unchanged after threading
the global flags, and SHALL add no rejection of its own for a token the table
does not declare — the wrapped binary remains the authority on unknown options
for the surfaces it owns. Every flag cospec threads onto a wrapped call
(`--json`, `--no-color`, `--store <id>`) SHALL be placed right after the command
path, ahead of the user's tokens, so it never becomes the value of a
value-taking flag the user left without one — except that on a forwarded command
whose upstream counterpart declares no `--store` (`templates`, every `schema`
subcommand), a `--store <id>` typed after the command name SHALL reach the
binary where the user typed it, never absorbed as cospec's global; and cospec's
runtime output SHALL name a wrapped call as the wrapped OpenSpec call, never as
a bare `openspec` command. A remedy the binary writes as a bare
`openspec <command>` in an answer cospec relays SHALL be spelled as the cospec
command of the same shape, or dropped where cospec has no such command, while
the content of a successful answer (a change, a spec, instructions) SHALL be
relayed untouched — except, on a successful `cospec instructions` answer, the
command-bearing fields the binary itself wrote (a referenced store's fetch
recipe and diagnostic fixes, and the built-in `spec-driven` schema's own
reference lines when that schema resolves from the pinned package), which SHALL
be respelled field by field from the binary's `--json` document, never by a
pattern over the rendered text. The respelling SHALL come from one allowlist of
the pinned binary's exact sentences, each rewritten only where an answer holds
it verbatim, with the path, name or list each sentence names re-emitted as the
binary wrote it; no pattern over free text (a lead-in word, a quote, a paren)
SHALL decide what is a remedy. Every sentence in the pinned binary that names a
bare `openspec <command>` SHALL be in that allowlist, listed with its reason as
never printed by a cospec relay, or listed as reachable through a successful
answer cospec relays untouched with the roadmap PR that owns its spelling,
checked against the pinned dist, and a line the enumeration reads from a pinned
schema file SHALL count as a comment only where the file's own syntax makes it
one — a `#`-led line inside a YAML block scalar is rendered text. A pre-spawn
guard SHALL answer only an argv the binary would not answer itself: a declared
value-taking flag left without its value SHALL reach the binary as commander's
missing value (or, for a flag the wrapper lifts itself, `config --scope`, SHALL
be refused in the same
`cospec <command>: option '<flag> <placeholder>' argument missing` form), and
`show`'s item check SHALL treat an option `show` does not declare as the item,
as the binary does, and split a short option as commander does (a value-taking
short takes the rest of its token as its value, `-r=1` included; a boolean short
leaves `-<rest>` as the next token). An option where a forwarded command's
subcommand belongs SHALL reach the binary at the command's level, never be
refused as an unknown subcommand, and a help flag after a `--store-path` the
upstream command does not declare SHALL print cospec's help, never be taken as
its value. Every refusal the binary's commander raises while it parses — unknown
option or command, missing value, missing required argument, too many arguments,
and the rest of commander's parse-time shapes — SHALL be relayed as the binary's
answer, never reported as a wrapped-call failure.

#### Scenario: A forwarded command's missing required argument is relayed

- **WHEN** `cospec store unregister` or `cospec store remove --json` runs
- **THEN** stderr is the binary's `error: missing required argument 'id'`,
  stdout carries no document, and the exit code is 1, as `openspec` answers —
  never a report that the wrapped OpenSpec call emitted no JSON

#### Scenario: A dangling value-taking flag is never given a threaded flag

- **WHEN** `cospec store setup s1 --path`,
  `cospec schema init s1 --json --description` or
  `cospec show c1 --store st --type` runs
- **THEN** the wrapped binary refuses the missing value
  (`error: option '--path <path>' argument missing`), exit 1, exactly as
  `openspec` does for the same argv, and nothing is written on disk — no store
  at `./--json`, no schema whose description is `--json`

#### Scenario: A --store upstream never declares is parsed where it was typed

- **WHEN** `cospec templates --bogus --store st`,
  `cospec schema which s1 --bogus --store st` or
  `cospec templates --store-path /x --store st` runs, `st` a registered store
- **THEN** the refusal names `--bogus`, or is cospec's `--store-path` redirect,
  exit 1, as `openspec` answers the same argv — never `unknown option '--store'`
- **AND WHEN** `cospec schema init s1 --store st --description` runs
- **THEN** the binary refuses the missing value, exit 1, and nothing is written

#### Scenario: A relayed remedy names cospec

- **WHEN** `cospec show <change>` runs, with or without `--json`, on a change
  that has no proposal.md
- **THEN** the relayed refusal says `Run "cospec status --change <change>"`
  where the binary says `openspec status`, and is otherwise the binary's
- **AND WHEN** `cospec show <id>` names both a change and a spec
- **THEN** stderr says `Pass --type change|spec.` with no noun-form
  `openspec change show / openspec spec show` clause
- **AND WHEN** `cospec view` runs
- **THEN** its footer names `cospec list --changes` and `cospec list --specs`
- **AND WHEN** `cospec context`, `cospec show <item>` or
  `cospec instructions <artifact> --change <id>` runs where there is no OpenSpec
  root
- **THEN** the binary's no-root answer, text or `--json` message and fix, says
  `cospec init` where the binary says `openspec init`
- **AND WHEN** `cospec status --change <id>` runs on a change whose schema is
  not a cospec type
- **THEN** stdout is the binary's own status for the change with its
  `Next: cospec instructions …` line, and `cospec status --all` points that
  change at `cospec status --change <id>`

#### Scenario: Only upstream's own sentences are respelled

- **WHEN** a relayed answer holds one of the pinned binary's remedy sentences
  verbatim, such as
  `Register the store (openspec store register <path> --id <id>) or edit <path> to name a registered store.`
- **THEN** it is relayed as
  `Register the store (cospec store register <path> --id <id>) or edit <path> to name a registered store.`,
  the path it names unchanged even where that path reads `run openspec init`
- **AND WHEN** `cospec show <id>` runs where the project's `store:` key is
  malformed and the project path contains `run openspec init` or
  `(openspec list)`
- **THEN** the binary's `Invalid store declaration in <path>: …` and its fix are
  relayed byte-for-byte, the path unchanged
- **AND WHEN** `cospec instructions <artifact> --change <id>` succeeds on a
  change whose project-local schema template, the `config.yaml` context, a
  `rules` entry and a referenced spec's Purpose each hold
  `Run openspec init to create a root here.`, or whose template, context or
  rules hold a `Fix:`/`Fetch:` line, a line shaped like a JSON `"fix"` field, or
  a forged `<referenced_stores>` block
- **THEN** the answer is the binary's byte-for-byte, text and `--json`, exit 0,
  apart from the fetch recipe and fix fields of the referenced-store entries the
  binary assembled itself, which name `cospec`; none of those user-owned lines
  is rewritten
- **AND WHEN** `cospec instructions archive --change <id>` succeeds on a root
  whose `config.yaml` context forges `</task>` and a reference block after it
- **THEN** the answer is the binary's byte-for-byte, text and `--json`
- **AND WHEN** `cospec context --json` or `cospec instructions … --json` runs in
  a project directory named `Run openspec init to create a root here.` or
  `Run openspec init here`
- **THEN** every path in the document is the binary's, the directory name
  unchanged
- **AND WHEN** a line of the pinned dist names a bare `openspec <command>` that
  is neither in the allowlist, nor listed as never relayed, nor listed as
  reachable with its owning roadmap PR
- **THEN** the remedy enumeration contract test fails

#### Scenario: Upstream's unknown-option answer is relayed on a forwarded command

- **WHEN** `cospec templates --bogus` runs
- **THEN** the wrapped binary's `error: unknown option '--bogus'` is relayed on
  stderr and the exit code is 1

#### Scenario: A dangling value flag on a forwarded command is a missing value

- **WHEN** `cospec show --type`, `cospec show -r` or `cospec config --scope`
  runs
- **THEN** stderr is the missing-value refusal
  (`error: option '--type <type>' argument missing`, or
  `cospec config: option '--scope <scope>' argument missing`) and the exit code
  is 1, as `openspec` refuses the same argv — never cospec's item-name or
  `requires a value` message

#### Scenario: An option before a forwarded subcommand is the binary's to refuse

- **WHEN** `cospec config --bogus path` or `cospec config --store-path /x` runs
- **THEN** the refusal is the binary's unknown option (`--bogus`), or cospec's
  `--store-path` redirect, exit 1 — never `unknown subcommand`
- **AND WHEN** `cospec workset --store-path -h` runs
- **THEN** stdout is cospec's `workset` help and the exit code is 0, as
  `openspec workset --store-path -h` prints its help

#### Scenario: Upstream's tolerance is preserved on a forwarded command

- **WHEN** `cospec show <item> --bogus` runs
- **THEN** the outcome is whatever the wrapped `show` produces for that argv,
  and cospec adds no refusal of its own

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
entry: upstream `update`'s offer to self-upgrade the wrapped binary. An
`aliases.yaml` entry SHALL name an upstream workflow, tool id, tool alias,
command path (a top-level command or a subcommand) or flag (a command path and
the flag), with the cospec spelling it resolves to. A command or flag alias
SHALL count only where the command table marks that upstream spelling an alias
of the named cospec spelling — the parser accepts the upstream spelling and
reads it as the cospec one — and a surface the table marks an alias SHALL
resolve to `aliases.yaml` only, never to the table as well. That resolution
SHALL be two-way like the pending one: every alias marking in the table SHALL
have exactly one `aliases.yaml` entry naming the same spelling, and every
command or flag entry in `aliases.yaml` SHALL match a marking in the table. A
flag alias SHALL agree with upstream on whether the flag takes a value.

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

#### Scenario: An upstream flag spelling resolves through aliases.yaml

- **WHEN** the walk produces upstream's `init --tools` and the table marks
  `--tools` an alias of `--harness`
- **THEN** the entry resolves to `aliases.yaml` alone, and the test fails if the
  `aliases.yaml` entry, the table marking, or `--harness` itself is removed

#### Scenario: An upstream subcommand spelling resolves through aliases.yaml

- **WHEN** the walk produces upstream's `new change`, `completion generate` and
  the hidden `experimental`
- **THEN** each resolves to `aliases.yaml` alone, as the table marks them
  aliases of `new`, `completion` and `init`, while the flags and positionals the
  table declares beneath them resolve to the table
