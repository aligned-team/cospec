# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Status names the next step on every entry

Each entry with a status SHALL carry `next` from one function over the artifact
states in build order (ready: not done, its requirements done;
`skip_specs`-skipped is done): the first ready apply-required artifact, else the
first ready one, as `cospec instructions <artifact> --change <id>`; once all
apply-required are done, `cospec apply <id>`, or `cospec validate <id> --strict`
if a cospec type's tasks are all checked; else absent. Text shows
`Next: <command>` or the tasks-complete guidance.

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

- **WHEN** every artifact a `feat` change requires exists, `tasks.md` has an
  unchecked task or none, and the optional `design.md` doesn't
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
