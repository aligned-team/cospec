# Proposal

## Why

cospec bills itself as a drop-in superset of OpenSpec, but it pins
`@fission-ai/openspec` at 1.13.1 while upstream has shipped 1.13.2 through
1.15.0, adding commands (`version`, `list --archived`/`--all`,
`update --dry-run`), ten tool targets, a workflow-aware `view` and a run of
validation and archive changes. An OpenSpec 1.15 user who switches loses
reachable surface, which breaks the parity promise.

Several moves are gate-parity issues: 1.14.1 warns on over-long requirements and
1.14.0 on unknown `.openspec.yaml` keys (exempting `x-` keys). If cospec's
parsers disagree with the binary, `validate --strict`, `apply` and `archive`
reach verdicts the delegated archive would not, a false PASS or BLOCK. The
reachability test fails a pin bump until every new surface resolves, so the bump
and the parity work land together.

cospec should also exceed upstream where it owns the facts: commit type, gate
state, verification-ledger progress, archive readiness, and the embedded
OpenSpec version.

## What Changes

- **Pin bump** — `@fission-ai/openspec` 1.13.1 → 1.15.0 in `package.json`,
  `mise.toml`, `EXPECTED_OPENSPEC_VERSION`, and the vendored embedded bundle.
  The contract, reachability, remedy-enumeration, key-oracle and
  optional-workflow differential suites are re-probed against 1.15.0. The
  accepted range stays `>=1.0.0 <2.0.0`.
- **`cospec version [--check] [--json]`** — new command. Reports cospec's
  version, install type (npm global, npx/bunx, standalone binary, mise, source),
  and the wrapped OpenSpec version and how it was resolved (embedded vs
  package). `--check` queries the latest cospec release. _Exceeds upstream:_ it
  reports both tools in one document and flags a wrapped binary outside the
  accepted range.
- **`cospec list --archived` / `--all`** — browse archived changes with
  upstream's sort and JSON keys. _Exceeds:_ each row carries its commit type and
  archive date, and `--json` documents stay additive.
- **`cospec view` dashboard** — active changes only; archived changes in their
  own section; per-change schema and artifact state (done / ready / blocked /
  skipped); progress bars aligned for names up to 48 characters. _Exceeds:_ it
  adds cospec's gate state (clear / blocked / soft-blocked), verification-ledger
  progress, and `archiveReady` per change.
- **`cospec update --dry-run [--json]`** — reports every managed file an update
  would add, change, or delete, and writes nothing. _Exceeds:_ each entry names
  its harness row and the reason (stale stamp, canon drift, removed workflow).
- **Ten new harness targets** as `HARNESS_TABLE` rows: Code Studio
  (`codestudio`), DeepSeek Harness (`dsh`, skills-only), GigaCode, AtomCode
  (`args: optional|none` frontmatter), GSD, Amp (shared `.agents/skills`),
  EasyCode (TOML commands), Veai, Grok Build (skills-only), and Warp (each
  skills-only exactly when the 1.15.0 dist has no command adapter for it). The
  Kilo Code commands directory moves from `.kilocode/workflows/` to
  `.kilo/command/` with a legacy cleanup that matches files by name only. `bob`
  displays as "IBM Bob".
- **Validation parity** — a requirement description over 500 characters is a
  WARNING, and ADDED and MODIFIED requirements in a change are covered too. Text
  that archive would drop from a delta spec is a WARNING: a foreign `## `
  section, a preamble, or prose before the first requirement.
  `specs/purpose-tbd` follows upstream's case rule, so "Todo el…" passes. The
  MODIFIED scenario-loss message names counts and up to three introduced
  scenarios. A non-string `rules:` item is reported by index.
- **Change metadata** — keys starting with a lowercase `x-` are user extension
  metadata. Every other unrecognized `.openspec.yaml` key is named by `status`,
  `validate`, and `archive`, and fails `validate --strict`. The legacy
  `schemaVersion` stamp stays a known key, so a grandfathered change never trips
  the rule, and the binary's own warning about it is dropped from relays.
- **Task tracking parity** — post-archive steps go in a plain-bullet
  `## Workflow follow-up` section that no gate counts (counts stay equal to the
  binary's), and the archive task gate reads every file the schema tracks
  instead of a fixed `tasks.md`. `cospec apply --json` relays each task's
  `sourcePath` and `line`. Once every tracked task is checked, apply's next step
  is to verify the change (the verify workflow, spelled per harness, e.g.
  `/cospec:verify`), not to archive it.
- **Archive and sync robustness** — symlinked `openspec/`, `changes/`, `specs/`
  and spec files inside the project are accepted, and a link that resolves
  outside the project is still refused. `sync-specs` preserves a spec's existing
  line endings. `archive --json` relays `archive_retirement_cleanup_failed`.
  `generates`/`apply.tracks` globs that nest past 16 levels or expand past 1024
  paths are rejected with a clear error.
- **Store edit scope** — `cospec status --json`'s
  `actionContext.allowedEditRoots` lists the declaring project alongside a
  store, and `cospec init` works at the root of a store-only repository without
  touching its pointer, matching 1.14.0.
- **`show --json`** — each requirement and scenario carries its `name`.
- **Feedback** — a new `.github/ISSUE_TEMPLATE/bug_report.yml` form;
  `cospec feedback` bodies use its headings, and the manual-submission link
  opens it prefilled with message, version, and environment.
- **Legacy cleanup line endings** — removing a legacy OpenSpec marker block
  keeps the file's dominant line ending (1.13.2).
- **Robust terminals** — no spinner or progress redraw runs on a zero-width TTY
  or under `CI` / `OPEN_SPEC_INTERACTIVE=0`, so `cospec validate --all` cannot
  hang under a hook runner.
- **Canon workflow ports** from 1.13.2–1.15.0, each recorded with its upstream
  template and pin:
  - verify: REMOVED requirements match their baseline by exact name; skipped
    checks are never reported as passing; spec and design inputs are found by
    output path.
  - explore: never offers files a custom schema lacks.
  - update: states the glob new-file exception.
  - specs: written as drafted; continue fills capabilities still missing specs.
  - tasks: each task group lands its own tests and docs.
  - ff: asks only when context is critically unclear; onboard asks for approval.
  - archive: stops on a blocking sync.
  - guidance: durable, behaviour-based capability names; `project.md` →
    `config.yaml` migration help; documentation kept out of `config.yaml`
    context; a backup warning before legacy cleanup.
- **Harness and spec gaps closed** — the shared `.agents/skills` requirement
  names every row on that root (`amp` and `gsd` included) and the writer order
  the code uses; delivery's `skills-invocable` rows are `codex` and `warp`;
  Continue's command `preamble` gets its own requirement; symlink discovery
  matches the in-project acceptance; and status's `next` names verification once
  every tracked task is checked.

### Split from #100

This change is one of five split out of PR #100. Its siblings are
`shorten-long-requirements` (every living requirement under 500 characters),
`change-stamp-x-prefix` (the `x-cospec-schema-version` stamp), both below this
one, and `standalone-install` (`cospec install`, the installers, Windows arm64
and Nix) above it, plus the independent `complete-startup-budget` (the
`__complete` startup budget). The upstream `install` command therefore stays
pending in `parity-pending.yaml`, owned by `standalone-install`, and
`cospec version --check` names no upgrade command for a standalone install until
that change lands.

## Capabilities

### New Capabilities

- `version-report`: `cospec version` — install-type and wrapped-binary
  reporting, `--check` update information, and the JSON document.

### Modified Capabilities

- `embedded-openspec`: pin moves to 1.15.0, with only `install` pending; the
  embedded bundle, contract suite, and glob port (now over
  `tinyglobby`/`picomatch`/`brace-expansion`) are re-probed.
- `change-metadata-keys`: `x-` extension keys accepted; other unknown keys
  reported and strict-failing.
- `change-progress-reporting`: binary-equal task counts with plain-bullet
  `## Workflow follow-up` steps, task `sourcePath`/`line`, the
  verify-before-archive next step (status's `next` included), and the
  schema-aware archive task gate.
- `openspec-list-validate-extensions`: `list --archived`/`--all`, requirement
  length and dropped-delta-text rules, the scenario-loss detail, the
  `rules-item-type` finding, and zero-width TTY safety.
- `openspec-read-passthroughs`: the workflow-aware `view` dashboard and named
  requirements/scenarios in `show --json` (MODIFIES the show/view passthrough
  requirement: `view` becomes native).
- `spec-parsing-and-discovery`: symlinked layouts (recursive discovery
  included), the brace-nesting / expansion guards, and the placeholder-Purpose
  case rule (MODIFIED).
- `archive-integrity`: line-ending preservation and the retirement-cleanup
  failure code.
- `store-awareness`: `allowedEditRoots` includes the declaring project; init
  works at a store-only repository root.
- `harness-workflows`: the ten new targets, the shared `.agents/skills` rows and
  writer order, the Continue command preamble, the Kilo path move (and the
  frontmatter-less command requirement's example path), `update --dry-run`,
  legacy marker removal line endings, and the 1.13.2–1.15.0 canon ports.
- `workflow-profiles`: `warp` joins `codex` as a `skills-invocable` row.
- `cospec-feedback`: bug-form body and prefilled bug-form link (MODIFIED).

## Impact

- `apps/cli/package.json`, `mise.toml`, `bun.lock`, `mise.lock`,
  `apps/cli/src/vendor/openspec.bundle.js.tpl` (regenerated through
  `mise run vendor:openspec`), and `EXPECTED_OPENSPEC_VERSION`.
- `apps/cli/src/core/command-table.ts`, `apps/cli/src/cli.ts` (`version` command
  module),
  `apps/cli/src/commands/{version,list,view,update,status,apply,archive,init,show,feedback}.ts`.
- `apps/cli/src/core/{change-metadata,tasks,glob,spec-paths,lines,remedies,upstream-keys,root}.ts`
  and `apps/cli/src/core/rules/{specs,deltas}.ts` (the two document rules
  registered in `rules/views.ts`);
  `apps/cli/src/harness/legacy-config-blocks.ts`.
- Glob devDependencies move from `fast-glob` to the `tinyglobby`/`picomatch`/
  `brace-expansion` versions the pin resolves; the CLAUDE.md dependency rule is
  updated to match.
- `apps/cli/src/harness/adapters.ts` (ten rows, Kilo path, IBM Bob) and the
  canon workflow bodies under `apps/cli/src/canon/`. Regenerated managed files
  follow from `mise run generate`.
- `apps/cli/test/contract/{parity-pending.yaml,remedy-sources.ts}`,
  `apps/cli/src/canon/parity/aliases.yaml`, plus new contract and integration
  tests for every command change. `parity-pending.yaml` keeps one entry,
  `install` (owner `standalone-install`), and `reachability.test.ts` gains that
  owner.
- New `.github/ISSUE_TEMPLATE/bug_report.yml`.
- `docs/` and `apps/docs/` pages that own the pin, the harness list, and the
  command reference; the `CLAUDE.md`/`AGENTS.md` shared block via
  `mise run agents:sync` (the pin moves to 1.15.0).
- No BREAKING changes. Two behaviour changes can surface new diagnostics on
  existing trees: unknown `.openspec.yaml` keys and requirements over 500
  characters now fail `validate --strict`, exactly as they do under OpenSpec
  1.15.0. Every `--json` document stays additive.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — prompts, tools, model routing, or agent output shape
