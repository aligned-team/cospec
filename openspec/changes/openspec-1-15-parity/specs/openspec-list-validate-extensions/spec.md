# Spec Delta

## ADDED Requirements

### Requirement: List browses archived changes

`cospec list --archived` SHALL list archived changes and `cospec list --all`
SHALL list active and archived changes, both honouring `--sort` and `--json` as
the pinned binary does. Each row SHALL also carry the change's commit type and
archive date, and the `--json` document SHALL be additive over upstream's.

#### Scenario: Archived listing

- **WHEN** a user runs `cospec list --archived --json`
- **THEN** every upstream key is present and each item adds `type` and
  `archivedOn`

#### Scenario: All with sort

- **WHEN** a user runs `cospec list --all --sort name`
- **THEN** active and archived changes appear together in name order, each
  marked active or archived

### Requirement: Over-long requirements warn

A requirement description over 500 characters, in a living spec or an ADDED or
MODIFIED requirement in a change, SHALL be a WARNING with a stable rule ID whose
message explains how to split it without losing scenarios, so
`cospec validate --strict` fails on it.

#### Scenario: Strict fails

- **WHEN** a change ADDs a requirement whose description is 620 characters
- **THEN** `cospec validate <slug> --strict` exits nonzero naming the
  requirement and the rule ID

### Requirement: Text archive would drop is a warning

`cospec validate` and `cospec archive` SHALL warn when a delta spec holds text
archive does not carry: a `## ` section other than Purpose and the four delta
sections, text above the first `## ` header, or prose before the first
requirement in ADDED or MODIFIED.

#### Scenario: Foreign section

- **WHEN** a delta spec contains `## Notes` with prose
- **THEN** validate warns that the section will not reach the main spec and
  `--strict` fails

### Requirement: Scenario-loss message names what changed

When the MODIFIED scenario-loss guard fires, the message SHALL state the
scenario count on each side and name up to three scenarios the block introduces.
The guard's verdict and exit code SHALL be unchanged.

#### Scenario: Rename looks like a rename

- **WHEN** a MODIFIED block drops scenario "Old" and adds "New"
- **THEN** the message names "Old" as omitted, "New" as introduced, and the
  counts 1 and 1

### Requirement: Non-string rules items are located

A `rules:` entry in `openspec/config.yaml` that is not a string SHALL be
reported with its artifact, index, the parsed shape, and the quoting fix.

#### Scenario: Unquoted colon

- **WHEN** a rules item reads `- Use: tabs` unquoted
- **THEN** the warning names the index, says it parsed as a mapping, and shows
  the quoted form

### Requirement: No redraw on a zero-width terminal

cospec SHALL draw no spinner or progress redraw when stdout reports zero
columns, when `CI` is set, or when `OPEN_SPEC_INTERACTIVE=0`, and SHALL pass the
same environment to every wrapped call.

#### Scenario: Hook-runner pty

- **WHEN** `cospec validate --all` runs under a pty with `columns === 0`
- **THEN** it completes with plain output in bounded time

## MODIFIED Requirements

### Requirement: Validate bulk and standalone-spec modes

`cospec validate` SHALL accept `--all`, `--specs`, and `--changes`, delegating
bulk and standalone-spec validation to `openspec validate` and merging delegated
spec issues into cospec's issue shape via the existing mapping. A bulk flag
SHALL select its scope even beside an item name, which is then ignored as the
binary ignores it. A name with no bulk flag SHALL still run cospec's own rules.
A bulk run SHALL exit 1 if any item fails.

#### Scenario: Validate --specs delegates and surfaces spec issues

- **WHEN** `cospec validate --specs` runs against a repo with an invalid
  capability spec
- **THEN** the command delegates to `openspec validate --specs` and surfaces the
  resulting spec issue in cospec's issue-reporting shape, exiting 1

#### Scenario: Validate --all aggregates changes and specs

- **WHEN** `cospec validate --all` runs
- **THEN** the command aggregates cospec's own change-rule results with
  delegated spec/bulk results from `openspec validate --all` into one report

#### Scenario: Single-change validation is unaffected

- **WHEN** `cospec validate <change-slug>` runs without any bulk flag on a name
  that is only a change
- **THEN** the command's single-change rule-and-delegation behavior is as before

#### Scenario: A bulk flag beside a name runs the bulk scope

- **WHEN** `cospec validate alpha --all` runs
- **THEN** every change and spec is validated, as
  `openspec validate alpha --all` does

### Requirement: Validate --archived delegates archived-change validation

`cospec validate --archived` SHALL validate archived changes by pure delegation
to `openspec validate --archived`, threading the root's store arguments and the
non-interactive/JSON flags the other delegated modes use, and running none of
cospec's change-centric rules. The delegated envelope SHALL render through
cospec's issue shape, exiting 1 when any item fails. Validation without
`--archived` SHALL be unchanged.

#### Scenario: An invalid archived change is surfaced

- **WHEN** `cospec validate --archived --json` runs in a repo whose archive
  contains a change with an incomplete task list
- **THEN** the delegated ERROR is surfaced in cospec's issue-reporting shape and
  the command exits 1

#### Scenario: A clean archive passes

- **WHEN** `cospec validate --archived` runs against an archive with no issues
- **THEN** the command reports no issues and exits 0

#### Scenario: Other validate modes are unchanged

- **WHEN** `cospec validate <slug>`, `cospec validate --specs`, and
  `cospec validate --all` run
- **THEN** their behavior and exit codes are unchanged from before this change

#### Scenario: An older runtime relays a clean error

- **WHEN** the resolved wrapped binary predates `validate --archived`
- **THEN** cospec relays the wrapped unknown-flag error and exits non-zero
  rather than reporting a clean archive

### Requirement: Each validation lane keeps its own severities

`cospec validate` SHALL give a finding the severity of the lane owning the
change. A cospec-typed change SHALL keep cospec's severities even where stricter
than the binary (`deltas/requirement-shape` stays an ERROR for a body missing
SHALL/MUST). A legacy-lane change, with a schema cospec does not type, SHALL get
every finding the binary reports, at its level with its message unchanged, and
no native rule from the change-rule families.

#### Scenario: Legacy-lane severities match the binary

- **WHEN** `cospec validate <change> --strict --json` runs on a `spec-driven`
  change and `openspec validate <change> --strict --json` runs on the same
  change
- **THEN** each of the binary's issues appears in cospec's report with the same
  level and message, and cospec adds only its legacy-schema INFO

#### Scenario: A cospec-typed change keeps cospec's severity

- **WHEN** a `feat` change's ADDED requirement body lacks SHALL/MUST
- **THEN** cospec reports `deltas/requirement-shape` at ERROR, not the binary's
  WARNING

#### Scenario: A contract test is the legacy-lane severity oracle

- **WHEN** the contract suite validates a `spec-driven` fixture tripping the
  binary's SHALL/MUST, skipped-header, empty-section, cross-section and
  task-numbering findings
- **THEN** every issue the pinned binary reports appears in cospec's report with
  the same level and message, and cospec reports nothing further beyond its own
  classification INFO

### Requirement: List sorts as the binary sorts

`cospec list` SHALL accept `--sort <order>`: `name` orders rows by change name;
any other value, or none, orders them most recently modified first by the latest
file modification in the change, as the binary does. The order, the rows'
`name`, `completedTasks`, `totalTasks`, `lastModified`, `status` and `nested`,
and the document's `root` and `warnings` SHALL come from one delegated
`openspec list --json`, merged into cospec's rows by name, before `--blocked`
filters.

#### Scenario: Default order is most recent first

- **WHEN** `cospec list --json` runs on changes whose files were last touched in
  the order `alpha`, `beta`, `gamma`
- **THEN** the rows are ordered `gamma`, `beta`, `alpha`, as in
  `openspec list --json`

#### Scenario: Name order on request

- **WHEN** `cospec list --sort name` runs
- **THEN** the rows are ordered by name

### Requirement: List answers read failures as the binary does

`cospec list` SHALL NOT crash on a read failure. A failure the binary refuses
(an unreadable change directory, or a `tasks.md` its `realpath` refuses) SHALL
get the binary's refusal: its `list_error` document under `--json`, else its
message on stderr, and exit 1. A failure only cospec's columns reach (an
unreadable `blocking-changes.md`) SHALL become that row's `error`, the other
rows listed, exit 1.

#### Scenario: An unreadable archive still lists

- **WHEN** `cospec list --json` runs with `openspec/changes/archive/` at mode
  000
- **THEN** stdout is one document listing every change, `warnings` names the
  archive, and the command exits 0, as `openspec list --json` lists them

#### Scenario: An unreadable tasks file is the binary's list_error

- **WHEN** `cospec list --json` runs with one change's `tasks.md` at mode 000
  where the binary's `realpath` refuses the file (Bun on macOS)
- **THEN** stdout is one
  `{changes: [], root: null, status: [{…, code: "list_error"}]}` document and
  the command exits 1

#### Scenario: An unreadable tasks file the binary lists past

- **WHEN** `cospec list --json` runs with one change's `tasks.md` at mode 000
  where the binary lists the change (Linux)
- **THEN** the change's row counts 0 of 0 tasks with no `error`, `warnings`
  names the file with `tasks_unreadable`, and the command exits 0, as
  `openspec list --json` does

#### Scenario: An unreadable archive leaves the binary's listing

- **WHEN** `openspec/changes/archive/` is unreadable
- **THEN** the listing is the binary's, the gate column is computed from an
  empty archive index, and a warning naming the directory is printed on stderr,
  or added to `warnings` as `{code: "archive_unreadable", message}` under
  `--json`

#### Scenario: A tasks file the binary lists past counts as no tasks

- **WHEN** a `tasks.md` is unreadable but the binary lists past it
- **THEN** it counts as no tasks, with a warning naming the file on stderr, or
  in `warnings` as `{code: "tasks_unreadable", message}` under `--json`

### Requirement: Validate resolves one item as the binary does

`cospec validate <name>` SHALL resolve the name as the wrapped binary does:
`--type change|spec` (case-insensitive) forces the kind and other values are
ignored; an unforced name that is both a change and a spec, or neither, SHALL be
refused with the binary's message and exit 1, as one `ambiguous_item` or
`unknown_item` document under `--json`. The binary's noun-form alternative SHALL
be left out of the text refusal, as cospec has no noun-form commands.

#### Scenario: An ambiguous name is refused

- **WHEN** `cospec validate gamma --json` runs where `gamma` is a change and a
  spec
- **THEN** stdout is one `ambiguous_item` document with the binary's message and
  fix, and the command exits 1

#### Scenario: An unknown name gets the binary's suggestions

- **WHEN** `cospec validate gamm` runs
- **THEN** stderr carries `Unknown item 'gamm'. Did you mean: …?` naming the
  same ids, in the same order, as `openspec validate gamm`, and the command
  exits 1

#### Scenario: --type settles the ambiguity

- **WHEN** `cospec validate gamma --type spec` runs
- **THEN** only the living spec `gamma` is validated

#### Scenario: Refusal texts match the binary

- **WHEN** an unforced name is ambiguous or unknown
- **THEN** the ambiguous refusal is
  `Ambiguous item '<name>' matches both a change and a spec.` with the fix
  `Pass --type change|spec.`, and the unknown refusal is
  `Unknown item '<name>'. Did you mean: <up to five nearest ids>?` by edit
  distance over change ids then spec ids, duplicates kept, or
  `Unknown item '<name>'.` when there is no candidate

#### Scenario: A forced kind checks the name first

- **WHEN** `--type` is given with a name the binary rejects (empty, `.`/`..`, or
  containing a path separator, checked per segment for a spec)
- **THEN** it is refused with the binary's `invalid_item` message

#### Scenario: A forced kind naming nothing is item-missing

- **WHEN** `--type` names an item absent from disk
- **THEN** that item is reported with one `meta/item-missing` ERROR

### Requirement: Validate --report selects the full or the findings report

`cospec validate` SHALL accept `--report <full|findings>`, refusing before root
resolution, exit 1, an unknown value, an item name, `--archived` with a bulk
flag, or no bulk scope, as `Error: <message>` and `Fix: <fix>` on stderr or one
`invalid_validation_report_request` document under `--json`. `full` SHALL be
today's report. `findings` SHALL keep only items with an issue, in the binary's
shape inside cospec's `version: 1` envelope, and SHALL exit as `full` would.

#### Scenario: A report without a bulk scope is refused

- **WHEN** `cospec validate --report findings --json` runs
- **THEN** stdout is one `invalid_validation_report_request` document naming the
  missing bulk scope, and the command exits 1 without resolving a root

#### Scenario: Findings keep full's exit code

- **WHEN** `cospec validate --all --report findings` and
  `cospec validate --all --report full` run on a root with one failing change
- **THEN** both exit 1, and the findings report lists only items with issues

#### Scenario: Report refusal messages

- **WHEN** a `--report` request is refused
- **THEN** the message is `Unknown validation report '<value>'.`,
  `A validation report cannot be combined with an item name.`,
  `A validation report cannot combine archived and active scopes.`, or
  `A validation report requires an explicit bulk scope.`, and the fix is
  `Use --report full|findings with --all, --changes, --specs, or --archived, without an item name. Do not combine archived and active scopes.`

#### Scenario: Findings report shape

- **WHEN** `--report findings --json` runs
- **THEN** the document carries the binary's `report` object
  (`kind: "validation-findings"`, `scope`, `returnedItems`, `totalItems`),
  `itemFindings`, `summary` and `root`

### Requirement: An unreadable artifact is a validation error

`cospec validate` SHALL report an unreadable artifact (proposal, blockers,
tasks, verification, design, delta or unread spec file, or `.openspec.yaml`) as
a `meta/unreadable-artifact` ERROR naming the file and error code, running no
other rule and delegating nothing for it; it SHALL never throw, and `--json`
stays one document. An unreadable `openspec/changes/archive/` SHALL leave
`validate` and `apply` answering as if empty, with an `archive_unreadable`
warning; `archive` SHALL refuse.

#### Scenario: An unreadable archive leaves validate and apply answering

- **WHEN** `cospec validate --all --json` and `cospec apply <id> --json` run
  with `openspec/changes/archive/` at mode 000
- **THEN** each prints one document that, bar its one `archive_unreadable`
  warning, equals its answer with the archive readable, and `validate --all`
  exits as the binary does

#### Scenario: An unreadable tasks file fails the change, not the command

- **WHEN** `cospec validate --all --json` runs with one change's `tasks.md` at
  mode 000
- **THEN** that change carries one `meta/unreadable-artifact` ERROR naming
  `tasks.md` and `EACCES`, every other item is reported, and the command exits 1

#### Scenario: The archive warning's shape

- **WHEN** `cospec validate` or `cospec apply` meets an unreadable archive
  directory
- **THEN** the warning names the directory, as
  `{code: "archive_unreadable", message}` under `--json` or printed on stderr

### Requirement: Validate relays are spelled through cospec

Every issue message `cospec validate` relays from the binary, and each message
and fix of the failure document the binary answers `--archived` with, SHALL
spell each allowlisted upstream remedy through cospec, every other byte
unchanged. That failure document SHALL be the answer: one document with the
binary's exit code under `--json`, else `cospec: <message>` on stderr. Whether
the binary is too old for `--archived` SHALL be read from its version.

#### Scenario: An unreadable archive's --archived failure is the binary's

- **WHEN** `cospec validate --archived --json` runs with
  `openspec/changes/archive/` at mode 000
- **THEN** it prints the binary's one `validate_error` document and exits 1, as
  the binary does, and the text form prints `cospec: <message>` with no "needs
  OpenSpec >=1.9.0" attribution

#### Scenario: The no-deltas tip names cospec

- **WHEN** a delegated issue carries the binary's
  `Tip: run "openspec change show <change-id> --json --deltas-only"` sentence
- **THEN** cospec's report carries that sentence in its cospec spelling and no
  bare `openspec` command
