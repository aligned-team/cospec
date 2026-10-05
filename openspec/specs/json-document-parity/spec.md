# json-document-parity Specification

## Purpose

Keeps cospec's `--json` documents a strict superset of the wrapped OpenSpec
binary's own: `list`, `status` (single-change and `--all`) and `validate` (a
single item, a bulk scope, and `--report findings`) each merge the binary's own
document into cospec's by matching array entries on their identity, so every
upstream key reaches the document with the binary's value and no cospec key or
value is lost. A small named-collision list lets cospec's value win where the
two meanings genuinely differ (`version`, validate's `items[].type`); every
other key path is additive. The contract key oracle
(`test/contract/support/key-oracle.ts`) is the gate: it runs cospec and the
pinned binary on the same fixture and fails on any missing upstream key, any
differently-reported upstream value, or any unnamed collision.

## Requirements

### Requirement: Upstream keys are added without changing cospec's

For `cospec list`, `cospec list --specs`, `cospec status --change`,
`cospec status --all`, `cospec validate` (a single item, a bulk scope, and
`--report findings`) under `--json`, cospec SHALL emit every key the wrapped
binary's own document for the same invocation carries, with the binary's value,
matching array entries by their identity (`name`, `changeName`, artifact `id`,
item `id` plus kind). It SHALL keep every key it emitted before, with its own
value. It SHALL keep `version: 1` on every envelope that carries one, and it
SHALL NOT take the binary's `version`. Remedy commands inside upstream values
(`nextSteps`) SHALL be spelled `cospec`.

Where a key both tools emit would need two different values, cospec's value
SHALL win only for a key on the named collision list, which this change defines
as `version` and validate's `items[].type` (cospec's is the change's schema; the
binary's `change|spec` is cospec's `kind`). The `root` of the `status` documents
SHALL take the binary's `{path, source, store_id?}` object.

#### Scenario: A mid-build status document carries both shapes

- **WHEN** `cospec status --change alpha --json` runs on a `feat` change with
  only `proposal.md`
- **THEN** the document carries cospec's `change`, `type`, `state`, `gate`,
  `tasks`, `archiveReady`, `verification` and `next`, and the binary's
  `changeName`, `schemaName`, `planningHome`, `changeRoot`, `artifactPaths`,
  `isPlanningComplete`, `isComplete`, `applyRequires`, `nextSteps`,
  `actionContext` and `root`, and each `artifacts[]` entry carries cospec's
  `done`, `required`, `ready` and the binary's `outputPath`, `status`,
  `requires`

#### Scenario: Validate keeps its format marker and its type

- **WHEN** `cospec validate --all --json` runs
- **THEN** `version` is `1`, each change item's `type` is its schema, each item
  also carries `kind` and `durationMs`, and the document carries `root` and
  `summary.totals`/`summary.byType` beside cospec's `errors`, `warnings` and
  `byRule`

### Requirement: A key oracle proves the additivity against the binary

A contract test SHALL run each command listed in the requirement above, and
`cospec apply <unknown> --json` beside
`openspec instructions apply --change <unknown> --json`, against the pinned
binary on the same fixture and environment. It SHALL fail when an upstream key
path is missing from cospec's document; when a key both tools emit carries
different values and is not on the named collision list; and when a key from
cospec's own pre-existing shape is missing or changed. Timing values
(`durationMs`, `lastModified`) SHALL be compared by presence and type.
Validation verdicts (`valid`, `issues`, the summary counts) SHALL be compared by
presence and type, since each lane keeps its own findings. A key whose value is
cospec's own pre-existing one SHALL be compared by presence and type too: the
in-progress status entry's `artifacts: []`, into which the binary's artifacts
are never appended. The oracle SHALL itself be tested to fail on a synthetic
collision.

#### Scenario: The oracle passes for every covered command

- **WHEN** the contract suite runs the key oracle
- **THEN** every row passes and its fixture exercises at least one entry of
  every array it compares

#### Scenario: The oracle fails on an unlisted collision

- **WHEN** the oracle is handed a cospec document whose `root` is a string where
  the binary's is an object
- **THEN** it reports the collision and fails

### Requirement: Every --json failure is one document

Under `--json` a command SHALL answer every failure with exactly one JSON
document on stdout and nothing else there:

- Every root-selection failure SHALL carry the binary's per-command payload:
  `{changes: [], root: null}` for `list` and `status --all`, and
  `{specs: [], root: null}` for `list --specs`. A selection diagnostic (such as
  an unknown store) SHALL keep its own code.
- A raw resolver failure, one the binary rethrows rather than turning into a
  selection diagnostic (such as an unreadable store registry), SHALL carry the
  binary's per-command code: `list_error` for `list`, `change_error` for
  `status` and `apply`, and `validate_error` for `validate`.
- Every early exit of `cospec apply` (no `openspec/` root, an unknown change, a
  failed wrapped call) SHALL be
  `{status: [{severity: "error", code, message, fix?}]}` with exit 1.
- A list-time read failure SHALL be the binary's own answer when the binary
  reads that path, and otherwise a per-row `error`.

#### Scenario: Apply names an unknown change in one document

- **WHEN** `cospec apply nope --json` runs
- **THEN** stdout is one
  `{status: [{severity: "error", code: "change_error", message}]}` document
  naming `nope`, stderr carries nothing, and the exit code is 1

#### Scenario: A raw registry failure carries the command's code

- **WHEN** `cospec list --json --store s1` runs with an unreadable store
  registry
- **THEN** stdout is
  `{changes: [], root: null, status: [{…, code: "list_error", message}]}` and
  the exit code is 1, as the binary answers

#### Scenario: An unknown store carries the command's payload

- **WHEN** `cospec list --json --store nope` runs with stores registered
- **THEN** stdout is
  `{changes: [], root: null, status: [{…, code: "unknown_store", message, target, fix}]}`
  and the exit code is 1, as the binary answers

### Requirement: Archive's JSON documents carry the binary's keys

`cospec archive <change> --json` SHALL add the binary's keys to its success
document without changing any cospec key:
`archive: {change, archivedAs, path, specsUpdated, totals?, warnings?}` and
`root: {path, source, store_id?}`. `archivedAs` SHALL be the archive directory
verified on disk. `path` SHALL be its canonical absolute path. `specsUpdated`
and `totals` SHALL be the values the wrapped archive reported applying, read
from its own `Totals:` line and its `Specs updated successfully.` or
`Specs already in sync; no files changed.` line. `totals` SHALL be absent when
no spec sync ran, and `warnings` SHALL be absent when the binary reported none.
A key oracle row SHALL compare the document with the binary's own
`archive <change> -y --json` on a copy of the same fixture.

#### Scenario: The success document matches the binary's keys

- **WHEN** `cospec archive c1 --json` archives a MODIFIED change, and
  `openspec archive c1 -y --json` archives a copy
- **THEN** cospec's `archive` and `root` equal the binary's, apart from the
  copy's own path, and every cospec key keeps its native value

### Requirement: Every archive refusal under --json is one document

Under `--json` every refusal of `cospec archive` SHALL be exactly one document
on stdout, with exit 1: `archive: null`, `root` (absent when no root resolved,
as in the binary), `status: [{severity: "error", code, message, fix?}]`, and
cospec's `change`, `type`, `archived: false` and `reason`. `code` and `message`
SHALL be the binary's for every refusal the binary makes on the same input:

| Refusal                           | `code`                               |
| --------------------------------- | ------------------------------------ |
| unknown change                    | `archive_change_not_found`           |
| invalid change name               | `archive_change_name_invalid`        |
| namespace folder                  | `archive_change_is_namespace_folder` |
| revalidation failed               | `archive_validation_failed`          |
| incomplete tasks                  | `archive_tasks_incomplete`           |
| archive slot taken                | `archive_target_exists`              |
| scenario preservation             | `archive_spec_update_failed`         |
| unreadable archive directory      | the binary's code on that runtime    |
| a delegated failure cospec relays | `archive_error`                      |

For scenario preservation the `message` SHALL be the binary's sentence for the
first dropped requirement its merge would abort on. For a delegated failure it
SHALL be the wrapped archive's own last reason line, respelled.
`archive/verification-incomplete` has no upstream counterpart and SHALL carry
the code `archive_verification_incomplete`. `fix` SHALL be cospec's spelling of
the remedy cospec accepts (`--force-incomplete` for the tasks gate, where the
binary names `--yes`). The revalidation refusal SHALL keep the keys of the
report it carried before. A root-selection failure SHALL answer through the
shared resolver document with archive's payload `{archive: null}`.

#### Scenario: A gate refusal prints a document

- **WHEN** `cospec archive c1 --json` runs on a change with an incomplete task
- **THEN** stdout is one document with `archive: null`, `root`, and
  `status[0].code` `archive_tasks_incomplete` with the binary's message, and the
  exit code is 1

#### Scenario: An unreadable archive directory is one document

- **WHEN** `openspec/changes/archive/` is mode 000 and
  `cospec archive c1 --json` runs
- **THEN** stdout is one document whose `status[0].code` equals the binary's on
  the same runtime (`archive_path_outside_root` under Bun on macOS,
  `archive_error` naming the archive path under Bun on Linux), compared by code
  and path, and the exit code is 1
