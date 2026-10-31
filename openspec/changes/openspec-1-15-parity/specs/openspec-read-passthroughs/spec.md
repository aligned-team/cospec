# Spec Delta

## MODIFIED Requirements

### Requirement: Show and view are disciplined read-only passthroughs

`cospec show <item>` SHALL wrap `openspec show` for both changes and specs,
forwarding `--type`/`--json`/`--deltas-only`/`--requirements`/
`--no-scenarios`/`-r` and `--store`. On `--json`, the command SHALL verify the
wrapped call emitted exactly one parseable JSON document before returning
success. `cospec view` SHALL be cospec's native dashboard (see "View dashboard
shows workflow and gate state"), not a passthrough, and SHALL exit 1 if no
`openspec/` root resolves.

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

`cospec context` SHALL wrap `openspec context`, threading `--store`, `--json`,
`--code-workspace <path>` and `--force`, always calling the binary with
`--json`. After a successful `--code-workspace` call it SHALL verify `<path>`
exists before reporting success; without `--force` an existing `<path>` SHALL be
refused, not overwritten. Only the binary's own reference remedies SHALL be
spelled through cospec, structurally; every other byte SHALL be the binary's.

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

#### Scenario: The reference block names cospec

- **WHEN** `cospec context` runs, text and `--json`, on a root that references a
  usable store, a registered store whose checkout is empty, and an unregistered
  id
- **THEN** the `Fetch:` line and `fetch` field read
  `cospec show <spec-id> --type spec --store <id>`, the two fixes read
  `Run: cospec store doctor <id>` and
  `Get a checkout from a teammate and run: cospec store register <path> --id <id>`,
  and every other line and field equals the binary's answer for the same root

#### Scenario: User content that reads like a remedy is untouched

- **WHEN** a referenced store id, a root path or a member path holds text shaped
  like `openspec show …` or `Run: openspec store doctor`
- **THEN** that id or path is printed as the binary printed it, text and
  `--json`

#### Scenario: Store ids and a clone remote naming openspec are the binary's

- **WHEN** `cospec context` runs, text and `--json`, on a root referencing
  stores whose ids hold `openspec` (`openspec-team`, `openspec-broken`) and an
  unregistered `openspec-gone` declared with a clone remote that names
  `openspec`
- **THEN** each fetch and fix names `cospec` in command position only, and every
  id and the remote are printed as the binary printed them

#### Scenario: Only whole reference remedies are rewritten

- **WHEN** the context document is relayed
- **THEN** only `members[].fetch`, `members[].status[].fix` and `status[].fix`
  are rewritten, through the shared field-map helper, each only where its whole
  value is one of the pinned binary's reference remedies (the fetch recipe, the
  store-doctor, register, clone and list-the-rest fixes), with the remedy's ids,
  paths and remote re-emitted unread; paths, ids, messages and root labels stay
  the binary's

#### Scenario: JSON callers get the rewritten document

- **WHEN** `cospec context --json` succeeds
- **THEN** stdout is the rewritten document, serialized as the binary serializes
  it

#### Scenario: Text is rendered from the rewritten document

- **WHEN** `cospec context` runs without `--json`
- **THEN** stdout is cospec's rendering of the rewritten document laid out as
  the binary's human listing (`Working context for …`, `OpenSpec root`,
  `Referenced stores` with `Fetch:` lines, the empty-set line,
  `Not available on this machine` with `Fix:` and `Note:` lines), never produced
  by rewriting the binary's text

#### Scenario: Text-mode code-workspace output

- **WHEN** `cospec context --code-workspace <path>` runs in text mode
- **THEN** the listing is rendered from the writing call's document on stdout
  and its `Wrote …` summary relayed on stderr, as the binary prints them; when
  the binary refuses the write, the listing comes from a call that writes
  nothing, followed by the refusal as the binary's `Error:`/`Fix:` lines on
  stderr

#### Scenario: Other failures are relayed through the allowlist

- **WHEN** the wrapped context call fails any other way
- **THEN** the failure is relayed through the allowlist, a text caller getting
  the binary's own text answer

### Requirement: Workset group passthrough with a terminal-handover exec

`cospec workset create|list|remove` SHALL wrap `openspec workset`, keeping
`--member`/`--tool`/`--yes`/`--json` and the one-document failure mirror.
`cospec workset open` SHALL found the **terminal-handover class**: wrapped calls
whose child owns the terminal for an editor or prompt. Each member SHALL
version-assert first, spawn with inherited stdio and `shell: false`, propagate
the child's exit code unchanged (`130` included), emit no JSON, and declare no
`RunExpectation`.

#### Scenario: Create then list shows the workset

- **WHEN** `cospec workset create <name>` succeeds and is followed by
  `cospec workset list --json`
- **THEN** the JSON list includes an entry for `<name>`

#### Scenario: Remove without confirmation is refused

- **WHEN** `cospec workset remove <name>` runs non-interactively without `--yes`
- **THEN** the command refuses and exits non-zero without deleting the workset

#### Scenario: Open propagates the child's exit code

- **WHEN** `cospec workset open <name>` is invoked on an interactive terminal
  for a saved workset
- **THEN** the command spawns `openspec workset open <name>` with inherited
  stdio and exits with exactly the child process's exit code

#### Scenario: A handover call declares no run expectation

- **WHEN** any terminal-handover member hands the terminal over
- **THEN** it asserts the wrapped binary's version, spawns with inherited stdio
  and `shell: false`, declares no `RunExpectation`, and emits no JSON document
  of its own

#### Scenario: A missing or unknown workset subcommand is one document

- **WHEN** `cospec workset --json`, `cospec workset bogus --json` or
  `cospec workset -- --bogus --json` runs
- **THEN** stdout is exactly one JSON document whose `status[0].code` is
  `unknown_workset_subcommand` and whose message names `cospec workset`, exit 1,
  as the binary answers the same argv
- **AND WHEN** the same argv runs without `--json`
- **THEN** stderr is the binary's `Error: …` line with `cospec workset` in place
  of `openspec workset`, exit 1

#### Scenario: Open refuses JSON without opening anything

- **WHEN** `cospec workset open <name> --json` runs
- **THEN** stdout is exactly one document whose `status[0].code` is
  `workset_open_json_unsupported` and whose fix reads
  `Inspect worksets with: cospec workset list --json`, exit 1, and no tool is
  launched

#### Scenario: A non-interactive or unsaved open is answered piped

- **WHEN** `cospec workset open <name>` runs with no TTY on stdin, or names a
  workset that is not saved
- **THEN** the binary's refusal is printed with its remedy spelled
  `cospec workset …`, its exit code propagated, and no
  `Tip: Run 'openspec completion install'` line is printed
- **AND WHEN** the saved workset names an installed workspace-file tool and
  stdin has no TTY
- **THEN** the piped call opens it as the binary does and cospec exits 0

#### Scenario: A next-step line names cospec

- **WHEN** `cospec workset create <name> --member <path>` succeeds, and
  `cospec workset list` runs with no workset saved
- **THEN** the lines read `Open it any time with: cospec workset open <name>`
  and `No worksets saved. Create one with: cospec workset create`, and every
  other line is the binary's

#### Scenario: Bad subcommands and failures are the binary's

- **WHEN** the workset subcommand is missing, unknown, option-shaped or after a
  `--`, or any workset call fails
- **THEN** the answer is the binary's own, delegated with the user's argv (the
  `--` kept) and `--json` threaded when asked, relayed with its sentences
  spelled through cospec, as one `unknown_workset_subcommand` document under
  `--json` for a bad subcommand

#### Scenario: Successful create and list are relayed verbatim

- **WHEN** `workset create` or `workset list` succeeds
- **THEN** the output is relayed as the binary wrote it, except whole next-step
  lines (`Open it any time with: …`, `No worksets saved. Create one with: …`),
  each spelled through cospec

#### Scenario: Why a handover declares no run expectation

- **WHEN** a terminal-handover call is reviewed against wrapped-call discipline
- **THEN** its missing `RunExpectation` is the documented exception, because
  inherited stdio leaves no captured stdout for a deny-list to inspect; `130` is
  the code the binary sets when a prompt is cancelled

#### Scenario: Open's spawn environment

- **WHEN** `cospec workset open` hands over the terminal
- **THEN** it threads neither `--json` nor `--no-color` and spawns with
  `OPENSPEC_TELEMETRY=0` and `OPENSPEC_NO_COMPLETIONS=1`; the class's other
  members are the interactive `cospec config` subcommands, specified by the
  config passthrough capability

#### Scenario: Every handover pre-validates

- **WHEN** a terminal-handover member is invoked
- **THEN** its argv is parsed against the command table and a refusal commander
  would raise is answered on cospec's streams exactly as the binary answers it;
  under `--json` the call is never handed over (`workset open` relays the
  binary's `workset_open_json_unsupported` document from a piped call); and a
  `--cwd` that is not a directory gets the resolver's `directory not found`
  refusal before anything spawns

#### Scenario: A child that cannot be interactive runs piped

- **WHEN** the child could not be interactive by the binary's own test (for
  `workset open`: no TTY on stdin, `CI` set, or `OPEN_SPEC_INTERACTIVE=0`)
- **THEN** the call runs piped and its answer is relayed through the allowlist

#### Scenario: Open checks the saved worksets first

- **WHEN** `cospec workset open` names an unsaved workset, or one none of whose
  member folders exists, per a read-only `workset list --json`
- **THEN** it answers through the piped call, which the binary refuses before
  launching anything

### Requirement: Schema and template inspection are read-only passthroughs

`cospec schemas` and `cospec templates` SHALL be read-only passthroughs listing
resolvable schemas and per-artifact template paths, `--json` giving exactly one
JSON document. `cospec schema which` and `cospec schema validate` SHALL be
read-only passthroughs forwarding `--json`/`--all`/`--verbose`.
`cospec schema fork` and `cospec schema init` SHALL NOT be wired to the binary:
either SHALL print guidance toward cospec's canon-managed 11-schema workflow and
exit 1.

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

`cospec instructions [artifact]` SHALL use the shared disciplined-passthrough
runner (exit allow-list, stdout deny-list, exit normalisation, one `--json`
document), forwarding every flag the table marks handled, `--change` and
`--schema` included. `instructions apply --change <id>` SHALL always be cospec's
`apply` gate, never the binary's ungated answer. `archive` SHALL be advertised
and pass through read-only, never aliased to `cospec archive`.

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

#### Scenario: Missing argument answers are the binary's

- **WHEN** `cospec instructions` runs with no `--change` or no artifact, or
  `instructions apply` runs with no `--change`
- **THEN** cospec adds no refusal of its own and relays the binary's
  `Missing required option --change. Available changes: …` or
  `Missing required argument <artifact>. Valid artifacts: …`, so a `--json`
  caller gets exactly one document on every path past the parse

#### Scenario: The apply gate answers for any id

- **WHEN** `instructions apply --change <id>` runs for any id and working
  directory
- **THEN** `apply`'s own refusals (no `openspec/` directory, an unknown change,
  an id outside cospec's change-id grammar) answer for it

#### Scenario: Schema override on apply is refused with a document

- **WHEN** `--schema` is given with `instructions apply --change <id>`
- **THEN** it is refused before the gate, exit 1, on stderr or as one
  `{status: [{severity, code: "schema_not_applicable", message}]}` document
  under `--json`, because the binary would answer from that schema's apply
  requirements while the gate enforces the change's own

#### Scenario: Only binary-written command fields are respelled

- **WHEN** any other artifact's instructions are relayed
- **THEN** cospec calls the binary with `--json` and builds its answer from that
  document, respelling through the shared structural helper only each
  `references[].fetch` and `references[].status[].fix`, each only where its
  whole value is an allowlisted remedy, the names in it re-emitted unread; and
  relays `context`, `rules`, dependencies, paths, store ids and spec summaries
  as written

#### Scenario: Built-in schema lines are respelled, project schemas are not

- **WHEN** the change's schema resolves from the pinned package (upstream's
  built-in `spec-driven`)
- **THEN** each `instruction` and `template` line naming a bare
  `openspec <command>`, matched as a whole line against the pinned schema's
  text, is spelled through cospec; a schema resolved from the project or the
  user's data directory stays verbatim

#### Scenario: Output is rendered from the rewritten document

- **WHEN** the instructions call succeeds
- **THEN** a `--json` caller gets the rewritten document and a human caller gets
  text from a port of the binary's instruction printer, byte-identical to the
  binary's stdout wherever no field was rewritten

#### Scenario: Failures come from the binary's failure document

- **WHEN** the wrapped instructions call fails
- **THEN** the answer is built from the binary's `--json` failure document, its
  `status[].message` and `status[].fix` each rewritten only where its whole
  value is one allowlisted remedy, re-printed for `--json` or rendered as the
  binary renders it (`✖ Error:` and its `Fix:` line), with the binary's exit
  code and every listed change name as written

#### Scenario: Archive instructions are not the archive command

- **WHEN** `cospec instructions archive` runs
- **THEN** it passes through read-only, because the wrapped
  `instructions archive` neither gates nor moves anything

### Requirement: Relayed wrapped guidance never instructs bare openspec

Guidance cospec relays from the wrapped binary (a blocked-apply remedy, an apply
warning, any instructional string it re-emits rather than authors) SHALL NOT
name a bare `openspec` command: cospec SHALL rewrite the command name to its own
on every relay path, text and `--json` alike. The rewrite SHALL be anchored to a
backtick-delimited span whose first word is the binary's name, never a
whole-string substitution, and SHALL apply only to verbs cospec wraps, relaying
other verbs unchanged.

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

#### Scenario: Why the rewrite is span-anchored

- **WHEN** warning text embeds an absolute metadata path ending
  `.openspec.yaml`, or upstream prose names the product
- **THEN** both survive, because only a command span is rewritten; a token-level
  substitution would corrupt them, and an agent following a bare `openspec`
  instruction would bypass every cospec gate

#### Scenario: The guard covers every relay path

- **WHEN** a relay is reached from the legacy apply path that runs no cospec
  gate, from a change grandfathered to an earlier schema version that clears
  cospec's gate while the binary still reports it blocked, or from a change
  whose tracked task file exists but holds no task
- **THEN** the relayed guidance still names cospec, not bare `openspec`

## ADDED Requirements

### Requirement: View dashboard shows workflow and gate state

`cospec view` SHALL list only active changes in its main section and archived
changes in a separate section. Each active change SHALL show its schema and
which artifacts are done, ready, blocked, or skipped, plus cospec's gate state,
verification-ledger progress, and archive readiness. Progress bars SHALL align
for names up to 48 characters.

#### Scenario: Archived changes kept out of the way

- **WHEN** a project has 3 active and 40 archived changes
- **THEN** the active section lists 3 changes and the archived section is shown
  separately

#### Scenario: Workflow load failure

- **WHEN** a change's schema cannot be loaded
- **THEN** that change still shows task progress and names the load failure

#### Scenario: Gate state column

- **WHEN** an active change has an unshipped `Blocked by` entry
- **THEN** its row shows `blocked` and `archiveReady` is false

### Requirement: Show JSON names requirements and scenarios

`cospec show --json` SHALL include each requirement's and scenario's `name`,
matching the header names archive uses.

#### Scenario: Cite without reparsing

- **WHEN** `cospec show <capability> --json` is read
- **THEN** each requirement object carries `name` equal to its
  `### Requirement:` header text
