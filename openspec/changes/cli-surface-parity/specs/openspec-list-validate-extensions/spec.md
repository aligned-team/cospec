# Spec Delta

## MODIFIED Requirements

### Requirement: List --specs enumerates capability specs

`cospec list --specs` SHALL delegate to `openspec list --specs --json` and
render the resulting capability specs as a typed table (or, under `--json`,
cospec's `{version: 1, specs}` document carrying the delegated `root`),
alongside the changes `cospec list` lists when `--specs` is absent. Without
`--specs`, cospec's table columns and `--json` row keys SHALL be unchanged,
gaining only the rows' order under `--sort`, the binary's keys and the
namespace-folder marking.

#### Scenario: List --specs renders capability specs

- **WHEN** `cospec list --specs` runs in a repo with capability specs under
  `openspec/specs/`
- **THEN** the command renders one row per capability spec, delegated from
  `openspec list --specs --json`

#### Scenario: Default list behavior is unchanged

- **WHEN** `cospec list` runs without `--specs`
- **THEN** each row keeps its type, gate, task and archive-ready columns, and
  each `--json` row keeps `change`, `type`, `state`, `gate`, `gateState`,
  `tasks` and `archiveReady` with their values

### Requirement: Validate bulk and standalone-spec modes

`cospec validate` SHALL accept `--all`, `--specs`, and `--changes` flags that
delegate the bulk and standalone-spec validation paths to `openspec validate`,
merging delegated spec issues into cospec's existing issue-reporting shape via
the existing delegated-issue mapping. Any of those flags SHALL select its bulk
scope even when an item name is also given, and the name SHALL then be ignored,
as the wrapped binary ignores it. Single-change validation (an item name and no
bulk flag) SHALL continue to run cospec's own rules. A bulk run SHALL exit 1 if
any item fails.

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

## ADDED Requirements

### Requirement: List sorts as the binary sorts

`cospec list` SHALL accept `--sort <order>`. `name` SHALL order rows by change
name; any other value, and no flag, SHALL order them most recently modified
first, by the latest modification time of any file in the change, as the wrapped
binary orders them. The order, the rows' `name`, `completedTasks`, `totalTasks`,
`lastModified`, `status` and `nested` keys, and the document's `root` and
`warnings` SHALL come from one delegated `openspec list --json` call, merged
into cospec's rows by name. cospec's `--blocked` filter SHALL apply after the
merge.

#### Scenario: Default order is most recent first

- **WHEN** `cospec list --json` runs on changes whose files were last touched in
  the order `alpha`, `beta`, `gamma`
- **THEN** the rows are ordered `gamma`, `beta`, `alpha`, as in
  `openspec list --json`

#### Scenario: Name order on request

- **WHEN** `cospec list --sort name` runs
- **THEN** the rows are ordered by name

### Requirement: List answers read failures as the binary does

`cospec list` SHALL NOT crash on a read failure. An unreadable
`openspec/changes/archive/`, which the binary never reads when listing, SHALL
leave the listing as the binary's. cospec's gate column SHALL then be computed
from an empty archive index, and a warning naming the directory SHALL be printed
on stderr, or added to `warnings` as `{code: "archive_unreadable", message}`
under `--json`. A read failure the binary itself refuses (an unreadable
`tasks.md` or change directory) SHALL be answered with the binary's refusal: its
`list_error` document under `--json`, its message on stderr otherwise, and
exit 1. A read failure only cospec's columns reach (an unreadable
`blocking-changes.md`) SHALL become that row's `error`, with the other rows
listed, and exit 1.

#### Scenario: An unreadable archive still lists

- **WHEN** `cospec list --json` runs with `openspec/changes/archive/` at mode
  000
- **THEN** stdout is one document listing every change, `warnings` names the
  archive, and the command exits 0, as `openspec list --json` lists them

#### Scenario: An unreadable tasks file is the binary's list_error

- **WHEN** `cospec list --json` runs with one change's `tasks.md` at mode 000
- **THEN** stdout is one
  `{changes: [], root: null, status: [{…, code: "list_error"}]}` document and
  the command exits 1

### Requirement: Validate resolves one item as the binary does

`cospec validate <name>` SHALL resolve the name as the wrapped binary does.

- `--type change|spec`, matched case-insensitively, SHALL force the kind. Any
  other value SHALL be ignored.
- Without a forced kind, a name that is both an active change and a living spec
  SHALL be refused with
  `Ambiguous item '<name>' matches both a change and a spec.` and the fix
  `Pass --type change|spec.`, exit 1. Under `--json` this is one
  `ambiguous_item` document.
- A name that is neither SHALL be refused with
  `Unknown item '<name>'. Did you mean: <up to five nearest ids>?`, by edit
  distance over the change ids then the spec ids, duplicates kept, or
  `Unknown item '<name>'.` when there is no candidate, exit 1. Under `--json`
  this is one `unknown_item` document.
- A forced kind SHALL first reject a name the binary rejects (empty, `.`/`..`,
  or containing a path separator, checked per segment for a spec) with the
  binary's `invalid_item` message. A forced kind naming nothing on disk SHALL be
  reported as that item with one `meta/item-missing` ERROR.
- The noun-form alternative in the binary's text refusal SHALL be left out, as
  cospec has no noun-form commands.

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

### Requirement: Validate --report selects the full or the findings report

`cospec validate` SHALL accept `--report <full|findings>`. Before resolving the
root it SHALL refuse, exit 1, with the fix
`Use --report full|findings with --all, --changes, --specs, or --archived, without an item name. Do not combine archived and active scopes.`:
an unknown value (`Unknown validation report '<value>'.`), an item name
(`A validation report cannot be combined with an item name.`), `--archived` with
a bulk flag (`A validation report cannot combine archived and active scopes.`),
and no bulk scope (`A validation report requires an explicit bulk scope.`).
These SHALL go to stderr as `Error: <message>` and `Fix: <fix>`, or under
`--json` as one `invalid_validation_report_request` document. `full` SHALL be
the report cospec prints today. `findings` SHALL keep only the items with at
least one issue, under the binary's `report` object
(`kind: "validation-findings"`, `scope`, `returnedItems`, `totalItems`),
`itemFindings`, `summary` and `root`, inside cospec's `version: 1` envelope. Its
exit code SHALL always be the one `full` would give.

#### Scenario: A report without a bulk scope is refused

- **WHEN** `cospec validate --report findings --json` runs
- **THEN** stdout is one `invalid_validation_report_request` document naming the
  missing bulk scope, and the command exits 1 without resolving a root

#### Scenario: Findings keep full's exit code

- **WHEN** `cospec validate --all --report findings` and
  `cospec validate --all --report full` run on a root with one failing change
- **THEN** both exit 1, and the findings report lists only items with issues

### Requirement: Validate --concurrency bounds the change validations

`cospec validate` SHALL run at most N change validations at once in a bulk
scope. N SHALL be `--concurrency <n>` when it parses as a positive integer, else
`OPENSPEC_CONCURRENCY` when that does, else 6. A value that is not a positive
integer SHALL be ignored, not refused, as the binary ignores it. The report's
item order SHALL NOT depend on N.

#### Scenario: The bound holds

- **WHEN** a bulk validation of eight changes runs with `--concurrency 2`
- **THEN** no more than two change validations are ever in flight, and the
  report equals the report of the same run with `--concurrency 8`

#### Scenario: A bad value falls back

- **WHEN** `cospec validate --all --concurrency abc` runs with
  `OPENSPEC_CONCURRENCY=3`
- **THEN** the run is bounded at three and exits as an unbounded run would

### Requirement: An unreadable artifact is a validation error

`cospec validate` SHALL report a change artifact it cannot read (a proposal,
blockers, tasks, verification or design file, a delta or unread spec file, or
`.openspec.yaml`) as a `meta/unreadable-artifact` ERROR naming the file and its
error code, and SHALL run no other rule on that change and delegate nothing for
it. The command SHALL never throw on such a file. Under `--json` the report
SHALL still be one document.

#### Scenario: An unreadable tasks file fails the change, not the command

- **WHEN** `cospec validate --all --json` runs with one change's `tasks.md` at
  mode 000
- **THEN** that change carries one `meta/unreadable-artifact` ERROR naming
  `tasks.md` and `EACCES`, every other item is reported, and the command exits 1

### Requirement: Validate relays are spelled through cospec

Every issue message `cospec validate` relays from the wrapped binary, and the
wrapped diagnostics it relays when `--archived` gets no report, SHALL have each
allowlisted upstream remedy spelled through cospec, with every other byte
unchanged.

#### Scenario: The no-deltas tip names cospec

- **WHEN** a delegated issue carries the binary's
  `Tip: run "openspec change show <change-id> --json --deltas-only"` sentence
- **THEN** cospec's report carries that sentence in its cospec spelling and no
  bare `openspec` command
