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
terminal- handover exec: it SHALL spawn `openspec workset open` with inherited
stdio and `shell: false`, and SHALL propagate the child process's exit code
unchanged, without emitting its own JSON — matching OpenSpec's own rejection of
`--json` for this subcommand.

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

`cospec instructions <artifact>`'s generic branch SHALL route through the same
disciplined-passthrough runner every other wrapped read surface uses, gaining
the exit-code allow-list, the stdout deny-list, exit-code normalisation, and the
guaranteed single-JSON-document invariant for `--json` callers. `archive` SHALL
be listed among the artifacts the command advertises and SHALL pass through
read-only — it SHALL NOT be aliased to `cospec archive`, because the wrapped
`instructions archive` neither gates nor moves anything. The cospec-native
`apply` branch SHALL be unchanged.

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
