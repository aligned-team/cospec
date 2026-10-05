# Proposal

## Why

`cospec archive` and `/cospec:sync-specs` are the last two places where an
`openspec` invocation does something different under `cospec`, so the
swap-in-correctness release can't ship until they match. Each gap below was
probed against the pinned binary (1.13.1) run under Bun in a sandboxed HOME, and
on Linux in an `oven/bun:1.3.14` container where the answer depends on the OS:

- **`archive --no-validate` is refused as pending.** The binary skips its
  validation, prints a warning and archives. A script that passes the flag gets
  `'--no-validate' is not supported yet`, exit 1, from `cospec`.
- **No upstream keys in archive's JSON.** The binary answers
  `{archive: {change, archivedAs, path, specsUpdated, totals?, warnings?}, root}`
  on success and
  `{archive: null, root, status: [{severity, code, message, fix?}]}` on failure.
  cospec's success document has neither key. Its failure document is
  `{change, type, archived: false, reason, openspecExit}`, and only for a
  failure after delegation. Every gate refusal under `--json` (tasks,
  verification, scenario preservation, slot collision, validation, unknown
  change) prints stderr prose and no JSON document at all. With
  `openspec/changes/archive/` at mode 000, `archive <id> --json` crashes with a
  bare `EACCES` line. The binary answers one failure document there:
  `archive_path_outside_root` under Bun on macOS, `archive_error` naming `statx`
  under Bun on Linux.
- **Remedies aren't respelled.** When the wrapped archive fails, cospec relays
  its output with every `openspec …` remedy left bare. The allowlist entries for
  those sentences already exist in `core/remedies.ts`, but archive never calls
  them.
- **Skipped sync gets no line.** A change with no delta specs is folded into
  `Specs: skipped`, the same as `--skip-specs`, and nothing says no spec sync
  happened.
- **A namespace folder gets a validation report.** `cospec archive mobile` on a
  folder that wraps `mobile/refresh/` prints `validate`'s report. The binary
  refuses it up front with `archive_change_is_namespace_folder` and a fix.
- **REMOVED on a new capability is falsely refused.**
  `archive/new-spec-non-added` refuses every REMOVED operation on a capability
  with no living spec. The binary ignores those with a warning. ADDED + REMOVED
  archives, and REMOVED-only under `retire_capabilities: true` archives as
  "already in sync". REMOVED-only without the marker is refused, but because the
  rebuilt spec has no requirements, not because of the REMOVED. The binary's
  `validate --strict` accepts all three.
- **No way to sync without archiving.** Upstream's `sync` workflow merges a
  change's delta specs into the main specs without archiving it. cospec's
  `sync-specs` workflow says there is "no supported mid-flight sync" and only
  previews.

## What Changes

- **`cospec archive --no-validate`** skips cospec's revalidation step and is
  forwarded to the wrapped `archive -y`, so the binary skips its own validation
  as an `openspec` user asked. The tasks gate,
  `archive/verification-incomplete`, `archive/scenario-preservation`, the
  namespace-folder refusal, the slot check and the on-disk verification still
  run, and a stderr banner says revalidation was skipped and which gates still
  ran. The pending entry leaves `parity-pending.yaml`.
- **One scenario-preservation helper.** The `archive/scenario-preservation` hard
  gate moves out of `commands/archive.ts` into a shared helper. It reads the
  verbatim view (fences masked, comments kept), as the archive does, and
  `archive` and `sync-specs` both call it.
- **Archive's JSON documents.**
  - Success adds
    `archive: {change, archivedAs, path, specsUpdated, totals?, warnings?}` and
    `root: {path, source, store_id?}`. `specsUpdated` and `totals` are the
    binary's applied values, read from its own `Totals:` and
    `Specs updated successfully.` / `Specs already in sync; no files changed.`
    lines. `path` is the canonical archive path. `warnings` is present only when
    the binary reported any. Every cospec key keeps its value.
  - Every refusal under `--json` is one document: `archive: null`, `root` (left
    out when no root resolved, as the binary leaves it out),
    `status: [{severity, code, message, fix?}]`, and cospec's own
    `change`/`type`/`archived: false`/`reason`, exit 1. `code` is the binary's
    code wherever the binary refuses the same input: `archive_change_not_found`,
    `archive_change_name_invalid`, `archive_change_is_namespace_folder`,
    `archive_validation_failed`, `archive_tasks_incomplete`,
    `archive_target_exists`, `archive_spec_update_failed` (scenario
    preservation), `archive_path_outside_root`, and `archive_error`.
    `archive/verification-incomplete` has no upstream counterpart and carries
    the cospec-only code `archive_verification_incomplete`. `fix` is cospec's
    spelling of the remedy cospec accepts.
  - An unreadable `openspec/changes/archive/` answers the binary's code for the
    runtime it runs on (`archive_path_outside_root` or `archive_error`). In text
    mode it's one stderr line, never a crash.
- **Relayed remedies.** Every relay of the wrapped archive's output (the aborted
  and half-state reports, the relayed warnings, the failure document's
  `message`/`fix`) is spelled through `respellRemedies`.
- **The Specs line.** `Specs:` says which reason skipped the sync:
  `--skip-specs`, a schema with no specs artifact, or no delta specs. JSON gains
  `specsSkipReason`, and the existing `specs` value doesn't change. A change
  whose deltas were already synced reports `already in sync` instead of
  `applied`.
- **Namespace folders.** `cospec archive <folder>` is refused before
  revalidation, using R6's `findNestedChangesIn`, with the binary's message and
  fix, on stderr or as the failure document, exit 1.
- **Early-synced changes archive as no-op merges.** The post-merge spot-check
  already accepts identical ADDED, absent REMOVED, applied RENAMED and identical
  MODIFIED operations. A capability that was retired early now archives too.
- **`archive/new-spec-non-added`** fires only on MODIFIED and RENAMED. REMOVED
  on a capability with no living spec is the binary's "nothing to remove" no-op.
  A REMOVED-only delta without `retire_capabilities` is still refused, by
  `archive/rebuilt-spec-invalid`, because the rebuilt spec has no requirements.
- **New `cospec sync-specs <change>`** merges a change's delta specs into the
  main specs without archiving it, in five steps:
  1. Run archive's pre-merge checks: archive-precondition validation, then the
     scenario-preservation helper.
  2. Run the pinned binary's own `archive -y` on a scratch copy of what the
     binary reads (`config.yaml`/`config.yml`, `schemas/`, `specs/`, the change,
     an empty `changes/archive/`) in a fresh OS temp directory.
  3. Copy back only the main-spec files that run created, changed or deleted.
  4. Verify them on disk.
  5. Leave the change active.

  The main specs come out byte-for-byte as `cospec archive` would write them, so
  a later archive is the binary's early-sync no-op. A failed scratch run leaves
  no `.openspec-archive.lock` and no file in the real tree. `--json` and
  `--store` are accepted.

- **`/cospec:sync-specs`** does upstream's `sync`: it previews the merge, then
  runs `cospec sync-specs <change>`. The "no mid-flight sync" text is removed.
  `/cospec:archive` notes that a change synced early archives as a no-op merge.
  The workflow's description changes, so its skill trigger text changes.
- **BREAKING:**
  - `cospec archive --json` refusals now print a JSON document on stdout. They
    used to print only stderr prose (gate refusals, unknown change, slot
    collision). The validation refusal's document is no longer `validate`'s bare
    report: it keeps that report's keys and adds `archive`, `root`, `status`,
    `change`, `type`, `archived` and `reason`.
  - `cospec archive <namespace folder>` reports
    `archive_change_is_namespace_folder` (the binary's message and fix) instead
    of a `meta/nested-change` validation report. A script grepping the validate
    output for this case needs the new text.
  - `cospec archive --no-validate` archives where it exited 1 as pending, and
    skips the binary's validation too (so the binary also retires no capability,
    as it does under the flag).
  - The `Specs:` line of a no-delta change reads `none` and names the reason,
    where it read `skipped`.
  - `/cospec:sync-specs` writes main specs. It used to only preview.
  - `cospec validate` stops reporting `archive/new-spec-non-added` on REMOVED
    operations.

## Capabilities

### New Capabilities

- `spec-sync`: `cospec sync-specs` merges a change's delta specs into the main
  specs early, through the binary's own archive on a scratch copy, so the result
  is byte-identical to archive's and a later archive is a no-op merge.

### Modified Capabilities

- `archive-integrity`: `--no-validate`, the shared scenario-preservation helper
  on the verbatim view, the skip-reason line, early-synced no-op archives
  including a retired capability, respelled relays, and REMOVED on a new
  capability.
- `json-document-parity`: archive's success and failure documents carry the
  binary's keys, and every archive refusal under `--json` is one document.
- `nested-change-detection`: archive refuses a namespace folder as the binary
  does.
- `harness-workflows`: the `sync-specs` workflow runs `cospec sync-specs`, and
  the `archive` workflow names the early-sync no-op.

## Impact

- `apps/cli/src/commands/archive.ts` (T1), `apps/cli/src/core/scenario-gate.ts`
  (new shared helper, T1), `apps/cli/src/core/rules/archive.ts` (T2),
  `apps/cli/src/commands/sync-specs.ts` (new, T3),
  `apps/cli/src/core/command-table.ts` (the `sync-specs` row, and
  `archive --no-validate` moving from pending to handled), `apps/cli/src/cli.ts`
  (the `sync-specs` dispatch entry),
  `apps/cli/test/contract/parity-pending.yaml` (the `archive --no-validate`
  entry removed).
- Canon: `apps/cli/src/canon/workflows/{sync-specs,archive}.md` and the
  `sync-specs` description in `harness.yaml`, plus the regenerated harness trees
  (`mise run generate`).
- Tests: `apps/cli/test/contract/archive-no-validate.test.ts` and
  `apps/cli/test/contract/sync-specs.test.ts` (new). These hold the gate
  fixtures, the verbatim-view differential fixtures, the archive key-oracle rows
  through the existing `support/key-oracle.ts`, and the sync fixtures. Plus unit
  tests for the helper, the scratch copy and copy-back, and the Totals-line
  parser.
- Docs: `apps/docs/concepts/apply-and-archive.md`, `docs/apply-archive.md`,
  `apps/docs/reference/commands.md`, `apps/docs/guide/harness-setup.md` (the
  `sync`↔`sync-specs` sentence), `apps/docs/reference/validation-rules.md` and
  `docs/validation.md` (the `archive/new-spec-non-added` trigger),
  `apps/docs/concepts/how-it-relates-to-openspec.md` where it names either fact,
  and `.agents/shared.md` (then `mise run agents:sync`).
- JSON: keys added to archive's documents, and a document on every archive
  refusal. The new command has its own document. Exit codes change only where
  BREAKING says.
- No new dependency. `sync-specs` makes one wrapped call, and `archive` makes no
  more calls than before.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [x] agent-behavior — prompts, tools, model routing, or agent output shape
