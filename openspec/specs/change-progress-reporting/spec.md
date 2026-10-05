# change-progress-reporting Specification

## Purpose

Governs how cospec reports progress across changes: `cospec status --all` sweeps
every active change in one call without letting one bad change abort the rest,
and cospec's own task accounting stays provably consistent with the task totals
re-emitted from the wrapped `openspec instructions apply --json` payload.

## Requirements

### Requirement: Status sweeps every active change

`cospec status` SHALL accept `--all`, mutually exclusive with `--change`, which
computes the existing per-change status for every active change under the
resolved root, ordered by change id. Active changes SHALL be the directories
under `openspec/changes/` other than `archive` and dot-directories, as the
wrapped binary enumerates them. A failure computing one change's status, a
namespace folder included, SHALL NOT abort the sweep: that change SHALL appear
as a failure entry carrying its id and the error, and the command SHALL exit 1
while still emitting the complete envelope. `--all --json` SHALL emit
`{ changes: [...], root }`, where `root` is the binary's `{path, source}`
object; text mode SHALL render one blank-line-separated block per change. The
single-change output SHALL keep every key and line it had, gaining only what
this change adds: `next` and the `Next:` line, and under `--json` the binary's
keys.

#### Scenario: Sweep lists every active change in id order

- **WHEN** `cospec status --all` runs in a repo with several active changes
- **THEN** one status block per change is rendered, ordered by change id

#### Scenario: One bad change does not abort the sweep

- **WHEN** one active change cannot have its status computed
- **THEN** the other changes are still reported, the bad change appears as a
  failure entry naming it, and the command exits 1

#### Scenario: Flags are mutually exclusive

- **WHEN** `cospec status --all --change <slug>` runs
- **THEN** the command reports the conflict and exits non-zero without computing
  any status

#### Scenario: Single-change output is unchanged

- **WHEN** `cospec status --change <slug> --json` runs
- **THEN** every key the document carried before this change is present with the
  same value, beside the added `next` and the binary's keys

### Requirement: Task accounting agrees with the wrapped payload

cospec SHALL report one task total per `cospec apply --json` document. That
command re-emits the wrapped `openspec instructions apply --json` payload's
`progress`/`tasks` alongside cospec's own task accounting, and the two SHALL
agree on how a change's task rows are counted, so one document never reports two
different totals for the same `tasks.md`. Where cospec deliberately counts
differently from the wrapped binary, the divergence SHALL be documented and
covered by a contract test against the real binary rather than left implicit.

Detection of a checkbox-like task line SHALL cover every CommonMark list marker
— `-`, `*`, `+`, `<N>.` and `<N>)` — so a task written with a non-canonical
marker is reported as `tasks/checkbox-grammar`, with a `corrected:` hint
carrying the canonical rewrite, rather than dropped from the parse and counted
toward neither the completed nor the total count. A line whose bracketed span is
immediately followed by `(` or `[` is a markdown link, not a checkbox, and SHALL
NOT be reported. The conforming task grammar itself is unchanged:
`- [ ] <N>.<M> ...` remains the single canonical form.

#### Scenario: One document, one task total

- **WHEN** `cospec apply --json` runs on a change whose `tasks.md` contains
  nested sub-task checkboxes
- **THEN** cospec's own task total and the re-emitted wrapped `progress.total`
  agree

#### Scenario: Counting is proven against the real binary

- **WHEN** the contract suite runs against the pinned openspec binary
- **THEN** a test asserts the agreement above on a fixture with nested
  checkboxes, so a future upstream change to the payload fails the suite instead
  of silently drifting

#### Scenario: A non-canonical list marker is reported, not dropped

- **WHEN** `tasks.md` contains an unchecked task written `+ [ ] 1.1 do the work`
  or `1. [ ] 1.1 do the work`
- **THEN** cospec emits `tasks/checkbox-grammar` for that line with a
  `corrected:` hint of `- [ ] 1.1 do the work`, and `cospec archive` refuses the
  change instead of reporting its tasks complete

#### Scenario: A markdown link bullet is not a task

- **WHEN** `tasks.md` contains the line `- [Some doc](./doc.md)`
- **THEN** no `tasks/checkbox-grammar` issue is emitted for that line and it is
  counted as neither a complete nor an incomplete task

### Requirement: Wrapped apply advisories are declared and relayed

`cospec apply` SHALL declare, rather than pass through untyped, the advisory
fields the wrapped `openspec instructions apply --json` payload carries:
`warnings`, a list of non-blocking observations about the change, and
`missingPrerequisites`, the wrapped binary's own view of what the change still
needs. Both SHALL be optional, because a wrapped binary at the low end of the
accepted range emits neither.

Both fields SHALL be advisory only. Neither SHALL move `cospec apply`'s exit
code, and neither SHALL introduce a block: cospec's own apply gate runs first
and decides the outcome, so `missingPrerequisites` is a superset of cospec's
`missingArtifacts` rather than a competing verdict. Where cospec's own
`skip_specs` precedence has already decided a change correctly skips specs, a
contradicting wrapped warning about the same marker SHALL NOT change that
decision.

`warnings` SHALL reach the human transcript as well as `--json`, so a reader of
the human run sees the same advisories an agent reading `--json` sees.

#### Scenario: Warnings are declared and relayed on both surfaces

- **WHEN** `cospec apply --json` runs on a change the wrapped binary warns about
- **THEN** the document carries a typed `warnings` array, the same warnings
  appear in the human transcript, and the exit code is `0`

#### Scenario: Missing prerequisites never add a block

- **WHEN** `cospec apply --json` runs on a change missing several artifacts
- **THEN** the wrapped `missingPrerequisites` is a superset of cospec's own
  `missingArtifacts`, and the exit code is the one cospec's own gate decided

#### Scenario: cospec's skip_specs precedence still wins

- **WHEN** a change cospec considers correctly specs-skipping is applied, and
  the wrapped payload warns about the same marker
- **THEN** the warning is relayed as an advisory and cospec's precedence
  decision is unchanged

#### Scenario: A wrapped binary that emits neither field is tolerated

- **WHEN** the resolved wrapped binary predates these fields
- **THEN** `cospec apply --json` omits them rather than emitting empty arrays or
  failing to parse the payload

### Requirement: Ambiguous task numbering warns

For a cospec-typed change, `cospec validate` SHALL report two task-numbering
WARNINGs over `tasks.md`, ported from the wrapped binary's
`findTaskNumberingIssues`. `tasks/id-mismatch` SHALL fire on a task whose id's
leading group number differs from its enclosing `## N.` heading's number, with
leading zeros normalised on both sides. `tasks/id-duplicate` SHALL fire on every
later declaration of a task id that an earlier task already declared, naming the
line of the first declaration.

A task id SHALL be read by the exported `TASK_NUM_RE` of `core/tasks.ts`, with
the binary's task-id shape: at least two dot-separated number groups and an
optional letter suffix, followed by whitespace or end of text (`1.2`, `1.2.3`,
`1.3a`). So `1.2.3` and `1.2.4` are two ids, not two copies of `1.2`. Numbering
SHALL be read only inside a `## N.` group. Any other level-two heading ends the
group, a task outside every group SHALL NOT be checked, and a file with no
`## N.` heading SHALL be skipped entirely. Lines inside a fenced code block
SHALL NOT be read as tasks.

Both rules SHALL be WARNINGs, so `cospec validate --strict` fails on them. A
legacy-lane change keeps receiving the wrapped binary's own numbering WARNINGs
through delegation, and cospec SHALL NOT run these rules there.

#### Scenario: A task under the wrong group warns

- **WHEN** a cospec-typed change's `tasks.md` has `- [ ] 2.1 Wrong group` under
  `## 1. Impl`
- **THEN** `cospec validate` reports `tasks/id-mismatch` at WARNING on that
  line, and `cospec validate --strict` exits 1

#### Scenario: A duplicated task id warns

- **WHEN** `- [ ] 1.1 Do it` appears twice under `## 1. Impl`
- **THEN** `tasks/id-duplicate` is a WARNING on the second line, naming the
  first line

#### Scenario: Deeper ids are distinct

- **WHEN** `- [ ] 1.2.3 Deep` and `- [ ] 1.2.4 Deep sibling` sit under
  `## 1. Impl`
- **THEN** neither `tasks/id-duplicate` nor `tasks/id-mismatch` is raised

#### Scenario: A leading zero is not a mismatch

- **WHEN** `- [ ] 01.1 Padded` sits under `## 1. Impl`
- **THEN** no `tasks/id-mismatch` is raised

#### Scenario: Tasks outside a numbered group are ignored

- **WHEN** a task `- [ ] 3.1 Stray` sits under an unnumbered `## Notes` heading
  that follows `## 1. Impl`
- **THEN** no task-numbering issue is raised for it

#### Scenario: A legacy change is not double-reported

- **WHEN** a `spec-driven` change's `tasks.md` has a mismatched and a duplicated
  task id
- **THEN** the report carries the wrapped binary's two WARNINGs and no
  `tasks/id-mismatch` or `tasks/id-duplicate`

### Requirement: Status names the next step on every entry

Every status entry that has a status SHALL carry `next`, and the human output
SHALL print it as a `Next: <command>` line. Both SHALL come from one function
over the entry's artifact states in the schema's build order. An artifact is
ready when it isn't done and every artifact it requires is done, and an artifact
that `skip_specs` skips counts as done. The next step SHALL be the first ready
artifact the change requires to apply, else the first ready artifact of any
kind, each spelled `cospec instructions <artifact> --change <id>`. Once every
artifact the change requires is done, it SHALL be `cospec apply <id>`. When
there is none of these, `next` SHALL be absent and no line printed. For a cospec
type the artifact states SHALL be cospec's own matrix, so no wrapped call is
needed in text mode. For another schema they SHALL be the delegated document's
`artifacts[].status` and `applyRequires`. The empty-change entry's `next` SHALL
keep its current spelling. Under `--json`, `nextSteps` SHALL be the binary's own
value from the delegated document, each command spelled through cospec's remedy
allowlist.

#### Scenario: A mid-build change prints a Next line

- **WHEN** `cospec status --change alpha` runs on a `feat` change with only
  `proposal.md`
- **THEN** the output ends with
  `Next: cospec instructions blocking-changes --change alpha`

#### Scenario: nextSteps is the binary's, spelled cospec

- **WHEN** `cospec status --change alpha --json` and
  `openspec status --change alpha --json` run on the same change
- **THEN** cospec's `nextSteps` equals the binary's with `openspec instructions`
  spelled `cospec instructions`, and `next` names the same artifact

#### Scenario: Required artifacts done points at the gate

- **WHEN** every artifact a `feat` change requires exists and the optional
  `design.md` doesn't
- **THEN** `next` is `cospec apply <id>`, and `nextSteps` is still the binary's
  own sentence for `design`, spelled `cospec`

### Requirement: Status --schema overrides the schema as the binary does

`cospec status` SHALL accept `--schema <name>` with the binary's meaning, a
schema override for every change it reports and not a filter. Before enumerating
changes under `--all`, and before reporting the change named by `--change`, an
unknown name SHALL be refused with the binary's
`Schema '<name>' not found. Available schemas:` message, exit 1, as a
`change_error` document under `--json` (with the `{changes: [], root: null}`
payload under `--all`). With neither `--all` nor `--change` the name SHALL NOT
be checked, as the binary doesn't check it. An override naming a cospec type
SHALL render cospec's matrix for that type. Any other override SHALL render as a
schema cospec doesn't type.

#### Scenario: An override re-renders every change

- **WHEN** `cospec status --all --schema fix --json` runs
- **THEN** every entry is computed as a `fix` change

#### Scenario: An unknown override is refused

- **WHEN** `cospec status --change alpha --schema nope --json` runs
- **THEN** stdout is one `change_error` document carrying the binary's message
  and the command exits 1

### Requirement: Status answers a schema cospec does not type from the binary

For a change whose schema is not a cospec type (a forked or project schema,
`spec-driven`, or a name that resolves nowhere), `cospec status` SHALL call the
wrapped `openspec status --change <id> --json`, or `--all --json` for a sweep,
once. In text mode it SHALL render that document the way the binary renders it,
with its `Next:` line spelled through cospec. Under `--json` it SHALL merge the
document into cospec's `{change, type, legacy: true}` entry. The command SHALL
exit with the binary's outcome: an unknown schema exits 1 in both modes. A
change directory without `.openspec.yaml` SHALL take its schema as the binary
does, from the root's `config.yaml` `schema:` and else `spec-driven`, at
`schemaVersion` 1. No output SHALL name a bare `openspec` command.

#### Scenario: A forked schema gets real status

- **WHEN** `cospec status --change legacy-one` runs on a change whose schema is
  a project fork
- **THEN** the output lists the fork's artifacts with their state and a
  `Next: cospec instructions …` line, and names no bare `openspec` command

#### Scenario: An unknown schema fails under --json

- **WHEN** `cospec status --change ghost --json` runs on a change whose schema
  resolves nowhere
- **THEN** the document carries the binary's `Unknown schema` diagnostic and the
  command exits 1

#### Scenario: A hand-made change is typed by config.yaml

- **WHEN** `cospec status --change bare-dir --json` runs on a directory holding
  only `proposal.md` in a root whose `config.yaml` says `schema: feat`
- **THEN** the entry is a `feat` change graded at `schemaVersion` 1, and its
  `schemaName` is `feat` as the binary reports

### Requirement: Status answers an unreadable tasks file as the binary does

When cospec's own read of a cospec-typed change's `tasks.md` fails,
`cospec status` SHALL ask the binary whether the change can be reported, through
its one delegated `openspec status --json` call, made in text mode only then,
for metadata the binary refuses, or for a schema the binary cannot load. Where
the binary refuses the change (its runtime's `realpath` refuses the file), the
binary's failure SHALL be the answer: its `change_error` document under
`--json`, its message on stderr in text, and under `--all` a failure entry
carrying its message, exit 1. Where the binary reports the change, the file
SHALL count as no tasks, as the binary counts it, with a warning naming the file
on stderr, or in `warnings` as `{code: "tasks_unreadable", message}` under
`--json`.

#### Scenario: The binary refuses the change

- **WHEN** `cospec status --change beta --json` runs with `beta`'s `tasks.md` at
  mode 000 where the binary's `realpath` refuses the file (Bun on macOS)
- **THEN** stdout is the binary's `change_error` document and the command exits
  1

#### Scenario: The binary reports the change

- **WHEN** `cospec status --change beta --json` runs with `beta`'s `tasks.md` at
  mode 000 where the binary reports the change (Linux)
- **THEN** `tasks` counts 0 of 0, `warnings` names the file with
  `tasks_unreadable`, and the command exits 0

### Requirement: Status answers a change whose schema the binary cannot load as the binary does

When the binary cannot load a cospec-typed change's schema (missing from every
tier, unreadable, unparsable or invalid), `cospec status` SHALL ask the binary
whether the change can be reported, through its one delegated
`openspec status --json` call, in text mode as under `--json`, for `--change`
and for the `--all` sweep. The binary's refusal SHALL be the answer: its
`change_error` document under `--json`, its message on stderr in text with
nothing on stdout, and under `--all` a failure entry carrying its message, with
exit code 1. Every other change in the sweep SHALL be reported as it is alone.

#### Scenario: A removed project schema refuses the change in text

- **WHEN** `cospec status --change ch1` runs in text mode on a `chore` change
  whose root's `openspec/schemas/chore/` has been removed
- **THEN** stderr is `cospec status: ` followed by the binary's `Unknown schema`
  message, stdout is empty, and the command exits 1

#### Scenario: The sweep carries the refusal as a failure entry

- **WHEN** `cospec status --all` runs in text mode on the same root beside a
  `feat` change `other`
- **THEN** `ch1`'s block is `ch1: ERROR — <message>`, `other` is reported, and
  the command exits 1

### Requirement: Status answers a change whose metadata the binary refuses as the binary does

When the binary's `readChangeMetadata` refuses a cospec-typed change's
`.openspec.yaml` (unreadable, not YAML, naming a schema the binary does not
list, or failing its `ChangeMetadataSchema`: a `created` not `YYYY-MM-DD`, an
empty `goal`, a non-boolean `skip_specs` or `retire_capabilities`, an
`affected_areas` not a list of non-empty strings, an `initiative` not exactly a
kebab-case `{store, id}`), `cospec status` SHALL ask the binary whether the
change can be reported, through its one delegated `openspec status --json` call,
in text mode as under `--json`, for `--change` and for the `--all` sweep. The
binary's refusal SHALL be the answer: its `change_error` document under
`--json`, its message on stderr in text with nothing on stdout, and under
`--all` a failure entry carrying its message, with exit code 1. Every other
change in the sweep SHALL be reported as it is alone.

#### Scenario: A malformed created date refuses the change in text

- **WHEN** `cospec status --change ch1` runs in text mode on a `chore` change
  whose `.openspec.yaml` sets `created: notadate`
- **THEN** stderr is `cospec status: ` followed by the binary's
  `Invalid metadata` message, stdout is empty, and the command exits 1

#### Scenario: The sweep carries the metadata refusal as a failure entry

- **WHEN** `cospec status --all` runs in text mode on the same root beside a
  `feat` change `other`
- **THEN** `ch1`'s block is `ch1: ERROR — <message>`, `other` is reported, and
  the command exits 1
