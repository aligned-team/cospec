# openspec-read-passthroughs Specification

## Purpose

cospec provides disciplined, gate-free wraps of OpenSpec's read-only and
personal commands — `show`, `view`, `context`, the `workset` group, `schemas`,
`schema which|validate`, and `templates` — so inspecting a change/spec, a
cross-repo brief, personal working views, or schema resolution never requires
bare `openspec`. Each wrap carries the full wrapped-call discipline (declared
exit codes, stdout deny-list, a single-JSON-document invariant on `--json`) and
`--store` threading where the root is store-backed, but adds no cospec gate of
its own.

## Requirements

### Requirement: Show and view are disciplined read-only passthroughs

`cospec show <item>` SHALL wrap `openspec show` for both changes and specs,
forwarding `--type`/`--json`/`--deltas-only`/`--requirements`/
`--no-scenarios`/`-r` and `--store`. On `--json`, the command SHALL verify the
wrapped call emitted exactly one parseable JSON document before returning
success. `cospec view` SHALL wrap `openspec view` as a thin dashboard
passthrough and SHALL exit 1 if no `openspec/` root resolves.

#### Scenario: Show a change as JSON

- **WHEN** `cospec show <change> --json` runs on an existing change
- **THEN** stdout is exactly one JSON document containing at least `id` and
  `deltas`

#### Scenario: Show a spec's requirements

- **WHEN** `cospec show <spec> --json --requirements` runs on an existing
  capability spec
- **THEN** stdout is exactly one JSON document containing that spec's
  requirements

#### Scenario: Ambiguous or unknown item surfaces exit 1

- **WHEN** `cospec show <name>` is given a name that does not resolve to exactly
  one change or spec
- **THEN** the command exits 1 and does not emit a malformed or partial JSON
  document on `--json`

### Requirement: Context passthrough with code-workspace post-condition

`cospec context` SHALL wrap `openspec context`, threading `--store`/`--json`/
`--code-workspace <path>`/`--force`. When `--code-workspace <path>` is given and
the wrapped call exits 0, the command SHALL verify `<path>` exists on disk
before reporting success; without `--force`, an existing file at `<path>` SHALL
cause a refusal rather than a silent overwrite.

#### Scenario: JSON brief lists working-set members

- **WHEN** `cospec context --json` runs in a store-backed repo
- **THEN** stdout is exactly one JSON document containing a `members` array

#### Scenario: Code-workspace file is verified on disk

- **WHEN** `cospec context --code-workspace <path>` succeeds
- **THEN** `<path>` exists on disk after the command returns

#### Scenario: Existing code-workspace file is protected

- **WHEN** `cospec context --code-workspace <path>` runs and `<path>` already
  exists, without `--force`
- **THEN** the command refuses to overwrite `<path>` and exits non-zero

### Requirement: Workset group passthrough with a terminal-handover exec

`cospec workset create|list|remove` SHALL wrap the corresponding
`openspec workset` subcommand, preserving `--member`/`--tool`/`--yes`/`--json`
and the JSON one-document failure mirror. `cospec workset open` SHALL be a
terminal-handover exec, the founding member of cospec's **terminal-handover
class**: a wrapped call whose child owns the terminal because it spawns an
editor or drives an interactive prompt. Every member of that class SHALL
version-assert the wrapped binary first, spawn it with inherited stdio and
`shell: false` (array argv, no shell interpolation), propagate the child
process's exit code unchanged — including `130`, which the wrapped binary sets
when a prompt is cancelled — emit no JSON of its own, and declare no
`RunExpectation`, which is the documented exception to wrapped-call discipline
because inherited stdio leaves no captured stdout for a deny-list to inspect.
`cospec workset open` SHALL NOT thread `--json` or `--no-color`, matching
OpenSpec's own rejection of `--json` for that subcommand. The class's other
members are the interactive `cospec config` subcommands, whose obligations are
specified by the config passthrough capability.

#### Scenario: Create then list shows the workset

- **WHEN** `cospec workset create <name>` succeeds and is followed by
  `cospec workset list --json`
- **THEN** the JSON list includes an entry for `<name>`

#### Scenario: Remove without confirmation is refused

- **WHEN** `cospec workset remove <name>` runs non-interactively without `--yes`
- **THEN** the command refuses and exits non-zero without deleting the workset

#### Scenario: Open propagates the child's exit code

- **WHEN** `cospec workset open <name>` is invoked
- **THEN** the command spawns `openspec workset open <name>` with inherited
  stdio and exits with exactly the child process's exit code

#### Scenario: A handover call declares no run expectation

- **WHEN** any terminal-handover member is invoked
- **THEN** it asserts the wrapped binary's version, spawns with inherited stdio
  and `shell: false`, declares no `RunExpectation`, and emits no JSON document
  of its own

### Requirement: Schema and template inspection are read-only passthroughs

`cospec schemas` and `cospec templates` SHALL be read-only passthroughs listing
resolvable schemas and per-artifact template paths, with `--json` producing
exactly one parseable JSON document. `cospec schema which` and
`cospec schema validate` SHALL be read-only passthroughs forwarding
`--json`/`--all`/`--verbose`; `cospec schema fork` and `cospec schema init`
SHALL NOT be wired to the wrapped binary — invoking either SHALL print guidance
pointing at cospec's canon-managed workflow and exit 1, because custom schema
authoring conflicts with cospec's canon-managed 11-schema model.

#### Scenario: Schemas lists the eleven cospec types

- **WHEN** `cospec schemas --json` runs in a cospec-managed repo
- **THEN** the JSON output lists all eleven cospec conventional-commit schema
  types

#### Scenario: Schema validate passes on a generated schema

- **WHEN** `cospec schema validate <type>` runs against a schema generated by
  `mise run generate`
- **THEN** the command exits 0

#### Scenario: Schema fork is refused with guidance

- **WHEN** `cospec schema fork` is invoked
- **THEN** the command does not call the wrapped binary, prints guidance
  pointing at the canon-managed schema workflow, and exits 1

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

### Requirement: Relayed wrapped guidance never instructs bare openspec

Guidance cospec relays out of the wrapped binary — a blocked-apply remedy, an
apply warning, or any other instructional string cospec re-emits rather than
authors — SHALL NOT reach a user or an agent naming a bare `openspec` command,
because an agent that follows such an instruction bypasses every cospec gate the
routing discipline exists to enforce. cospec SHALL rewrite the wrapped binary's
command name to its own on every relay path, in the human transcript and in
`--json` alike.

The rewrite SHALL be anchored to a backtick-delimited command span whose first
word is the wrapped binary's name, and SHALL NOT be a substitution over the
whole string. Warning text embeds an absolute metadata path ending
`.openspec.yaml`, and upstream prose names the product as well as the command; a
token-level substitution corrupts both. The rewrite SHALL apply only to verbs
cospec actually wraps, so it can never invent a command that does not exist; a
span naming any other verb SHALL be relayed unchanged rather than rewritten into
a wrong instruction.

The guard SHALL apply on every path a relay is reachable from, including the
legacy apply path that runs no cospec gate, a change grandfathered to an earlier
schema version whose narrower enforced requirements clear cospec's own gate
while the wrapped binary still reports it blocked, and a change whose tracked
task file exists but contains no task.

#### Scenario: A blocked remedy names cospec, not openspec

- **WHEN** the wrapped binary returns a blocked apply state whose remedy names a
  bare `openspec instructions` command, on the legacy apply path
- **THEN** neither the human transcript nor the `--json` document contains a
  backtick-delimited command span beginning with the wrapped binary's name

#### Scenario: A grandfathered change's relayed remedy is rewritten

- **WHEN** a change still on the earlier schema version clears cospec's apply
  gate while the wrapped binary reports it blocked on an artifact cospec does
  not enforce for that version
- **THEN** the relayed remedy names `cospec`, and the exit code is the one
  cospec's own gate decided

#### Scenario: An embedded metadata path survives the rewrite

- **WHEN** a relayed warning embeds an absolute path ending `.openspec.yaml` in
  the same string as a command span
- **THEN** the command span is rewritten and the path is byte-for-byte unchanged

#### Scenario: An unwrapped verb is relayed unchanged

- **WHEN** a relayed string names a wrapped-binary command cospec does not wrap
- **THEN** the span is left as the wrapped binary wrote it rather than rewritten
  into a cospec command that does not exist
