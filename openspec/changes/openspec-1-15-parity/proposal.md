# Proposal

## Why

cospec bills itself as a drop-in superset of OpenSpec, but it pins
`@fission-ai/openspec` at 1.13.1 while upstream has shipped 1.13.2, 1.14.0
through 1.14.3, and 1.15.0. Those releases add whole commands (`version`,
`list --archived`/`--all`, `update --dry-run`), ten new tool targets, a
workflow-aware `view` dashboard, a single-file installer, and a run of
validation and archive behaviour changes. An OpenSpec 1.15 user who switches to
cospec today loses reachable surface, and that breaks the project's own parity
promise ("there is never a reason to call bare `openspec`").

Several of the upstream moves are gate-parity issues as well as missing
features. 1.14.1 stops counting a `## Workflow follow-up` section as tracked
tasks, makes an over-long requirement a strict-mode WARNING, and 1.14.0 warns on
unknown `.openspec.yaml` keys while exempting `x-` extension keys. If cospec's
own parsers disagree with the binary on any of these, `cospec validate --strict`
and `cospec apply`/`archive` reach different verdicts than the delegated
archive. That is the false-PASS / false-BLOCK shape CLAUDE.md treats as a
release blocker. The reachability test already makes a pin bump fail until every
new surface is resolved, so the bump and the parity work have to land together.

cospec should also exceed upstream where it owns the facts. Its `view`,
`version`, `list --archived` and `update --dry-run` can report what only cospec
knows: commit type, gate state, verification-ledger progress, archive readiness,
and the embedded OpenSpec version.

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
  EasyCode (TOML commands), Veai, Grok Build (skills-only), and Warp. The Kilo
  Code commands directory moves from `.kilocode/workflows/` to `.kilo/command/`
  with a legacy cleanup that matches files by name only. `bob` displays as "IBM
  Bob".
- **Validation parity** — a requirement description over 500 characters is a
  WARNING, and ADDED requirements in a change are covered too. Text that archive
  would drop from a delta spec is a WARNING: a foreign `## ` section, a
  preamble, or prose before the first requirement. `PURPOSE_IS_PLACEHOLDER`
  follows upstream's case rule, so "Todo el…" passes. The MODIFIED scenario-loss
  message names counts and up to three introduced scenarios. A non-string
  `rules:` item is reported by index.
- **Change metadata** — keys starting with a lowercase `x-` are user extension
  metadata. Every other unrecognized `.openspec.yaml` key is named by `status`,
  `validate`, and `archive`, and fails `validate --strict`.
- **Task tracking parity** — a `## Workflow follow-up` section in `tasks.md` is
  not tracked by cospec's apply/archive gates. `cospec apply --json` relays each
  task's `sourcePath` and `line`. Once every tracked task is checked, apply's
  next step is to verify the change (`/cospec:verify`), not to archive it.
- **Archive and sync robustness** — symlinked `openspec/`, `changes/`, `specs/`
  and spec files inside the project are accepted, and a link that resolves
  outside the project is still refused. `sync-specs` preserves a spec's existing
  line endings. `archive --json` relays `archive_retirement_cleanup_failed`.
  `generates`/`apply.tracks` globs that nest past 16 levels or expand past 1024
  paths are rejected with a clear error.
- **Store edit scope** — `cospec status --json`'s
  `actionContext.allowedEditRoots` lists the declaring project alongside a
  store, matching 1.14.0.
- **`show --json`** — each requirement and scenario carries its `name`.
- **Feedback** — `cospec feedback` bodies use cospec's bug-form headings, and
  the manual-submission link opens the bug form prefilled with message, version,
  and environment.
- **Completion** — `cospec completion uninstall zsh` returns `.zshrc` exactly as
  install found it, leading blank lines included. `cospec __complete` stays
  inside a startup budget enforced in CI.
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
- **Single-file install** — `install.sh` (macOS/Linux) and `install.ps1`
  (Windows) download the matching standalone binary from the GitHub release and
  verify it against `SHA256SUMS` before installing. Releases add Linux musl
  builds on x64 and arm64. A Nix flake exposes `overlays.default` and
  `packages.default`.

## Capabilities

### New Capabilities

- `version-report`: `cospec version` — install-type and wrapped-binary
  reporting, `--check` update information, and the JSON document.
- `standalone-install`: the checksum-verified `install.sh`/`install.ps1`
  installers, musl release targets, and the Nix flake overlay.

### Modified Capabilities

- `embedded-openspec`: pin moves to 1.15.0; the embedded bundle and contract
  suite are re-probed.
- `change-metadata-keys`: `x-` extension keys accepted; other unknown keys
  reported and strict-failing.
- `change-progress-reporting`: `## Workflow follow-up` exclusion, task
  `sourcePath`/`line`, and the verify-before-archive next step.
- `openspec-list-validate-extensions`: `list --archived`/`--all`, requirement
  length, dropped-delta-text and placeholder rules, the scenario-loss detail,
  and zero-width TTY safety.
- `openspec-read-passthroughs`: the workflow-aware `view` dashboard and named
  requirements/scenarios in `show --json`.
- `spec-parsing-and-discovery`: symlinked layouts and the brace-nesting /
  expansion guards.
- `archive-integrity`: line-ending preservation and the retirement-cleanup
  failure code.
- `store-awareness`: `allowedEditRoots` includes the declaring project.
- `harness-workflows`: the ten new targets, the Kilo path move,
  `update --dry-run`, and the 1.13.2–1.15.0 canon ports.
- `cospec-feedback`: bug-form body and prefilled bug-form link.
- `cospec-shell-completion`: zsh round-trip fidelity and the `__complete`
  startup budget.

## Impact

- `apps/cli/package.json`, `mise.toml`, `bun.lock`, `mise.lock`,
  `apps/cli/src/vendor/openspec.bundle.js.tpl` (regenerated through
  `mise run vendor:openspec`), and `EXPECTED_OPENSPEC_VERSION`.
- `apps/cli/src/core/command-table.ts`, `apps/cli/src/cli.ts` (`version` command
  module),
  `apps/cli/src/commands/{version,list,view,update,status,apply, show,feedback,complete}.ts`.
- `apps/cli/src/core/{change-metadata,tasks,glob,spec-paths,lines,remedies, upstream-keys}.ts`
  and `apps/cli/src/core/rules/{specs,deltas}.ts` (new rule IDs registered in
  `rules/views.ts`).
- `apps/cli/src/harness/adapters.ts` (ten rows, Kilo path, IBM Bob) and the
  canon workflow bodies under `apps/cli/src/canon/`. Regenerated managed files
  follow from `mise run generate`.
- `apps/cli/test/contract/{parity-pending.yaml,remedy-sources.ts}`,
  `apps/cli/src/canon/parity/aliases.yaml`, plus new contract and integration
  tests for every command change.
- `.github/workflows/release.yml` (musl targets, installer assets), new
  `scripts/install/install.sh` and `install.ps1`, and a new `flake.nix`.
- `docs/` and `apps/docs/` pages that own the pin, the harness list, and the
  command reference; the `CLAUDE.md`/`AGENTS.md` shared block via
  `mise run agents:sync` (the pin moves to 1.15.0).
- No BREAKING changes. Two behaviour changes can surface new diagnostics on
  existing trees: unknown `.openspec.yaml` keys and requirements over 500
  characters now fail `validate --strict`, exactly as they do under OpenSpec
  1.15.0. Every `--json` document stays additive.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [x] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [x] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — prompts, tools, model routing, or agent output shape
