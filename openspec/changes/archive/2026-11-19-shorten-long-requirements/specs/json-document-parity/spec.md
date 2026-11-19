# Spec Delta

## MODIFIED Requirements

### Requirement: Upstream keys are added without changing cospec's

Under `--json`, `list`, `list --specs`, `status --change`, `status --all`, and
`validate` (single, bulk, `--report findings`) SHALL emit every key the binary's
document for the same invocation carries, with its value, matching array entries
by identity (`name`, `changeName`, artifact `id`, item `id` plus kind). cospec
SHALL keep every key it emitted before with its own value, including
`version: 1`, never the binary's `version`. Remedies in upstream `nextSteps`
SHALL be spelled `cospec`.

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

#### Scenario: Only listed collisions keep cospec's value

- **WHEN** a key both tools emit would need two different values
- **THEN** cospec's value wins only for the named collision list, `version` and
  validate's `items[].type` (cospec's is the change's schema; the binary's
  `change|spec` is cospec's `kind`), and the `status` documents' `root` takes
  the binary's `{path, source, store_id?}` object

### Requirement: A key oracle proves the additivity against the binary

A contract test SHALL run each command the requirement above lists, and
`cospec apply <unknown> --json` beside
`openspec instructions apply --change <unknown> --json`, against the pinned
binary on one fixture and environment. It SHALL fail when an upstream key path
is missing from cospec's document, when a shared key differs and is not on the
named collision list, or when a key of cospec's pre-existing shape is missing or
changed, and SHALL itself be tested to fail on a synthetic collision.

#### Scenario: The oracle passes for every covered command

- **WHEN** the contract suite runs the key oracle
- **THEN** every row passes and its fixture exercises at least one entry of
  every array it compares

#### Scenario: The oracle fails on an unlisted collision

- **WHEN** the oracle is handed a cospec document whose `root` is a string where
  the binary's is an object
- **THEN** it reports the collision and fails

#### Scenario: Lane-owned values are compared by presence and type

- **WHEN** the oracle compares timing values (`durationMs`, `lastModified`),
  validation verdicts (`valid`, `issues`, the summary counts), or a key whose
  value is cospec's own pre-existing one, such as the in-progress status entry's
  `artifacts: []` that the binary's artifacts are never appended to
- **THEN** it compares them by presence and type only

### Requirement: Every --json failure is one document

Under `--json` a command SHALL answer every failure with exactly one JSON
document on stdout and nothing else there. A root-selection failure SHALL carry
the binary's per-command payload (`{changes: [], root: null}` for `list` and
`status --all`, `{specs: [], root: null}` for `list --specs`), a selection
diagnostic such as an unknown store keeping its own code. A list-time read
failure SHALL be the binary's own answer when the binary reads that path, and
otherwise a per-row `error`.

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

#### Scenario: A raw resolver failure carries the binary's per-command code

- **WHEN** the resolver fails in a way the binary rethrows rather than turning
  into a selection diagnostic, such as an unreadable store registry
- **THEN** the document's code is `list_error` for `list`, `change_error` for
  `status` and `apply`, and `validate_error` for `validate`

#### Scenario: Every early apply exit is a status document

- **WHEN** `cospec apply --json` exits early on no `openspec/` root, an unknown
  change, or a failed wrapped call
- **THEN** stdout is `{status: [{severity: "error", code, message, fix?}]}` and
  the exit code is 1

### Requirement: Archive's JSON documents carry the binary's keys

`cospec archive <change> --json` SHALL add the binary's keys to its success
document without changing any cospec key:
`archive: {change, archivedAs, path, specsUpdated, totals?, warnings?}` and
`root: {path, source, store_id?}`. `archivedAs` SHALL be the archive directory
verified on disk and `path` its canonical absolute path. A key oracle row SHALL
compare the document with the binary's own `archive <change> -y --json` on a
copy of the same fixture.

#### Scenario: The success document matches the binary's keys

- **WHEN** `cospec archive c1 --json` archives a MODIFIED change, and
  `openspec archive c1 -y --json` archives a copy
- **THEN** cospec's `archive` and `root` equal the binary's, apart from the
  copy's own path, and every cospec key keeps its native value

#### Scenario: Sync totals are what the wrapped archive reported

- **WHEN** the success document is built
- **THEN** `specsUpdated` and `totals` are the values the wrapped archive
  reported applying, read from its `Totals:` line and its
  `Specs updated successfully.` or `Specs already in sync; no files changed.`
  line, `totals` is absent when no spec sync ran, and `warnings` is absent when
  the binary reported none

### Requirement: Every archive refusal under --json is one document

Under `--json` every refusal of `cospec archive` SHALL be exactly one document
on stdout, exit 1: `archive: null`, `root` (absent when none resolved, as in the
binary), `status: [{severity: "error", code, message, fix?}]`, and cospec's
`change`, `type`, `archived: false` and `reason`. `code` and `message` SHALL be
the binary's for each refusal the binary makes on that input. A root-selection
failure SHALL answer through the shared resolver document with archive's payload
`{archive: null}`.

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

#### Scenario: Refusal codes are the binary's

- **WHEN** archive refuses under `--json`
- **THEN** `code` is `archive_change_not_found` for an unknown change,
  `archive_change_name_invalid` for an invalid name,
  `archive_change_is_namespace_folder` for a namespace folder,
  `archive_validation_failed` for failed revalidation,
  `archive_tasks_incomplete` for incomplete tasks, `archive_target_exists` for a
  taken archive slot, `archive_spec_update_failed` for scenario preservation,
  the binary's code on that runtime for an unreadable archive directory, and
  `archive_error` for a delegated failure cospec relays

#### Scenario: Refusal messages and fixes

- **WHEN** archive refuses under `--json` for scenario preservation, a delegated
  failure, or the tasks gate
- **THEN** the scenario-preservation `message` is the binary's sentence for the
  first dropped requirement its merge would abort on, a delegated failure's is
  the wrapped archive's last reason line respelled, and `fix` is cospec's
  spelling of the remedy cospec accepts (`--force-incomplete` for the tasks
  gate, where the binary names `--yes`)

#### Scenario: cospec-only refusals keep their own shape

- **WHEN** archive refuses on `archive/verification-incomplete` or on
  revalidation
- **THEN** the verification refusal carries code
  `archive_verification_incomplete`, which has no upstream counterpart, and the
  revalidation refusal keeps the keys of the report it carried before
