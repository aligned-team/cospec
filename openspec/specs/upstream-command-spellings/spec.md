# upstream-command-spellings Specification

## Purpose

cospec accepts the pinned OpenSpec binary's own command and flag spellings that
a swapped-in `openspec` habit still types — `init --tools`, `new change`,
`update [path]`, `completion generate`, the hidden `experimental` alias and
commander's program-level `help [command]` — so an existing invocation never
breaks on the swap. Each spelling is a command-table row or an `aliases.yaml`
entry aliased (`aliasOf`) to cospec's own name, resolves to the same behaviour
and exit codes as the binary's, and is enforced reachable the same way as any
other command by `reachability.test.ts`.

## Requirements

### Requirement: init reads upstream's --tools as --harness

`cospec init` SHALL accept `--tools <list>` as the pinned binary's spelling of
`--harness <list>`, with the same `all`, `none` and comma-separated forms and
the same refusals, and SHALL never read the list as the target path. Given with
no value it SHALL be refused as
`cospec init: option '--tools <tools>' argument missing`, exit 1. Given together
with `--harness`, the later of the two SHALL win, as commander resolves a
repeated option. A refusal of the list's content SHALL name the spelling the
user typed. Either spelling's list (and `experimental --tool`'s) SHALL be read
as the binary's `resolveToolsArg` reads `--tools`: trimmed, with `all`, `none`
and each comma-separated name matched case-insensitively; a value that is empty
once trimmed, or holds no name between its commas, SHALL be refused with the
binary's own sentence (`The <flag> option requires a value. …` /
`The <flag> option requires at least one tool ID …`) on stderr, exit 1, before
anything is written.

#### Scenario: Two harnesses through upstream's spelling

- **WHEN** `cospec init --tools claude,codex` runs in an empty directory
- **THEN** the claude and codex harness files are written, no `./claude,codex`
  directory exists, and the exit code is 0

#### Scenario: A missing list is a missing value

- **WHEN** `cospec init --tools` runs
- **THEN** stderr names `--tools <tools>` as the option whose argument is
  missing, exit 1, and nothing is written

#### Scenario: An empty list is refused and nothing is written

- **WHEN** `cospec init --tools ''`, `--tools ' '`, `--tools ','`,
  `cospec init --harness ''` or `cospec experimental --tool ''` runs in an empty
  directory
- **THEN** stderr carries the binary's refusal sentence naming the flag typed,
  stdout is empty (bar `experimental`'s note), the exit code is 1, and the
  directory is still empty

#### Scenario: The list is read case-insensitively

- **WHEN** `cospec init --tools ALL`, `--tools ' all '`, `--tools Claude` or
  `--tools 'claude, CODEX'` runs
- **THEN** it writes what `--harness all`, `all`, `claude` or `claude,codex`
  writes, exit 0

### Requirement: experimental is a hidden alias of init

`cospec experimental [--tool <id>] [--no-interactive]` SHALL be a hidden
command, absent from `cospec --help`, that prints upstream's deprecation note
spelled through cospec
(`Note: "cospec experimental" is deprecated. Use "cospec init" instead.`) and
then runs `cospec init` on the current directory, reading `--tool <id>` as
`--harness <id>`; `--no-interactive` SHALL be accepted as a no-op, because
`cospec init` never prompts. It SHALL refuse `--store` as an unknown option, as
`init` does.

#### Scenario: experimental behaves as init

- **WHEN** `cospec experimental --tool claude` and
  `cospec init --harness claude` run in two empty directories
- **THEN** both exit 0 and write the same tree, and `experimental`'s stdout
  starts with the respelled deprecation note

### Requirement: new change is upstream's create spelling

`cospec new change <name> [--schema <s>] [--description <text>] [--goal <text>]`
SHALL create a change named `<name>`. `--schema` SHALL name a cospec type or a
legacy schema, with the same checks and lanes as `cospec new <type> <name>`;
without it (or given as `--schema ''`, which upstream reads as absent) the
wrapped `new change` SHALL run with no `--schema`, so the binary resolves the
root's `config.yaml` `schema:` default (else `spec-driven`) itself, and the
change's type SHALL be the `schema:` read back from the `.openspec.yaml` it
writes (which SHALL equal its document's `change.schema`). Every warning the
binary prints on stderr for a config field it drops SHALL reach cospec's stderr
as written, in text and under `--json` alike (stdout staying one document): a
config it cannot read or parse, one that is not a YAML object, a `schema:` that
is not a non-empty string (each falling back to `spec-driven`), and an invalid
`context:`, `rules:` (or empty rule strings), `operations:`, `references:`,
`store:` or `githubCopilot:`. A default the binary cannot find (a
whitespace-only `schema:`, or a cospec type the repo has no schema for) SHALL be
answered with the binary's own refusal, nothing written. A `--schema` the binary
cannot resolve SHALL be refused with nothing written. `--goal <text>` SHALL be
stored as `goal:` in the change's `.openspec.yaml`, on this spelling and on
`cospec new <type> <slug>`. `--initiative <x>` and `--areas <x>` SHALL be
refused, before any other action-level check, with upstream's removed-option
message on stderr (text) or its `{change: null, status: [...]}` document
carrying code `initiative_option_removed` or `areas_option_removed` (`--json`),
exit 1, and SHALL be absent from `--help` and completion. Under `--json`,
`new change <name>` SHALL emit upstream's
`change {id, path, metadataPath, schema}` and `root`, taken from the wrapped
call's own document, with cospec's `type`, `dir` and `artifacts` beside them;
`new <type> <slug> --json` SHALL keep `change: <slug>` and SHALL gain the same
`root`.

#### Scenario: The key oracle agrees

- **WHEN** `cospec new change foo --schema feat --json` and
  `openspec new change foo --schema feat --json` run in two copies of the same
  cospec-initialised root
- **THEN** every key of the binary's document is present in cospec's with a
  value of the same type, `change.id` is `foo`, `change.schema` is `feat`, and
  `type`, `dir` and `artifacts` sit beside them

#### Scenario: The config default schema applies

- **WHEN** `cospec new change foo` runs in a root whose `config.yaml` says
  `schema: feat`
- **THEN** `openspec/changes/foo/.openspec.yaml` says `schema: feat` and carries
  `schemaVersion: 2`

#### Scenario: An empty --schema is no --schema

- **WHEN** `cospec new change foo --schema ''` runs in a cospec root and in an
  upstream-initialised root
- **THEN** each creates `foo` with the schema the binary creates there (`feat`,
  `spec-driven`), exit 0

#### Scenario: A config upstream cannot use falls back with its warning

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  is unparseable, not a YAML object, empty, or says `schema: 42` / `schema: ""`
- **THEN** stderr carries the binary's warning line for that config, `foo` is
  created on `spec-driven`, exit 0, and under `--json` stdout is one document
  whose `change` equals the binary's

#### Scenario: The binary's field warnings reach stderr

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  has an invalid `context:`, `rules:`, `operations:`, `references:`, `store:` or
  `githubCopilot:` field
- **THEN** cospec's stderr is the binary's stderr for the same argv under
  `--json`, `foo` is created on `spec-driven`, exit 0

#### Scenario: A whitespace-only schema is the binary's refusal

- **WHEN** `cospec new change foo` (or with `--json`) runs where `config.yaml`
  says `schema: "  "`
- **THEN** it exits 1 with `cospec new: Unknown schema '  '. Available: …` (or,
  under `--json`, the binary's own `{change: null, status}` document), and the
  tree is unchanged

#### Scenario: An unknown --schema leaves nothing behind

- **WHEN** `cospec new change foo --schema nope` runs, with or without `--json`
- **THEN** it exits 1 and the tree is unchanged

#### Scenario: The goal is stored

- **WHEN** `cospec new change foo --goal "ship it"` runs
- **THEN** `.openspec.yaml` holds `goal: ship it`

#### Scenario: A removed option gets upstream's explanation

- **WHEN** `cospec new change foo --initiative x` runs
- **THEN** stderr is upstream's `--initiative is no longer supported. …`
  message, exit 1, and no change directory exists
- **AND WHEN** `cospec new change foo --areas x --json` runs
- **THEN** stdout is one document whose status code is `areas_option_removed`

### Requirement: update honours its path

`cospec update [path]` SHALL regenerate the managed files of the project at
`path`, resolved against the working directory, instead of the working directory
itself, and SHALL leave the working directory untouched. A path with no
`openspec/` directory SHALL get the same refusal `cospec update` gives in such a
directory.

#### Scenario: Updating another project

- **WHEN** `cospec update ./other` runs from a directory whose `./other` is a
  cospec-initialised project with a drifted managed file
- **THEN** the drifted file under `./other` is regenerated, nothing outside
  `./other` changes, and the exit code is 0

### Requirement: completion generate is upstream's spelling

`cospec completion generate [shell]` SHALL behave exactly as
`cospec completion [shell]`: the same script, the same `$SHELL` detection, the
same refusals and the same `--json` refusal document. On both spellings the
shell name SHALL be read case-insensitively, as upstream's `completion generate`
lowercases it, a pending shell included.

#### Scenario: The same script under both spellings

- **WHEN** `cospec completion generate zsh` and `cospec completion zsh` run
- **THEN** both print the same script and exit 0

#### Scenario: The shell name is case-insensitive

- **WHEN** `cospec completion generate BASH` runs
- **THEN** it prints what `cospec completion generate bash` prints, exit 0
- **AND WHEN** `cospec completion generate POWERSHELL` runs
- **THEN** it answers exactly as `cospec completion generate powershell` does

### Requirement: Program-level help follows commander's help command

`cospec help` SHALL print the program help on stdout, exit 0.
`cospec help <command>` SHALL print that command's help, exit 0, reading only
the first operand as commander's implicit `help [command]` does, so
`cospec help config path` prints the `config` help; a hidden command
(`experimental`, `__complete`) SHALL get its help too. A name that is no
command, `help` itself included, SHALL print the program help on stderr, exit 1.
An option after `help` SHALL NOT be refused: `cospec help --json` and
`cospec help list --bogus` print the help they would without it, and
`-V`/`--version` prints the version, as upstream does.

#### Scenario: help for a command

- **WHEN** `cospec help list` runs
- **THEN** stdout equals `cospec list --help`, exit 0

#### Scenario: help reads only the first operand

- **WHEN** `cospec help config path` runs
- **THEN** stdout equals `cospec config --help`, exit 0

#### Scenario: help for an unknown name

- **WHEN** `cospec help bogus` runs
- **THEN** stderr is the program help, stdout is empty, and the exit code is 1
