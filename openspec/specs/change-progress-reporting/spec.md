# change-progress-reporting Specification

## Purpose

Governs how cospec reports progress across changes: `cospec status --all` sweeps
every active change in one call without letting one bad change abort the rest,
and cospec's own task accounting stays provably consistent with the task totals
re-emitted from the wrapped `openspec instructions apply --json` payload.

## Requirements

### Requirement: Status sweeps every active change

`cospec status` SHALL accept `--all`, exclusive with `--change`, computing the
per-change status for every active change (directories under `openspec/changes/`
other than `archive` and dot-directories, as the binary enumerates them) in id
order. A failure on one change, a namespace folder included, SHALL NOT abort the
sweep: it SHALL appear as a failure entry with its id and error, and the command
SHALL exit 1 with the complete envelope.

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

#### Scenario: Sweep envelope shape

- **WHEN** `cospec status --all` runs, with and without `--json`
- **THEN** `--json` emits `{ changes: [...], root }` where `root` is the
  binary's `{path, source}` object, and text mode renders one
  blank-line-separated block per change

#### Scenario: Single-change output only gains what this change adds

- **WHEN** `cospec status --change <id>` runs, with and without `--json`
- **THEN** every key and line it had before is kept, and the only additions are
  `next` and the `Next:` line, plus under `--json` the binary's keys

### Requirement: Task accounting agrees with the wrapped payload

Each `cospec apply --json` document SHALL report one task total: cospec's task
accounting and the re-emitted wrapped `progress`/`tasks` SHALL count a change's
task rows the same way. Any deliberate divergence SHALL be documented and
contract-tested against the real binary. Checkbox-like task detection SHALL
cover every CommonMark list marker (`-`, `*`, `+`, `<N>.`, `<N>)`). The
canonical grammar `- [ ] <N>.<M> ...` SHALL be unchanged.

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

#### Scenario: Non-canonical markers are reported with a correction

- **WHEN** a task line uses a list marker other than `-`
- **THEN** it is reported as `tasks/checkbox-grammar` with a `corrected:` hint
  carrying the canonical rewrite, rather than dropped from both the completed
  and total counts

#### Scenario: A bracket span followed by a link opener is not a checkbox

- **WHEN** a line's bracketed span is immediately followed by `(` or `[`
- **THEN** it is read as a markdown link and not reported

### Requirement: Wrapped apply advisories are declared and relayed

`cospec apply` SHALL declare, not pass through untyped, the wrapped
`instructions apply --json` fields `warnings` (non-blocking observations) and
`missingPrerequisites` (the binary's view of what the change still needs), both
optional. Both SHALL be advisory only: neither SHALL move the exit code or add a
block, since cospec's gate decides first, nor override a `skip_specs` decision
cospec's precedence already made. `warnings` SHALL reach the human transcript as
well as `--json`.

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

#### Scenario: Advisory fields never compete with the gate

- **WHEN** the wrapped payload carries `missingPrerequisites`
- **THEN** it is treated as a superset of cospec's `missingArtifacts`, not a
  competing verdict, and a binary at the low end of the accepted range that
  emits neither field is accepted

### Requirement: Ambiguous task numbering warns

For a cospec-typed change, `cospec validate` SHALL port the binary's
`findTaskNumberingIssues` as two WARNINGs over `tasks.md`: `tasks/id-mismatch`
when a task id's leading group differs from its enclosing `## N.` heading
(leading zeros normalised), and `tasks/id-duplicate` on every later redeclared
id, naming the first declaration's line. Ids SHALL be read by `core/tasks.ts`'s
exported `TASK_NUM_RE`. A legacy-lane change SHALL keep the delegated warnings
and not run these rules.

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

#### Scenario: Task id shape follows the binary

- **WHEN** `TASK_NUM_RE` reads task ids
- **THEN** an id is two or more dot-separated number groups with an optional
  letter suffix, followed by whitespace or end of text (`1.2`, `1.2.3`, `1.3a`)

#### Scenario: Numbering is read only inside numbered groups

- **WHEN** `tasks.md` has other level-two headings, tasks outside any group,
  fenced code blocks, or no `## N.` heading at all
- **THEN** any other level-two heading ends the group, tasks outside a group and
  lines inside fences are not checked, and a file with no `## N.` heading is
  skipped entirely

#### Scenario: Numbering warnings fail strict

- **WHEN** either numbering rule fires and `cospec validate --strict` runs
- **THEN** validation fails, because both rules are WARNINGs

### Requirement: Status names the next step on every entry

Every status entry with a status SHALL carry `next`, printed as
`Next: <command>`, both from one function over the artifact states in build
order (ready: not done, every requirement done; `skip_specs`-skipped counts
done). It SHALL be the first ready apply-required artifact, else the first ready
artifact, as `cospec instructions <artifact> --change <id>`; once all
apply-required are done, `cospec apply <id>`; otherwise absent with no line.

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

#### Scenario: Artifact states come from the right source

- **WHEN** `next` is computed for a cospec type and for another schema
- **THEN** a cospec type uses cospec's own matrix with no wrapped call in text
  mode, and another schema uses the delegated document's `artifacts[].status`
  and `applyRequires`

#### Scenario: The empty-change entry keeps its next spelling

- **WHEN** status reports a cospec-typed change with no artifacts yet
- **THEN** its `next` keeps the spelling it had before this requirement

#### Scenario: nextSteps passes through under --json

- **WHEN** `cospec status --json` runs
- **THEN** `nextSteps` is the binary's own value from the delegated document,
  each command spelled through cospec's remedy allowlist

### Requirement: Status --schema overrides the schema as the binary does

`cospec status` SHALL accept `--schema <name>` as the binary does: an override
for every change reported, not a filter. Before enumerating under `--all` or
reporting `--change`, an unknown name SHALL be refused with the binary's
`Schema '<name>' not found. Available schemas:` message, exit 1. With neither
flag it SHALL NOT be checked. An override naming a cospec type SHALL render
cospec's matrix; any other SHALL render as a schema cospec doesn't type.

#### Scenario: An override re-renders every change

- **WHEN** `cospec status --all --schema fix --json` runs
- **THEN** every entry is computed as a `fix` change

#### Scenario: An unknown override is refused

- **WHEN** `cospec status --change alpha --schema nope --json` runs
- **THEN** stdout is one `change_error` document carrying the binary's message
  and the command exits 1

#### Scenario: An unknown override under --json

- **WHEN** an unknown `--schema` is given with `--json`
- **THEN** a `change_error` document is emitted, carrying the
  `{changes: [], root: null}` payload under `--all`

### Requirement: Status answers a schema cospec does not type from the binary

For a change whose schema is not a cospec type (forked, project, `spec-driven`,
or unresolvable), `cospec status` SHALL call the wrapped
`openspec status --change <id> --json` (`--all --json` for a sweep) once, render
it as the binary does in text with `Next:` spelled through cospec, and under
`--json` merge it into a `{change, type, legacy: true}` entry. It SHALL exit
with the binary's outcome (unknown schema: exit 1 in both modes). No output
SHALL name a bare `openspec` command.

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

#### Scenario: A hand-made change under a broken config falls back with the binary's warning

- **WHEN** `cospec status --change bare-dir` runs on a directory holding only
  `proposal.md` in a root whose `config.yaml` does not parse as YAML
- **THEN** the change is reported on `spec-driven`, as the binary reports it,
  stderr carries `Warning: could not parse <path> (<detail>); ignoring it.`
  once, and the command exits 0

#### Scenario: A change without metadata takes the binary's schema

- **WHEN** a change directory has no `.openspec.yaml`
- **THEN** its schema is the root `config.yaml` `schema:`, else `spec-driven`,
  at `schemaVersion` 1; where that config exists but cannot be read or parsed it
  is `spec-driven` and the binary's
  `Warning: could not parse <path> (<detail>); ignoring it.` line is printed on
  stderr once

### Requirement: Status answers an unreadable tasks file as the binary does

When cospec cannot read a cospec-typed change's `tasks.md`, `cospec status`
SHALL ask the binary whether the change can be reported, via its one delegated
`openspec status --json` call (made in text mode only then, or for refused
metadata or an unloadable schema). If the binary refuses it (its `realpath`
refuses the file), that failure SHALL be the answer, exit 1. If it reports the
change, the file SHALL count as no tasks, with a warning naming the file.

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

#### Scenario: Refusal and warning surfaces

- **WHEN** the binary refuses the change, or reports it
- **THEN** a refusal is its `change_error` document under `--json`, its message
  on stderr in text, and a failure entry with its message under `--all`; a
  reported change's warning goes to stderr in text, or into `warnings` as
  `{code: "tasks_unreadable", message}` under `--json`

### Requirement: Status answers a change whose schema the binary cannot load as the binary does

When the binary cannot load a cospec-typed change's schema (missing from every
tier, unreadable, unparsable or invalid), `cospec status` SHALL ask the binary
via its one delegated `openspec status --json` call, in both modes, for
`--change` and `--all`. The refusal SHALL be the answer: `change_error` under
`--json`, the message on stderr with empty stdout in text, a failure entry with
the message under `--all`, exit 1. Other changes in the sweep SHALL be reported
as they are alone.

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
`.openspec.yaml`, `cospec status` SHALL ask the binary via its one delegated
`openspec status --json` call, in both modes, for `--change` and `--all`. The
refusal SHALL be the answer: `change_error` under `--json`, the message on
stderr with empty stdout in text, a failure entry with the message under
`--all`, exit 1. Other changes in the sweep SHALL be reported as they are alone.

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

#### Scenario: Every metadata refusal the binary makes is covered

- **WHEN** `.openspec.yaml` is unreadable, not YAML, names a schema the binary
  does not list, or fails `ChangeMetadataSchema` (a `created` not `YYYY-MM-DD`,
  an empty `goal`, a non-boolean `skip_specs` or `retire_capabilities`, an
  `affected_areas` not a list of non-empty strings, an `initiative` not exactly
  a kebab-case `{store, id}`)
- **THEN** `cospec status` defers to the binary's refusal as above

### Requirement: Apply declares and relays the binary's operation inputs

`ApplyInstructionsJson` SHALL declare the pinned binary's optional `context?`,
`operationGuidance?` and `references?`, and `cospec apply` SHALL relay them on
the clear-gate and legacy-schema paths, in `--json` and the human transcript.
`context` and `operationGuidance` SHALL pass byte for byte, even an entry
beginning `openspec `. Only `references[].fetch` and `references[].status[].fix`
SHALL be respelled, by the whole-value remedy rule.

#### Scenario: configured guidance surfaces in both paths, text and JSON

- **WHEN** a project's `config.yaml` sets `context` and
  `operations.apply.guidance` and `cospec apply <change>` runs on a cospec-typed
  change and on a legacy-schema change, each with and without `--json`
- **THEN** every output carries the context and each guidance entry, and the
  text sections equal the pinned binary's own for the same project

#### Scenario: nothing configured prints nothing new

- **WHEN** no `context`, `operations` or `references` is configured
- **THEN** both transcripts are byte-identical to the previous release's and
  neither prints `No project context or operation guidance configured.`

#### Scenario: user text is never respelled, reference commands are

- **WHEN** an `operations.apply.guidance` entry begins `openspec list` and a
  declared reference carries a `fetch` command beginning `openspec `
- **THEN** the guidance entry is relayed unchanged and the `fetch` field reads
  `cospec ...`

#### Scenario: Human transcript sections follow the binary

- **WHEN** the human transcript is printed
- **THEN** `### Referenced Stores` precedes the instruction when `references` is
  present, and `### Project Context (required instruction input)` and
  `### Operation Guidance (advisory)` follow it, each only when its input is
  present, rendered as the pinned binary renders them; with none of the three
  present the transcript is byte-identical to before

### Requirement: Workflow follow-up steps stay out of task progress

cospec's task parser SHALL count every checkbox in a tracked file exactly as the
pinned binary does, and the tasks guidance SHALL put steps that can only happen
after archive in a `## Workflow follow-up` section of plain bullets, so they
never block the apply gate, archive task gate, `status`, or `list` progress.

#### Scenario: Follow-up bullets do not block archive

- **WHEN** every checkbox task is checked and `## Workflow follow-up` holds
  plain bullets
- **THEN** `cospec archive` does not refuse on incomplete tasks and `status`
  reports full progress

#### Scenario: Counts match the binary

- **WHEN** the differential test parses the same `tasks.md` through cospec and
  the pinned binary
- **THEN** both report identical completed and total counts

### Requirement: Apply relays task source locations

`cospec apply --json` SHALL carry each task's `sourcePath` and `line` from the
pinned binary's apply instructions, so an agent edits the exact checkbox even
when tasks span several files.

#### Scenario: Multi-file tasks

- **WHEN** a schema tracks tasks through a glob that matches two files
- **THEN** every task in `cospec apply --json` names its own file and 1-based
  line

### Requirement: Completed tasks lead to verify, not archive

When every tracked task is checked, `cospec apply` and `cospec status` SHALL say
the tracked tasks are complete and name the verify workflow, spelled for the
harness (for example `/cospec:verify` in Claude Code), and
`cospec validate <slug> --strict` as the next step, and SHALL NOT call the
change ready to archive until the verification ledger also passes.

#### Scenario: Ledger still open

- **WHEN** all tasks are checked but a verification row is bare `[ ]`
- **THEN** the next step names verification and `archiveReady` is `false`

### Requirement: Archive task gate is schema-aware

`cospec archive`'s incomplete-task gate SHALL read every file the change's
schema tracks through `apply.tracks` (path or glob), the same resolver `status`
and `apply` use, instead of a fixed `tasks.md`.

#### Scenario: Unchecked task in a second tracked file

- **WHEN** a schema tracks `tasks/*.md` and only `tasks/b.md` holds an unchecked
  task
- **THEN** `cospec archive` refuses on incomplete tasks naming `tasks/b.md`
