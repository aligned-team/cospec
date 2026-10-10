# cli-option-contract Specification

## Purpose

cospec's command-line argv parse SHALL match the pinned OpenSpec binary's: one
command table declares every command's positionals and flags (handled, accepted
no-op, or pending), and one two-phase parser reads it so that table-parsed
commands refuse an unknown option or excess positional before doing any work,
forwarded commands (`show`, `templates`, `schemas`, `schema`, `store`,
`workset`, `config`) leave unknown-option authority to the binary itself, and
global flags, `--`, help, and `--store-path` are handled the same way upstream's
commander parser handles them. The same table drives argv parsing, per-command
`--help`, and shell completion, so the three surfaces cannot drift from one
another, and a reachability test holds every pinned upstream command, flag, and
positional accountable to the table, an alias, or a named pending entry.

## Requirements

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
`--flag value` and `--flag=value` forms — except on a row marked
`operands: 'lenient'` (`help`, whose upstream counterpart is commander's own
help command), which SHALL ignore an undeclared option and an excess operand as
that help command does. An undeclared option SHALL fail with
`cospec <command>: unknown option '<x>'` on stderr, a closest-match suggestion
on the next line when an unknown long (`--`) option is close to a long flag the
command's help offers or `--version` — chosen as commander's `suggestSimilar`
chooses it: the whole token without its `--` (an `=value` included), no
one-character candidate, similarity `(length - distance) / length` above 0.4,
every candidate tied at the best distance within 3, as `Did you mean '<a>'?` or
`Did you mean one of '<a>', '<b>'?` (an unknown short option gets none, as
commander offers none) — and exit 1, before the command does any work. A
declared value-taking flag with no value SHALL fail with
`cospec <command>: option '<flag> <placeholder>' argument missing` and exit 1. A
flag marked pending SHALL consume its value if it takes one and SHALL fail with
`cospec <command>: '<flag>' is not supported yet` and exit 1. A positional
beyond the row's declared slots SHALL fail with
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

#### Scenario: An unknown short option gets no suggestion

- **WHEN** `cospec archive c -Y` or `cospec list -x` runs
- **THEN** stderr is exactly `cospec <command>: unknown option '<x>'`, with no
  `Did you mean` line, exit 1, as the pinned binary refuses it;
  `cospec list --jsn` still suggests `--json`

#### Scenario: A long option's suggestion is commander's

- **WHEN** `cospec list --j`, `list --lng`, `list --srt=name`, `list --jsn=1`,
  `list --sore` or `list --verson` runs
- **THEN** the first four get no `Did you mean` line, `list --sore` gets
  `Did you mean one of '--sort', '--store'?` and `list --verson`
  `Did you mean '--version'?`, each exit 1, as the pinned binary suggests

### Requirement: The global version flag is honoured in any position

cospec SHALL treat `-V` / `--version` as a global flag in any position before a
`--` terminator, on every command (`table` and `forward` alike) and after an
unknown command, as the pinned binary's program-level option is: the program
level finds it wherever it appears, even where a command-level flag would take
it as its value (`cospec list --store --version`). A short cluster that starts
with `-V` (`-Vh`) SHALL be a version request too, as commander splits it at the
program level. A version request SHALL print cospec's own version on stdout and
exit 0, ahead of every other answer, and SHALL do no work.

#### Scenario: A post-command version flag prints the version

- **WHEN** `cospec list --version` or `cospec validate x -V` runs
- **THEN** stdout is cospec's version, nothing is listed or validated, and the
  exit code is 0

#### Scenario: A version flag wins over an unknown option

- **WHEN** `cospec list --bogus --version` runs
- **THEN** stdout is cospec's version and the exit code is 0

### Requirement: The program level resolves before the command sees its argv

cospec SHALL resolve its global flags in two phases, as the pinned binary's
commander does, and SHALL never rank an answer of one phase against an answer of
the other. Phase A, the program level, SHALL read the tokens before the command
name (or before a leading `--`) and SHALL stop with its own answer, in this
order: a `--cwd`/`--store` left without a value; then, at the first help flag or
undeclared option (`--store-path` included), the program's help when a help flag
appears anywhere in the argv phase A never dispatched, otherwise that option's
refusal (`--store-path`'s redirect); with no command name, an empty
`--cwd`/`--store` value, then the program's help. An unknown command SHALL
answer with the program's help when a help flag follows it before a `--`, and
otherwise as an unknown command. Only a known command SHALL reach phase B, where
the command's own argv SHALL resolve in commander's per-level order: a missing
value (a global's or the row's own, anywhere in the argv — a trailing
`--store-path` answers its redirect here), then help, then the row's other parse
refusals — the first undeclared option or pending flag in argv order, then too
many arguments, then `--store-path` — then an empty `--cwd`/`--store` value,
then the command runs. A missing value SHALL outrank an undeclared option or
pending flag earlier in the argv, because commander raises it during its scan
and reports an unknown option only after it. A `forward` row SHALL receive its
argv unchanged apart from the threaded global flags. In phase B, a token right
after the space form of a value-taking flag the row declares — or its subcommand
declares, once the first positional names one — SHALL be that flag's value
whatever it looks like (a help flag, a global flag, `--`), as commander takes
it: it is never read as help and never absorbed as a global. The one exception
is upstream's program-level `--no-color`: every `--no-color` before the first
`--` SHALL be taken out before the command's argv is read, so it is never a
value and the flag before it takes the next token or has none; past a `--` that
a flag took as its value, `--no-color` and `-V`/`--version` SHALL be the
command's own tokens, refused as unknown options like any other.

#### Scenario: A value-taking flag's value is never help or a global

- **WHEN** `cospec status --change --help`, `cospec init --tools --help`,
  `cospec templates --schema --json` or `cospec show c1 --type --store st` runs
- **THEN** the token after the flag is its value, as the pinned binary reads it
  (`Change '--help' not found`, `Invalid tool(s): --help`): `status` looks up a
  change named `--help` (`cospec status: unknown change '--help'`), `init`
  refuses its pending `--tools` with the value consumed, and the forwarded rows
  hand both tokens to the binary, which answers — never cospec's help, and never
  a global `--json` or `--store`; each exits 1 in both tools

#### Scenario: A program-level --no-color is never a value

- **WHEN** `cospec status --change --no-color`, `cospec list --store --no-color`
  or `cospec store setup s1 --path --no-color` runs
- **THEN** the flag is left without a value and refused as argument missing,
  exit 1, as the pinned binary refuses it, and nothing is written;
  `cospec status --change --no-color c1` looks up `c1`

#### Scenario: Past a -- taken as a value the program level has stopped

- **WHEN** `cospec status --change -- --version` or
  `cospec status --change -- --no-color` runs
- **THEN** stderr refuses `--version` (or `--no-color`) as an unknown option of
  `status` and the exit code is 1, as the pinned binary does; after
  `cospec instructions proposal --change -- --json` the `--json` still applies
  and stdout is one JSON document

#### Scenario: Help before the command name wins over the command's argv

- **WHEN** `cospec --help list --store` runs
- **THEN** stdout is cospec's program help and the exit code is 0, as
  `openspec --help list --store` prints its program help

#### Scenario: A pre-command --store-path stops the program level

- **WHEN** `cospec --store-path /x list --store` runs
- **THEN** stderr is the `--store-path` redirect and the exit code is 1; the
  missing `--store` value is never reached

#### Scenario: A command's missing value is raised before its help

- **WHEN** `cospec status --help --change` runs
- **THEN** stderr is `cospec status: option '--change <slug>' argument missing`
  and the exit code is 1, as `openspec status --help --change` refuses

#### Scenario: A trailing missing value outranks an earlier unknown option

- **WHEN** `cospec status --help --bogus --change`,
  `cospec list --bogus --store-path` or `cospec list --sort x --store-path` runs
- **THEN** the answer is the missing value (`--change`'s refusal, or the
  `--store-path` redirect), not help, the unknown option or the pending flag,
  and the exit code is 1, as the pinned binary refuses the missing value

#### Scenario: A precedence matrix pins both phases against the binary

- **WHEN** the precedence-matrix contract test runs each of its argv rows
  through cospec and the pinned binary (under Node, so a leading `--` arrives
  intact)
- **THEN** each row's outcome (version, whose help, unknown command,
  parse-rejected, parsed) and exit code match the binary's, and each row
  declared cospec-only matches its stated outcome

### Requirement: A bare help token follows the command's upstream counterpart

A bare `help` as the first token after the command name that reaches the
command's own argv — after any global flag cospec absorbs (`--no-color`,
`--json`, `--cwd <path>`, `--store <id>`) — SHALL print the command's help and
SHALL never run the command on every `table` row. On a `forward` row it SHALL
print help only where the upstream command offers commander's implicit
`help [subcommand]` (a command with subcommands whose upstream counterpart does
not refuse `help`: `config` and `schema`); `store` and `workset` SHALL hand it
to their wrapper, which refuses it as an unknown subcommand as upstream does,
and a `forward` row without subcommands SHALL pass it to the binary as an
operand. After a leading `--`, or a `--` that is the first token to reach a row
with subcommands, `help` as the first operand SHALL print help on any row that
offers the implicit help subcommand (`config`, `schema`, `new`, `completion`)
and SHALL otherwise stay an operand.

#### Scenario: help after an absorbed global flag

- **WHEN** `cospec config --no-color help` or
  `cospec completion --no-color help` runs
- **THEN** stdout is that command's help and the exit code is 0, as
  `openspec config --no-color help` prints it

#### Scenario: The implicit help subcommand after a leading --

- **WHEN** `cospec -- config help path` runs
- **THEN** stdout is the `config path` help and the exit code is 0, as
  `openspec -- config help path` prints it

#### Scenario: store refuses a help subcommand

- **WHEN** `cospec store help` runs
- **THEN** stderr names `help` as an unknown subcommand and the exit code is 1,
  as `openspec store help` refuses it

### Requirement: An undeclared option before the command name is refused

cospec SHALL refuse any option before the command name that is not one of its
global flags (`--json`, `--no-color`, `-h`/`--help`, `-V`/`--version`, `--cwd`,
`--store`) or `--store-path`, on every command (`table` and `forward` alike) and
when the command is unknown or absent, with `cospec: unknown option '<x>'` on
stderr, a closest-match suggestion among the global long flags on the next line
when an unknown long (`--`) option is within edit distance of one — an unknown
short option gets none, as commander offers none — and exit 1, before the
command does any work, as the pinned binary's program-level commander refuses
it. The refusal is a phase A answer: it SHALL yield only to a version request, a
missing global value before it and a help flag anywhere in the argv, and SHALL
come before anything after the command name is parsed, since the pinned binary
refuses it before it parses the subcommand at all. Of an undeclared option and
`--store-path` before the command name, the first in argv SHALL answer, and
`--store-path` SHALL answer with its redirect. A `--` before the command name is
a terminator, not an undeclared option.

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

#### Scenario: An unknown short option before the command gets no suggestion

- **WHEN** `cospec -x list` runs
- **THEN** stderr is exactly `cospec: unknown option '-x'`, with no
  `Did you mean` line, and the exit code is 1, as `openspec -x list` refuses

### Requirement: Global flags stop at a -- terminator

cospec SHALL recognise its global flags (`--json`, `--no-color`, `-h`/`--help`,
`-V`/`--version`, `--cwd`, `--store`) before the command name and anywhere after
it up to a `--` terminator, and SHALL treat every token after a post-command
`--` as an operand of the command, as the pinned binary's commander does. The
`--` and its operands SHALL reach the table parser, or the wrapped binary on a
`forward` row, unchanged, and a global flag cospec threads onto a wrapped call
SHALL be inserted before that `--` — right after the command path, ahead of
every user token. A `--` before the command name SHALL NOT be refused as an
unknown option: the token after it is the command name, the next one is still
dispatched as the subcommand — whatever it looks like on a `forward` row with
subcommands, and on a `table` row when it names one of the row's subcommands —
and every later token is an operand of the command, as the pinned binary's
program-level commander treats it. A `--` that is the first token to reach a row
with subcommands SHALL route the same way: the next token is the subcommand, and
a `--` stays in front of the remaining operands.

#### Scenario: A -- right after a command with subcommands

- **WHEN** `cospec config -- path` or `cospec store -- list` runs
- **THEN** it answers as `cospec config path` or `cospec store list` does, as
  the pinned binary does, and `cospec config --` answers as a bare
  `cospec config`, exit 1

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
exit 1. A missing value SHALL be refused while its phase parses — before that
phase's help and parse refusals, as the pinned binary raises its own
`option '--store <id>' argument missing` while it parses a command level — and a
missing value after the command name SHALL never be reached when phase A has
already answered (an undeclared option, `--store-path` or a help flag before the
command name). An empty value SHALL be refused only after every parse-time
answer — a version request, help, an unknown option, a `--store-path` refusal,
an unknown command and the command's own parse refusals — and before the command
does any work, as the pinned binary accepts an empty value while it parses and
refuses an empty store id in its action code; with no command name, an empty
value SHALL be refused unless a help flag is given. The command SHALL never run
against the local repo instead.

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
relayed untouched. The binary's own guidance inside a successful answer is not
that content: the command-bearing fields of a successful `context`, `store` or
`doctor` answer (a member's `fetch`, a diagnostic's `fix`) SHALL be spelled
through cospec in the parsed `--json` document, cospec's human text rendered
from the rewritten document and never from the binary's text, and a successful
`workset` or `config` answer's next-step line SHALL be spelled only where the
whole line is one of the allowlisted sentences. The respelling SHALL come from
one allowlist of the pinned binary's exact sentences, each rewritten only where
an answer holds it verbatim, with the path, name or list each sentence names
re-emitted as the binary wrote it; no pattern over free text (a lead-in word, a
quote, a paren) SHALL decide what is a remedy. Every sentence in the pinned
binary that names a bare `openspec <command>` SHALL be in that allowlist, listed
with its reason as never printed by a cospec relay, or listed as reachable
through a successful answer cospec relays untouched with the roadmap PR that
owns its spelling, checked against the pinned dist. A pre-spawn guard SHALL
answer only an argv the binary would not answer itself — except on a
terminal-handover leaf (`workset open`, `config edit`, `config profile` with no
preset, `config reset --all` without `-y`), whose argv is parsed against the
table before the terminal is handed over, so a refusal the binary would print on
the inherited terminal is answered on cospec's own streams, identical to the
binary's answer for the same argv: a declared value-taking flag left without its
value SHALL reach the binary as commander's missing value (or, for a flag the
wrapper lifts itself, `config --scope`, SHALL be refused in the same
`cospec <command>: option '<flag> <placeholder>' argument missing` form), and
`show`'s item check SHALL treat an option `show` does not declare as the item,
as the binary does, and split a short option as commander does (a value-taking
short takes the rest of its token as its value, `-r=1` included; a boolean short
leaves `-<rest>` as the next token). An option where a forwarded command's
subcommand belongs SHALL reach the binary at the command's level, never be
refused as an unknown subcommand, a missing or unknown subcommand of `store` or
`workset` SHALL be the binary's own answer, delegated with the user's argv and
`--json` threaded when asked, and a help flag after a `--store-path` the
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
  change whose schema template, the `config.yaml` context, a `rules` entry and a
  referenced spec's Purpose each hold
  `Run openspec init to create a root here.`, or whose template, context or
  rules hold a `Fix:`/`Fetch:` line, a line shaped like a JSON `"fix"` field, or
  a forged `<referenced_stores>` block
- **THEN** the answer is the binary's byte-for-byte, text and `--json`, exit 0
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

#### Scenario: A forwarded group's missing or unknown subcommand is the binary's

- **WHEN** `cospec store --bogus`, `cospec workset -- --bogus`,
  `cospec store bogus --json` or `cospec workset --json` runs
- **THEN** the answer is the binary's for the same argv — `Missing subcommand`
  for an option-shaped or `--`-guarded token, `unknown_store_subcommand` or
  `unknown_workset_subcommand` as one document under `--json` — with
  `cospec store` / `cospec workset` in place of the bare command, exit 1

#### Scenario: A terminal-handover leaf answers its parse refusal before the handover

- **WHEN** `cospec workset open <name> --bogus`, `cospec config edit --bogus` or
  `cospec config reset --all --tool` runs
- **THEN** cospec's stderr and exit code equal the binary's for the same argv,
  and no child is handed the terminal

#### Scenario: A successful answer's own guidance names cospec

- **WHEN** `cospec context` succeeds on a root whose references include a usable
  store and an unregistered id, or `cospec workset create <name>` succeeds
- **THEN** the `Fetch:`/`Fix:` lines and `fetch`/`fix` fields, and the
  `Open it any time with:` line, name `cospec`, and every other byte is the
  binary's

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
text respelled to name `cospec store register <path>` and `--store <id>`. On a
command whose upstream counterpart declares the hidden `--store-path <path>`
(the row's `declaresStorePath`: `list`, `view`, `archive`, `validate`, `status`,
`instructions`, `new`, `context`, `doctor`, `show`, `schemas`), the space form
SHALL take the next token as its value, and under `--json` the refusal SHALL be
exactly one JSON document on stdout carrying `status[0].code`
`store_path_not_supported`, `target` `store.id`, and `message` and `fix`
respelled the same way. On every other command it SHALL be an unknown option
that takes no value: refused in scan order after any earlier unknown option,
outranked by help, and answered as stderr text even under `--json`. The text
SHALL never name bare `openspec`. The refusal SHALL land where the pinned binary
refuses `--store-path`: on a declaring `table` row after the row's
unknown-option, pending and too-many-arguments refusals (a `--store-path` with
no value is refused while parsing); on a `forward` row the binary SHALL be the
authority — cospec SHALL NOT pre-decide from a raw `--store-path` token, SHALL
hand the row's argv to its wrapper unchanged, SHALL relay any refusal the binary
reaches first and SHALL answer the redirect in place of the binary's own
`--store-path` refusal only, never for a call that exited 0 — except on a
terminal-handover leaf (`config edit`, `config profile` with no preset,
`config reset --all` without `-y`, `workset open`), where cospec SHALL answer
the redirect without spawning when `--store-path` stands in option position by
the row's declared flags; and after a leading `--` a `--store-path` SHALL be an
operand.

#### Scenario: --store-path after the command name

- **WHEN** `cospec list --store-path /x` or `cospec list --store-path=/x` runs
- **THEN** stderr carries the redirect text naming `cospec store register` and
  `--store <id>`, nothing is listed, and the exit code is 1

#### Scenario: --store-path before the command name

- **WHEN** `cospec --store-path /x list` runs
- **THEN** cospec prints the same redirect text, treats no part of the
  invocation as a command name, and exits 1

#### Scenario: An earlier refusal answers before --store-path

- **WHEN** `cospec list --store-path /x --bogus`,
  `cospec list a --store-path /x` or
  `cospec config path --bogus --store-path /x` runs
- **THEN** the answer is the unknown option `--bogus` or too many arguments, as
  the pinned binary answers, and the exit code is 1

#### Scenario: A --store-path that is another flag's value on a forward row

- **WHEN** `cospec schema init s1 --description --store-path` runs in a project
- **THEN** the schema `s1` is created and the exit code is 0, as the pinned
  binary answers

#### Scenario: A token after --store-path is its value

- **WHEN** `cospec list --store-path --json`, `cospec list --store-path --store`
  or `cospec show c1 --store-path --help` runs
- **THEN** that token is `--store-path`'s value, neither absorbed as a global
  flag nor read as help: stderr carries the redirect text, stdout is empty, and
  the exit code is 1, as the pinned binary answers; before the command name
  `--store-path` takes no value, so `cospec --store-path --help list` prints the
  program's help and exits 0

#### Scenario: --store-path on a terminal-handover leaf

- **WHEN** `cospec config edit --store-path /x` runs
- **THEN** stderr carries the redirect, the exit code is 1, and no editor runs
  and no config file is written

#### Scenario: --store-path under --json

- **WHEN** `cospec list --json --store-path /x` runs
- **THEN** stdout is one JSON document whose `status[0].code` is
  `store_path_not_supported` and whose `fix` names `cospec store register`

#### Scenario: --store-path where upstream never declares it

- **WHEN** `cospec init --store-path --help`, `cospec init --bogus --store-path`
  or `cospec init --store-path --json` runs
- **THEN** it takes no value, as the pinned binary answers: the first prints
  `init`'s help and exits 0, the second refuses `--bogus`, and the third prints
  the redirect on stderr with nothing on stdout, exit 1

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

### Requirement: init declares --profile and --language

`init` SHALL declare upstream's `--profile <profile>` (values `core` and
`custom`) and `--language <language>` as handled flags in the command table,
with no pending marking, and the two corresponding entries SHALL NOT appear in
`apps/cli/test/contract/parity-pending.yaml`. Their behaviour is the
`workflow-profiles` capability's.

#### Scenario: The flags are handled

- **WHEN** `cospec init --profile core --help` and the reachability test run
- **THEN** `--profile` and `--language` are listed in `init`'s help from the
  table, and the reachability test resolves both to the table alone

### Requirement: The parity pending list is empty

Once every change that owned a pending surface has landed, the reachability test
SHALL assert that `apps/cli/test/contract/parity-pending.yaml` holds no entry,
and every negative case that needs a pending entry SHALL build it on a synthetic
table row, not on a real surface, so that closing a surface never breaks a test
that was only using it as a fixture.

#### Scenario: A leftover entry fails

- **WHEN** `parity-pending.yaml` holds any entry
- **THEN** the reachability test fails naming it

#### Scenario: The docs page renders an empty list

- **WHEN** the docs data loader reads an empty `parity-pending.yaml`
- **THEN** the build succeeds and the page shows no capabilities as still being
  implemented
