# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
