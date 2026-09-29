# Proposal

## Why

`cospec list`, `cospec status` and `cospec validate` are cospec's own
implementations, and they have drifted from what the wrapped binary answers for
the same invocation, so a script or agent that swaps `openspec` for `cospec`
loses flags, JSON keys and diagnostics it relied on. Each gap below was probed
against the pinned binary run under Bun in a sandboxed HOME:

- **Missing flags.** `list --sort <recent|name>`, `status --schema <name>`,
  `validate --type <change|spec>`, `validate --report <full|findings>` and
  `validate --concurrency <n>` are refused as pending. `__complete` serves
  `changes`, `specs` and `types`, but not upstream's `schemas` and
  `archived-changes` sources.
- **Missing JSON keys.** cospec's `--json` documents lack upstream's `root`,
  list's `changes[].{name, completedTasks, totalTasks, lastModified, status}`,
  status's `changeName`, `schemaName`, `planningHome`, `changeRoot`,
  `artifactPaths`, `isPlanningComplete`, `isComplete`, `applyRequires`,
  `nextSteps`, `actionContext` and per-artifact
  `outputPath`/`status`/`requires`, and validate's `items[].durationMs` and
  `summary.{totals, byType}`.
- **No next step mid-build.** `status` prints a next command only for a change
  with no artifacts yet. The binary prints `Next: …` for every change that has
  one.
- **Namespace folders.** A folder under `openspec/changes/` that only wraps
  nested change directories (`changes/mobile/refresh-token/`) is reported by
  cospec as an empty change: `status --change mobile` says "in progress — no
  artifacts yet" and exits 0, `validate mobile` reports a missing
  `.openspec.yaml`. The binary names the folder for what it is ("is not a
  change: it is a folder wrapping …") on status, list and validate.
- **Schemas cospec doesn't type.** For a forked or `spec-driven` change,
  `status --json` returns a three-key `{change, type, legacy}` stub, and
  `status --all` tells the reader to go run another command. For a schema that
  resolves nowhere, `status --json` exits 0 while the binary (and cospec's own
  text mode) exits 1. A change directory with no `.openspec.yaml` is classified
  as legacy, where the binary resolves the root's `config.yaml` default schema.
- **Item resolution in validate.** `validate <name>` tries change then spec and
  never notices a name that is both, has no `--type`, prints a bare unknown-item
  line with no suggestion, and lets the name win over `--all`/`--changes`/
  `--specs`, where the binary runs the bulk scope.
- **Crashes instead of answers.** An unreadable artifact makes `validate` throw.
  An unreadable `openspec/changes/archive/` makes `list` and `status` crash with
  no JSON document, although the binary never reads it there. An unreadable
  `tasks.md` crashes `list`, where the binary answers with a `list_error`
  document. `apply <unknown> --json` prints plain stderr and no document. A raw
  resolver failure under `--json` carries the generic `store_error` code where
  the binary reports a per-command code and payload.
- **Relays and lookups.** `validate` relays the binary's issue text without
  respelling its `openspec …` remedies. cospec's schema classification looks for
  user schemas under `~/.config`, a directory the binary never reads.
- **A slow dedupe pattern.** The `archive/target-invalid` entry in
  `DUPLICATE_CLASSES` no longer matches a quoted requirement header (so one
  defect is reported twice), and its guard test would not fail on the old
  exponential pattern.

## What Changes

- **Nested-change detector** (`core/change.ts`). A port of the binary's
  detector: a directory under `changes/` is a namespace folder when it carries
  no change-root marker (`.openspec.yaml`, `proposal.md`, `tasks.md`,
  `design.md`), no file anywhere under `specs/`, no output of the schema it
  resolves to, and no file of its own, and at least one subdirectory within
  three levels does look like a change. `archive` and dot-directories are never
  candidates. The new `meta/nested-change` ERROR carries the binary's
  explanation verbatim.
- **`status`.**
  - Every entry that has a status carries `next`, and the human output prints a
    `Next:` line, both from one function: the first ready artifact the change
    requires, else the first ready artifact, else `cospec apply <id>` once every
    required artifact is done. The empty-change `next` keeps its spelling.
  - `--json` adds every key the binary's own `status --json` document carries,
    from one delegated call per invocation. `nextSteps` is the binary's own
    value with its commands spelled `cospec`.
  - `--schema <name>` is accepted with the binary's meaning, a schema override
    (not a filter). An unknown name gets the binary's refusal.
  - A change whose schema cospec doesn't type (forked, `spec-driven`, or
    resolving nowhere) is answered from the binary's `status --json` document:
    rendered as the binary renders it in text, merged into cospec's
    `{change, type, legacy}` keys under `--json`, with the binary's exit code.
  - A change directory without `.openspec.yaml` resolves its schema the way the
    binary does, from `config.yaml` and else `spec-driven`, grandfathered at
    `schemaVersion` 1.
  - A namespace folder is refused (`--change`) or reported as a failure entry
    (`--all`), with exit 1, as the binary does.
  - An unreadable archive index no longer crashes: the gate is computed from an
    empty index and a warning names the directory. Any other read failure is a
    `change_error` document.
- **`list`.**
  - `--sort <recent|name>`, default `recent`. An unknown value means `recent`,
    as in the binary.
  - Rows carry the binary's own entry keys and `nested`, and the document
    carries `root` and `warnings`, all from one delegated `openspec list --json`
    call. cospec's own columns stay exactly as they are.
  - A namespace folder's row reads `not a change` and its `state` is
    `not-a-change`, with the binary's warning after the table.
  - `list --specs --json` gains `root`.
  - An unreadable archive lists normally, with a warning. A read failure the
    binary refuses is relayed as the binary's `list_error` document, and a
    failure only cospec's columns hit becomes a per-row `error`.
- **`validate`.**
  - `--type change|spec` forces the kind, and an unrecognised value is ignored,
    as the binary ignores it. A name that matches both a change and a spec is
    refused with the binary's `ambiguous_item` message and fix. An unknown name
    gets the binary's `unknown_item` message with its nearest matches, and a
    path-shaped name the binary's `invalid_item` refusal.
  - `--all`, `--changes` or `--specs` beside a name runs the bulk scope and
    ignores the name.
  - `--report full|findings` gets the binary's four request-validation refusals
    (`invalid_validation_report_request`), checked before the root resolves.
    `findings` emits the binary's findings document inside cospec's envelope,
    and its exit code is always `full`'s.
  - `--concurrency <n>` bounds the change validations that run at once, falling
    back to `OPENSPEC_CONCURRENCY` and then 6. A value that isn't a positive
    integer is ignored, as in the binary.
  - `--json` adds `root`, `items[].durationMs` and `summary.{totals, byType}`.
  - An unreadable artifact is a `meta/unreadable-artifact` ERROR, and a forced
    `--type` naming nothing on disk is a `meta/item-missing` ERROR.
  - Delegated issue text and the `--archived` fallback relay are spelled through
    cospec's remedy allowlist.
  - The `archive/target-invalid` dedupe matches a quoted header in linear time.
- **`__complete`** gains the `schemas` source (delegated to
  `openspec schemas --json`) and the `archived-changes` source (a walk of
  `changes/archive/`), and every source name is case-insensitive. The generated
  bash, zsh and fish scripts complete `--schema` values and the
  `schema which|validate|fork` positionals from `schemas`.
- **`apply`**: every early exit under `--json` (no root, unknown change, a
  failed wrapped call) is one `{status: [{severity, code, message, fix?}]}`
  document, exit 1.
- **Per-command resolver failures.** Under `--json`, a raw resolver failure
  carries the binary's per-command code (`list_error`, `change_error`,
  `validate_error`) and payload (`{changes: [], root: null}` for list and
  `status --all`, `{specs: [], root: null}` for `list --specs`).
- **Schema classification** reads user schemas from the directory the binary
  reads: `$XDG_DATA_HOME/openspec/schemas`, else `%LOCALAPPDATA%` on Windows,
  else `~/.local/share/openspec/schemas`.
- **JSON additivity.** Every upstream key is added without removing a cospec key
  or changing a cospec value, and every cospec envelope keeps `version: 1`. A
  contract key oracle runs each command against the pinned binary and fails on a
  missing upstream key, on an upstream value cospec reports differently, and on
  any key both tools emit with different values, outside a named collision list:
  `version`, and validate's `items[].type`, which cospec keeps as the change's
  schema (upstream's `change|spec` is cospec's `kind`). The `root` of the
  `status` documents becomes upstream's `{path, source}` object. cospec added
  that key to mirror the binary's key, but gave it the wrong value shape.
- **Docs.** `docs/validation.md` gains the standing rule for gate-rule views,
  and the enumeration test's `deltas/scenario-depth` exception cites a
  differential fixture that proves it. The archived `validation-parity` record's
  unticked task 7.2 is ticked, with a note on how that archive ran.
- **BREAKING:**
  - `cospec list` now orders by most recent change first. Pass `--sort name` for
    the old order.
  - `cospec list` outside an OpenSpec root answers OpenSpec's own
    `no_openspec_root` refusal, exit 1, where it printed `No active changes.`
  - `cospec validate <name> --all|--changes|--specs` validates the bulk scope,
    not the one item.
  - An ambiguous `validate` name is refused, and an unknown one prints the
    binary's message.
  - A namespace folder makes `status --change` and `status --all` exit 1 and
    `validate` fail.
  - `status --json` on a schema cospec doesn't type exits 1 when the binary
    does.
  - `status` types a change directory without `.openspec.yaml` by `config.yaml`.
    `validate`, `apply` and `archive` still refuse it.
  - The `root` key of the `status --all` and no-active-changes documents is an
    object, not a path string.

## Capabilities

### New Capabilities

- `nested-change-detection`: how a namespace folder under `openspec/changes/` is
  recognised and reported by status, list and validate.
- `json-document-parity`: upstream keys are added to cospec's JSON documents
  without changing cospec's own, checked by a key oracle, and every `--json`
  failure (resolver, apply early exit, list-time read) is one document.

### Modified Capabilities

- `change-progress-reporting`: status gains `--schema`, `next` on every entry,
  delegation for schemas cospec doesn't type, and the binary's keys.
- `openspec-list-validate-extensions`: list gains `--sort` and the binary's
  keys; validate gains `--type`, `--report`, `--concurrency`, upstream's item
  resolution and bulk-flag precedence, and unreadable-artifact ERRORs.
- `cospec-shell-completion`: two more dynamic sources, case-insensitive source
  names, and `schemas` wired into the generated scripts.
- `schema-customization`: user-level schemas are found where the binary keeps
  them.
- `spec-parsing-and-discovery`: the delegated-duplicate match is linear in the
  message and covers quoted headers.

## Impact

- `apps/cli/src/core/change.ts` (detector, schema classification, dot-directory
  exclusion), `apps/cli/src/core/rules/meta.ts` (`meta/nested-change`,
  `meta/unreadable-artifact`, `meta/item-missing`),
  `apps/cli/src/core/change-metadata.ts` and `apps/cli/src/commands/new.ts`
  (share the one user-schema directory helper).
- `apps/cli/src/commands/status.ts`, `apps/cli/src/core/upstream-keys.ts` (new:
  the additive merge), `apps/cli/src/commands/list.ts`,
  `apps/cli/src/commands/validate.ts`, `apps/cli/src/core/report.ts`,
  `apps/cli/src/commands/complete.ts`,
  `apps/cli/src/core/completions/{spec,bash,zsh,fish}.ts`,
  `apps/cli/src/commands/apply.ts`.
- `apps/cli/src/core/command-table.ts` (five flags and two `__complete` values
  move from pending to handled) and `apps/cli/test/contract/parity-pending.yaml`
  (all seven `cli-surface-parity` entries removed).
- Tests: `apps/cli/test/contract/cli-surface.test.ts` (new: flag and output
  differentials, the nested-change fixture on status/list/validate, the key
  oracle), `apps/cli/test/contract/validation-parity.test.ts` (the quoted-header
  dedupe row and the scenario-depth proving fixture),
  `apps/cli/test/unit/rules/views.test.ts` (the exception's citation),
  `apps/cli/test/unit/commands/validate.test.ts` (the ReDoS guard), unit tests
  for the detector, the next-step decision, the concurrency pool, the findings
  projection and every `apply` early exit, and
  `apps/cli/test/integration/completion.test.ts`.
- Docs: `apps/docs/reference/commands.md`,
  `apps/docs/reference/validation-rules.md`,
  `apps/docs/concepts/how-it-relates-to-openspec.md` (its namespace-folder
  sentence), `docs/architecture.md`, `docs/validation.md`, `.agents/shared.md`
  (the additive-JSON discipline, synced to `CLAUDE.md`/`AGENTS.md`), and the
  archived `openspec/changes/archive/2026-09-28-validation-parity/tasks.md`.
- JSON: keys added on list, list --specs, status, validate and apply failure
  paths. Rule ids gain `meta/nested-change`, `meta/unreadable-artifact` and
  `meta/item-missing`. Exit codes change only where BREAKING says.
- `status --json` and `list` each make one wrapped call per invocation. Human
  `status` on a cospec-typed change still makes none.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
