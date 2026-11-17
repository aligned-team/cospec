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

cospec SHALL hold one command table (`apps/cli/src/core/command-table.ts`)
declaring, for every command, its positionals and every flag, including every
flag the pinned `COMMAND_REGISTRY` gives the same-named upstream command. Each
flag SHALL be marked exactly one of **handled** (cospec's own flags included),
**accepted no-op**, or **pending** (with its change's slug). Each row SHALL
carry a parse policy, `table` or `forward`. The table SHALL drive argv parsing,
`--help` and completion.

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

On a `table` row cospec SHALL parse argv with the table parser and accept only
declared positionals and flags, in the `--flag value` and `--flag=value` forms;
no flag or flag value SHALL ever be read as a positional. Each parse refusal
SHALL exit 1 before any work, in the shapes and order the scenarios pin, as the
pinned binary's commander refuses. A row marked `operands: 'lenient'` (`help`)
SHALL ignore an undeclared option and an excess operand as commander's help
command does.

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

#### Scenario: An unknown long option gets commander's suggestion

- **WHEN** a `table` row is given an undeclared option
- **THEN** stderr is `cospec <command>: unknown option '<x>'` and the exit code
  is 1, before any work
- **AND WHEN** it is a long (`--`) option close to a long flag the command's
  help offers or `--version`
- **THEN** the next line suggests as commander's `suggestSimilar` does: the
  whole token without its `--` (an `=value` included), no one-character
  candidate, similarity `(length - distance) / length` above 0.4, every
  candidate tied at the best distance within 3, as `Did you mean '<a>'?` or
  `Did you mean one of '<a>', '<b>'?`; an unknown short option gets none

#### Scenario: Missing values and pending flags are refused

- **WHEN** a declared value-taking flag is given no value
- **THEN** stderr is
  `cospec <command>: option '<flag> <placeholder>' argument missing`, exit 1
- **AND WHEN** a flag marked pending is given
- **THEN** it consumes its value if it takes one and fails with
  `cospec <command>: '<flag>' is not supported yet`, exit 1

#### Scenario: Too many arguments is refused on every non-lenient row

- **WHEN** a positional beyond the row's declared slots is given on a `table`
  row not marked lenient
- **THEN** stderr is
  `cospec <command>: too many arguments. Expected N argument(s) but got M.`,
  exit 1, before any work, and the positional is never dropped while the command
  runs on the rest
- **AND WHEN** a cospec-only positional that spells what an upstream flag
  selects (`status`'s change, for `--change` and `--all`) is given with that
  flag
- **THEN** it counts as an excess argument, as upstream refuses it

#### Scenario: A missing required positional is a text parse refusal

- **WHEN** a required positional of a `table` row is given nothing
- **THEN** stderr is `cospec <command>: missing required argument '<name>'`
  followed by `cospec <command>: usage — <usage>`, exit 1, as text even under
  `--json`, answered after the first unknown option or pending flag and before
  too many arguments, a `--store-path` refusal or any check the command makes
  (its root included)
- **AND WHEN** a value holds a compound positional's separator
  (`new "<type>: <description>"`)
- **THEN** it fills the positionals after it

#### Scenario: Each row declares whether it takes --json

- **WHEN** `--json` is given on a `table` row that does not declare it
- **THEN** stdout is exactly one `{version: 1, command, ok: false, message}`
  document (the `cospec completion` precedent), exit 1, before any work, and
  `--json` is never silently ignored

#### Scenario: Every refusal of new's own is one change_error document

- **WHEN** `new --json` refuses for no `openspec/` tree, an unknown type, a
  cospec type with no schema in the repo, an underivable or invalid slug, an
  existing or archived change, or a failed wrapped call
- **THEN** stdout is one
  `{change: null, status: [{severity: 'error', code: 'change_error', message}]}`
  document, as the wrapped `new change --json` gives its failures, exit 1, with
  nothing on stderr
- **AND WHEN** `new` is given a missing type or slug or an unknown option
- **THEN** it stays a text parse refusal, as the binary's commander refusals
  are, answered before any other refusal (a missing `openspec/` tree included)

#### Scenario: A failed wrapped new change relays the binary's reason

- **WHEN** the wrapped `new change` fails
- **THEN** the answer is the binary's own reason (its `new change --json`
  message, after any warning line it logs first), as `cospec new: <reason>` in
  text and as the document's message under `--json`
- **AND** each upstream remedy sentence it holds verbatim is spelled through
  cospec, and everything else is untouched byte-for-byte: a path or name however
  it reads (an apostrophe, `run openspec init` or `(openspec list)` in a
  directory name, quoted or not), prose naming a command, and everything from a
  schema load error's `Failed to parse schema at '…':` /
  `Invalid schema at '…':` payload on, user content included

#### Scenario: show with no item under --json is one missing_item document

- **WHEN** `cospec show --json` is given no item (an empty token is none, and a
  short option's attached value — `-r1`, `-r=1`, `-rr` — is that option's value,
  as commander splits it)
- **THEN** stdout is one
  `{status: [{severity: 'error', code: 'missing_item', message}]}` document,
  exit 1, with nothing on stderr

#### Scenario: Each row declares whether it honours --store

- **WHEN** the global `--store <id>` is given, in either form, before or after
  the command name, on a `table` row that does not declare it
- **THEN** it is refused as an unknown option before any work and is never
  silently ignored

#### Scenario: Short-option clusters split only on a declared first letter

- **WHEN** a short-option cluster (`-yh`) reaches a `table` row
- **THEN** it splits as commander splits it only when its first letter is a
  short flag the command declares — a boolean leaving the rest as the next
  token, a value-taking flag taking the rest as its value — and is otherwise
  refused whole as one unknown option; `-h` never starts a split
- **AND WHEN** the cluster reaches a `forward` row
- **THEN** it reaches the binary as typed, except that a `-h` the split would
  reach prints cospec's help

### Requirement: The global version flag is honoured in any position

cospec SHALL treat `-V` / `--version` as a global flag in any position before a
`--` terminator, on every command (`table` and `forward`) and after an unknown
command, as the pinned binary's program level does, even where a command-level
flag would take it as its value (`cospec list --store --version`), and in a
short cluster starting with `-V` (`-Vh`). A version request SHALL print cospec's
version on stdout and exit 0, ahead of every other answer, doing no work.

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
the other. Phase A reads the tokens before the command name (or before a leading
`--`); only a known command reaches phase B, which resolves the command's own
argv. A `forward` row SHALL receive its argv unchanged apart from the threaded
global flags. Each phase SHALL answer in the order the scenarios pin.

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

#### Scenario: Phase A answers in commander's order

- **WHEN** the tokens before the command name are resolved
- **THEN** phase A stops with its own answer in this order: a `--cwd`/`--store`
  left without a value; then, at the first help flag or undeclared option
  (`--store-path` included), the program's help when a help flag appears
  anywhere in the argv phase A never dispatched, otherwise that option's refusal
  (`--store-path`'s redirect); with no command name, an empty `--cwd`/`--store`
  value, then the program's help
- **AND WHEN** the command is unknown
- **THEN** it answers with the program's help when a help flag follows it before
  a `--`, and otherwise as an unknown command

#### Scenario: Phase B answers in commander's per-level order

- **WHEN** a known command's argv is resolved
- **THEN** the answer is, in order: a missing value (a global's or the row's
  own, anywhere in the argv — a trailing `--store-path` answers its redirect
  here), then help, then the first undeclared option or pending flag in argv
  order, then too many arguments, then `--store-path`, then an empty
  `--cwd`/`--store` value, then the command runs
- **AND** a missing value outranks an undeclared option or pending flag earlier
  in the argv, because commander raises it during its scan and reports an
  unknown option only after it

#### Scenario: A space-form flag value is taken whatever it looks like

- **WHEN** in phase B a token follows the space form of a value-taking flag the
  row declares, or its subcommand declares once the first positional names one
- **THEN** that token is the flag's value whatever it looks like (a help flag, a
  global flag, `--`), never read as help and never absorbed as a global
- **AND WHEN** the token is `--no-color` before the first `--`
- **THEN** every such `--no-color` is taken out before the command's argv is
  read, so it is never a value and the flag before it takes the next token or
  has none; past a `--` a flag took as its value, `--no-color` and
  `-V`/`--version` are the command's own tokens, refused as unknown options

### Requirement: A bare help token follows the command's upstream counterpart

On every `table` row, a bare `help` as the first token reaching the command's
own argv (after any absorbed global: `--no-color`, `--json`, `--cwd <path>`,
`--store <id>`) SHALL print the command's help and never run it. On a `forward`
row it SHALL print help only where upstream offers commander's implicit
`help [subcommand]` (`config`, `schema`); `store` and `workset` SHALL hand it to
their wrapper, which refuses it, and a row without subcommands SHALL pass it to
the binary as an operand.

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

#### Scenario: help after a -- prints help only where implicit help exists

- **WHEN** `help` is the first operand after a leading `--`, or after a `--`
  that is the first token to reach a row with subcommands
- **THEN** it prints help on any row offering the implicit help subcommand
  (`config`, `schema`, `new`, `completion`) and otherwise stays an operand

### Requirement: An undeclared option before the command name is refused

cospec SHALL refuse any option before the command name that is not a global flag
(`--json`, `--no-color`, `-h`/`--help`, `-V`/`--version`, `--cwd`, `--store`) or
`--store-path`, on every command and when the command is unknown or absent, with
`cospec: unknown option '<x>'`, a suggestion among the global long flags for a
near-miss long option (none for a short one), and exit 1, before any work, as
the pinned binary does. A `--` before the command name is a terminator, not an
undeclared option.

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

#### Scenario: The refusal is a phase A answer

- **WHEN** an undeclared option precedes the command name
- **THEN** its refusal yields only to a version request, a missing global value
  before it and a help flag anywhere in the argv, and comes before anything
  after the command name is parsed, as the pinned binary refuses it before
  parsing the subcommand
- **AND WHEN** both an undeclared option and `--store-path` precede the command
  name
- **THEN** the first in argv answers, `--store-path` with its redirect

### Requirement: Global flags stop at a -- terminator

cospec SHALL recognise its global flags (`--json`, `--no-color`, `-h`/`--help`,
`-V`/`--version`, `--cwd`, `--store`) before the command name and after it up to
a `--` terminator; every token after a post-command `--` SHALL be an operand, as
the pinned binary's commander treats it. The `--` and its operands SHALL reach
the table parser, or the binary on a `forward` row, unchanged, with any threaded
global flag inserted right after the command path, ahead of every user token.

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

#### Scenario: A -- before the command name routes as commander routes it

- **WHEN** a `--` precedes the command name
- **THEN** it is not refused as an unknown option: the token after it is the
  command name, the next is still dispatched as the subcommand — whatever it
  looks like on a `forward` row with subcommands, and on a `table` row when it
  names one of the row's subcommands — and every later token is an operand
- **AND WHEN** a `--` is the first token to reach a row with subcommands
- **THEN** it routes the same way: the next token is the subcommand, and a `--`
  stays in front of the remaining operands

### Requirement: Global --cwd and --store refuse a missing or empty value

cospec SHALL refuse a global `--cwd` or `--store` given no value, anywhere
before a `--` terminator, with
`cospec <command>: option '<flag> <placeholder>' argument missing` (`cospec: …`
with no command), and one given an empty value (`--store=`, `--cwd ''`) with
`cospec <command>: option '<flag> <placeholder>' argument must not be empty`,
each exit 1. The command SHALL never run against the local repo instead.

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

#### Scenario: A missing value is refused while its phase parses

- **WHEN** a global `--cwd` or `--store` is left without a value
- **THEN** it is refused before that phase's help and parse refusals, as the
  pinned binary raises `option '--store <id>' argument missing` while it parses
  a command level, and a missing value after the command name is never reached
  when phase A has already answered (an undeclared option, `--store-path` or a
  help flag before the command name)

#### Scenario: An empty value is refused after every parse-time answer

- **WHEN** a global `--cwd` or `--store` is given an empty value
- **THEN** it is refused only after a version request, help, an unknown option,
  a `--store-path` refusal, an unknown command and the command's own parse
  refusals, and before the command does any work, as the pinned binary refuses
  an empty store id in its action code
- **AND WHEN** no command name is given
- **THEN** the empty value is refused unless a help flag is given

### Requirement: Forwarded commands are declared, not re-parsed

On a `forward` row cospec SHALL declare the command's positionals and flags in
the table for reachability, `--help` and completion. The wrapper MAY consume its
own cospec-only flags and apply pre-spawn guards, but SHALL pass every other
token to the binary unchanged after threading the global flags and SHALL add no
refusal for an undeclared token. Every refusal the binary's commander raises
while parsing SHALL be relayed as the binary's answer, never reported as a
wrapped-call failure.

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

#### Scenario: Threaded flags go ahead of the user's tokens

- **WHEN** cospec threads `--json`, `--no-color` or `--store <id>` onto a
  wrapped call
- **THEN** it is placed right after the command path, ahead of the user's
  tokens, so it never becomes the value of a value-taking flag left without one
- **AND WHEN** the upstream counterpart declares no `--store` (`templates`,
  every `schema` subcommand) and `--store <id>` is typed after the command name
- **THEN** it reaches the binary where the user typed it, never absorbed as
  cospec's global

#### Scenario: Relayed remedies are respelled from one allowlist

- **WHEN** cospec relays an answer holding a bare `openspec <command>` remedy
- **THEN** it is spelled as the cospec command of the same shape, or dropped
  where cospec has none, and cospec's own output names a wrapped call as the
  wrapped OpenSpec call, never as a bare `openspec` command
- **AND** the respelling comes from one allowlist of the pinned binary's exact
  sentences, each rewritten only where held verbatim, with the path, name or
  list it names re-emitted as the binary wrote it; no pattern over free text
  decides what is a remedy
- **AND** every pinned-binary sentence naming a bare `openspec <command>` is in
  that allowlist, listed with its reason as never printed by a relay, or listed
  as reachable through an untouched successful answer with its owning roadmap
  PR, checked against the pinned dist

#### Scenario: A successful answer's content is untouched but its guidance is not

- **WHEN** a wrapped call succeeds
- **THEN** its content (a change, a spec, instructions) is relayed untouched
- **AND** the command-bearing fields of a successful `context`, `store` or
  `doctor` answer (a member's `fetch`, a diagnostic's `fix`) are spelled through
  cospec in the parsed `--json` document, the human text is rendered from that
  rewritten document and never from the binary's text, and a `workset` or
  `config` next-step line is spelled only where the whole line is an allowlisted
  sentence

#### Scenario: Pre-spawn guards answer only what the binary would not

- **WHEN** a forwarded wrapper applies a pre-spawn guard
- **THEN** it answers only an argv the binary would not answer itself, except on
  a terminal-handover leaf (`workset open`, `config edit`, `config profile` with
  no preset, `config reset --all` without `-y`), whose argv is parsed against
  the table before the handover so a refusal is answered on cospec's streams,
  identical to the binary's for the same argv
- **AND** there a declared value-taking flag left without its value reaches the
  binary as commander's missing value, or, for `config --scope`, which the
  wrapper lifts itself, is refused as
  `cospec <command>: option '<flag> <placeholder>' argument missing`

#### Scenario: show's item check reads options as the binary does

- **WHEN** `show`'s pre-spawn item check reads its argv
- **THEN** an option `show` does not declare is the item, as the binary reads
  it, and a short option splits as commander splits it: a value-taking short
  takes the rest of its token as its value (`-r=1` included) and a boolean short
  leaves `-<rest>` as the next token

### Requirement: Three upstream flags are accepted as no-ops

cospec SHALL accept `init --no-animation`, `archive -y` / `archive --yes` and
`list --changes` without error and without changing behaviour, because cospec
already behaves as each flag requests.

#### Scenario: Accepted no-ops do not fail

- **WHEN** `cospec archive <change> -y`, `cospec init --no-animation .` and
  `cospec list --changes` run
- **THEN** each behaves exactly as it does without the flag

### Requirement: --store-path is refused with a redirect

cospec SHALL refuse `--store-path`, in the space and `=` forms, before and after
the command name on every command, with exit 1 and upstream's redirect text
respelled to name `cospec store register <path>` and `--store <id>`, never bare
`openspec`. The refusal SHALL land where the pinned binary refuses
`--store-path`, as the scenarios pin; after a leading `--` it SHALL be an
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

#### Scenario: A row whose upstream declares --store-path

- **WHEN** `--store-path` is given on a row marked `declaresStorePath` (`list`,
  `view`, `archive`, `validate`, `status`, `instructions`, `new`, `context`,
  `doctor`, `show`, `schemas`)
- **THEN** the space form takes the next token as its value, and under `--json`
  the refusal is exactly one JSON document carrying `status[0].code`
  `store_path_not_supported`, `target` `store.id`, and `message` and `fix`
  respelled the same way
- **AND** on a `table` row it is refused after the row's unknown-option, pending
  and too-many-arguments refusals, and one with no value is refused while
  parsing

#### Scenario: A row whose upstream never declares --store-path

- **WHEN** `--store-path` is given on any other command
- **THEN** it is an unknown option that takes no value: refused in scan order
  after any earlier unknown option, outranked by help, and answered as stderr
  text even under `--json`

#### Scenario: On a forward row the binary is the authority

- **WHEN** `--store-path` is given on a `forward` row
- **THEN** cospec does not pre-decide from the raw token, hands the row's argv
  to its wrapper unchanged, relays any refusal the binary reaches first, and
  answers the redirect only in place of the binary's own `--store-path` refusal,
  never for a call that exited 0
- **AND WHEN** the row is a terminal-handover leaf (`config edit`,
  `config profile` with no preset, `config reset --all` without `-y`,
  `workset open`) and `--store-path` stands in option position by the row's
  declared flags
- **THEN** cospec answers the redirect without spawning

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

A contract test SHALL import, in tests only, the pinned dist's
`COMMAND_REGISTRY`, `AI_TOOLS`, `TOOL_ID_ALIASES` and `ALL_WORKFLOWS`, and SHALL
require every registry command path, positional, flag and flag value, every tool
id and alias, and every workflow id to resolve to exactly one of: the command
table, `apps/cli/src/canon/parity/aliases.yaml`, `exceptions.yaml`,
`deprecated.yaml`, or `apps/cli/test/contract/parity-pending.yaml`. Resolving
nowhere or twice SHALL fail the test.

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

#### Scenario: The test reads its sources from fixed modules

- **WHEN** the reachability test loads its inputs
- **THEN** it imports `COMMAND_REGISTRY` from
  `core/completions/command-registry.js`, `AI_TOOLS` and `TOOL_ID_ALIASES` from
  `core/config.js`, and `ALL_WORKFLOWS` from `core/profiles.js`, and reads
  cospec's harness ids only through the `HARNESS_NAMES` export of
  `apps/cli/src/harness/adapters.ts`

#### Scenario: A deprecated entry counts only when the binary deprecates it

- **WHEN** an entry resolves to `deprecated.yaml`
- **THEN** it counts only when the pinned binary marks the surface deprecated,
  in its registry description or by printing its deprecation warning on stderr
  when the surface runs

#### Scenario: Pending resolution is two-way

- **WHEN** the test reads `parity-pending.yaml` and the table
- **THEN** every entry carries the slug of the change that removes it, every
  table flag or flag value marked pending has exactly one entry with the same
  owner slug, and every entry names a surface the walk produces (or a declared
  hidden fixture) that the table marks pending for that owner; a stale entry
  fails the test

#### Scenario: exceptions.yaml holds one entry

- **WHEN** the test reads `exceptions.yaml`
- **THEN** it holds exactly one entry: upstream `update`'s offer to self-upgrade
  the wrapped binary

#### Scenario: Alias resolution is two-way

- **WHEN** an `aliases.yaml` entry names an upstream workflow, tool id, tool
  alias, command path (top-level or subcommand) or flag (a command path and the
  flag), with the cospec spelling it resolves to
- **THEN** a command or flag alias counts only where the table marks that
  upstream spelling an alias of the named cospec spelling (the parser accepts it
  and reads it as the cospec one), a table-marked alias resolves to
  `aliases.yaml` only, every table alias marking has exactly one entry naming
  the same spelling, every command or flag entry matches a table marking, and a
  flag alias agrees with upstream on whether the flag takes a value

### Requirement: A per-command differential fixture pins the parse contract

For every `table` command, a contract fixture SHALL run the same argv through
`cospec` and the pinned binary in the same fixture repo and classify each run as
parse-rejected (an unknown-option, argument-missing, too-many-arguments or
`--store-path` refusal) or parsed. Both tools SHALL land in the same class, with
equal exit codes when both are parse-rejected. A `cospec-only` row SHALL assert
that cospec parses and the binary parse-rejects.

#### Scenario: Same accept-or-reject answer

- **WHEN** the fixture runs `validate --typo x`, `status --schem custom`,
  `list --changes`, `archive c -y` and `init --no-animation .` through both
  tools
- **THEN** each pair lands in the same class with the same exit code when
  rejected

#### Scenario: cospec-only surfaces are expected divergence

- **WHEN** the fixture runs `list --blocked` or `validate --fast`
- **THEN** cospec parses, the binary parse-rejects, and the row passes

#### Scenario: A pending row asserts the not-supported-yet refusal

- **WHEN** the fixture runs a row declared `pending`
- **THEN** it asserts that cospec fails with the not-supported-yet message and
  exit 1

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
