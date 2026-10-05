# Spec Delta

## ADDED Requirements

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
