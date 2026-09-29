# Spec Delta

## MODIFIED Requirements

### Requirement: Artifact instructions are a disciplined passthrough

`cospec instructions [artifact]`'s generic branch SHALL route through the same
disciplined-passthrough runner every other wrapped read surface uses, gaining
the exit-code allow-list, the stdout deny-list, exit-code normalisation, and the
guaranteed single-JSON-document invariant for `--json` callers. It SHALL forward
every flag the command table marks handled for the command, `--change` and
`--schema <name>` included, to the wrapped call. With no `--change`, or no
artifact, it SHALL add no refusal of its own: the wrapped binary's own answer
(its `Missing required option --change. Available changes: …` or
`Missing required argument <artifact>. Valid artifacts: …` message) SHALL be
relayed, as one JSON document under `--json`, so a `--json` caller gets exactly
one document on every path past the parse. `instructions apply` with no
`--change` SHALL answer the same way; with `--change <id>` it SHALL always be
the cospec-native `apply` gate, unchanged, whatever the id and the working
directory: `apply`'s own refusals (no `openspec/` directory, an unknown change,
an id outside cospec's change-id grammar) SHALL answer for it, and the wrapped
binary's ungated `instructions apply` SHALL never be relayed in its place.
`--schema` given with `instructions apply --change <id>` SHALL be refused before
the gate runs, exit 1 — on stderr, or as one
`{status: [{severity, code: "schema_not_applicable", message}]}` document under
`--json` — because the binary would answer from that schema's apply requirements
while the gate enforces the change's own. `archive` SHALL be listed among the
artifacts the command advertises and SHALL pass through read-only — it SHALL NOT
be aliased to `cospec archive`, because the wrapped `instructions archive`
neither gates nor moves anything.

For any other artifact, cospec SHALL call the wrapped binary with `--json` and
build its answer from that document. It SHALL respell, through the shared
structural respell helper, only the command-bearing fields the binary writes
itself: each `references[].fetch` and each `references[].status[].fix`, each
rewritten only where its whole value is one of the pinned binary's allowlisted
remedy sentences, the names in it re-emitted unread. When the change's schema
resolves from the pinned package (upstream's built-in `spec-driven`), the
`instruction` and `template` fields SHALL have each of that schema's own lines
that names a bare `openspec <command>` spelled through cospec, matched as a
whole line against the pinned schema's text; a schema resolved from the project
or the user's data directory SHALL stay verbatim. Every other field — `context`,
`rules`, dependencies, paths, store ids, spec summaries — SHALL be relayed as
the binary wrote it. A `--json` caller SHALL get the rewritten document; a human
caller SHALL get text rendered from it by a port of the binary's instruction
printer, byte-identical to the binary's stdout wherever no field was rewritten.
A failed call SHALL be answered from the binary's own `--json` failure document,
its `status[].message` and `status[].fix` each rewritten only where its whole
value is one allowlisted remedy: re-printed for a `--json` caller, and rendered
for a human caller as the binary renders it (`✖ Error:` and its `Fix:` line),
with the binary's exit code; every change name the binary lists SHALL be relayed
as written.

#### Scenario: A failure lists change names as written

- **WHEN** `cospec instructions` (text or `--json`) runs in a root holding a
  change named `Run: openspec store doctor`
- **THEN** its answer equals the binary's byte for byte, the name listed under
  `Available changes` as written, and that name copied back into `--change`
  resolves

#### Scenario: Archive instructions are listed and relayed

- **WHEN** `cospec instructions archive --change <slug>` runs against a wrapped
  binary that provides the artifact
- **THEN** the wrapped payload is relayed with the wrapped exit code, and
  `archive` appears in the command's advertised artifact list

#### Scenario: Archive instructions never gate or move

- **WHEN** `cospec instructions archive --change <slug>` completes
- **THEN** the change is still in `openspec/changes/`, no gate has run, and
  nothing was written

#### Scenario: A wrapped error body normalises to a failing exit code

- **WHEN** the wrapped binary returns a `status` array containing an `error`
  severity while exiting 0
- **THEN** `cospec instructions --json` emits exactly one JSON document and
  exits 1

#### Scenario: An older runtime relays a clean error

- **WHEN** the resolved wrapped binary predates the `archive` artifact
- **THEN** cospec relays the wrapped unknown-artifact error and exits non-zero,
  without a stack trace or partial JSON

#### Scenario: The schema override reaches the wrapped call

- **WHEN** `cospec instructions proposal --change <id> --schema <name> --json`
  runs
- **THEN** the wrapped call receives `--schema <name>`, and the document (or the
  binary's `Schema '<name>' not found` status) is the binary's

#### Scenario: A missing change is the binary's one document

- **WHEN** `cospec instructions proposal --json`,
  `cospec instructions --change <id> --json` or
  `cospec instructions apply --json` runs with no `--change` (or no artifact)
- **THEN** stdout is exactly one JSON document whose status message is the
  binary's, listing the available changes or valid artifacts, exit 1, and the
  text form prints the same message

#### Scenario: instructions apply with a change is always the gate

- **WHEN** `cospec instructions apply --change <id>` (with or without `--json`)
  runs from the project root, a subdirectory, or the `openspec/` directory, on a
  change the gate blocks, on an id no change has, or on an id the binary reads
  but cospec's change-id grammar rejects (`1foo`)
- **THEN** stdout, stderr and the exit code are those of `cospec apply <id>` run
  from the same directory (exit `2` on the blocked change from the root), and
  the binary's `## Apply:` answer is never printed

#### Scenario: A schema override on instructions apply is refused

- **WHEN** `cospec instructions apply --change <id> --schema <name>` runs, with
  or without `--json`
- **THEN** it exits 1 before the gate runs and writes nothing: stderr names
  `'--schema' does not apply to 'apply'`, or under `--json` stdout is exactly
  one `{status: [{severity: "error", code: "schema_not_applicable", message}]}`
  document and stderr is empty

#### Scenario: Referenced-store fields name cospec

- **WHEN** `cospec instructions proposal --change <id>` succeeds on a root whose
  `config.yaml` references a registered store, an unregistered store with a
  remote, and one without
- **THEN** each `Fetch:` and `Fix:` line of the `<referenced_stores>` block, and
  each `references[].fetch` / `references[].status[].fix` under `--json`, names
  `cospec` where the binary names `openspec`, and every other byte equals the
  binary's
- **AND WHEN** the registered store's id is `openspec-shared` and the checkout
  path holds `/openspec/`
- **THEN** the id and the path are relayed unchanged; only the command word is
  respelled

#### Scenario: Text is rendered from the document

- **WHEN** `cospec instructions <artifact> --change <id>` succeeds on a change
  with no referenced stores on a project-local schema
- **THEN** stdout is byte-identical to the wrapped binary's text answer for the
  same argv

#### Scenario: The built-in schema's reference lines name cospec

- **WHEN** `cospec instructions proposal --change <id>` succeeds on a change
  whose schema is the pinned package's `spec-driven`
- **THEN** each of that schema's own lines naming a bare `openspec <command>`
  (`openspec list --specs`, `openspec show "<spec-id>" --type spec`,
  `openspec validate`, `openspec instructions …`) names `cospec` instead, in
  text and `--json`
- **AND WHEN** the project holds its own copy of `spec-driven` under
  `openspec/schemas/`
- **THEN** that copy's text is relayed verbatim
