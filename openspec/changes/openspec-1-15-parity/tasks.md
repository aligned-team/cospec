# Tasks

## 1. Pin bump

- [ ] 1.1 Move `@fission-ai/openspec` to 1.15.0 in `apps/cli/package.json` and
      `mise.toml`, regenerate `bun.lock`/`mise.lock`, update
      `EXPECTED_OPENSPEC_VERSION`, and run `mise run vendor:openspec`; verify
      with `mise run vendor:openspec:check`
- [ ] 1.2 Register every surface the reachability test newly reports in
      `parity-pending.yaml` with `owner: openspec-1-15-parity`, and classify
      each new remedy sentence in `remedies.ts`/`remedy-sources.ts`; verify
      `mise run test:contract` passes
- [ ] 1.3 Update the pin in `.agents/shared.md`, `docs/`, and `apps/docs/` (the
      one page that owns it), then run `mise run agents:sync`; verify with
      `mise run agents:check` and `mise run docs:build`

## 2. Task-tracking and metadata parity

- [ ] 2.1 Port the `## Workflow follow-up` exclusion into `core/tasks.ts` with
      the differential fixture matrix; verify the differential test is green
- [ ] 2.2 Relay `tasks[].sourcePath`/`line` and the tasks-complete guidance in
      `cospec apply --json`, with the next step naming verify; verify with the
      key oracle and an integration test
- [ ] 2.3 Accept `x-` keys and add `change/unknown-metadata-key` in
      `core/change-metadata.ts`, surfaced by `status`, `validate` and `archive`;
      verify with unit and contract fixtures

## 3. Validation parity

- [ ] 3.1 Add `specs/requirement-too-long` (living specs and ADDED/MODIFIED) and
      `deltas/dropped-text`, registered in `rules/views.ts`; verify with
      `views.test.ts` and an equivalence test against the pinned binary
- [ ] 3.2 Port the placeholder-purpose case rule, the scenario-loss message
      detail, and `config/rules-item-type`; verify with unit fixtures and a
      contract run
- [ ] 3.3 Suppress redraw on zero-width TTY, `CI`, and
      `OPEN_SPEC_INTERACTIVE=0`, and propagate both to wrapped calls; verify
      with the `script -qec` integration test

## 4. Spec discovery and archive robustness

- [ ] 4.1 Accept in-project symlinked layouts and refuse escaping links in
      `core/spec-paths.ts`/`change.ts`; verify with integration fixtures for
      `list --specs`, `show`, `validate`, `sync-specs`, and `archive`
- [ ] 4.2 Bound glob nesting (16) and expansion (1024) in `core/glob.ts`; verify
      with unit tests for both limits
- [ ] 4.3 Preserve dominant line endings in sync-specs and archive
      post-conditions, and relay `archive_retirement_cleanup_failed`; verify
      with CRLF and cleanup-failure integration tests
- [ ] 4.4 Include the declaring project in store `allowedEditRoots`; verify with
      a store-backed integration test

## 5. Commands

- [ ] 5.1 Add `cospec version [--check] [--json]` (`commands/version.ts`, table
      row, completion, docs); verify with the key oracle, online/offline e2e
      tests, and remove its pending entry
- [ ] 5.2 Add `list --archived`/`--all` with `type`/`archivedOn`; verify with
      the key oracle and sort tests, and remove the pending entries
- [ ] 5.3 Rebuild `cospec view` as a native dashboard (active vs archived,
      artifact states, gate, ledger, archive-ready, 48-column alignment); verify
      with integration snapshots and remove the pending entry
- [ ] 5.4 Add `name` to `show --json` requirements/scenarios; verify with the
      key oracle
- [ ] 5.5 Add `cospec update --dry-run [--json]` with per-file row and reason;
      verify that an e2e test leaves `git status` clean
- [ ] 5.6 Move `cospec feedback` to bug-form headings and a prefilled bug-form
      link; verify with unit tests over `manualUrl`/body composition

## 6. Harness targets and canon

- [ ] 6.1 Add `HARNESS_TABLE` rows for `codestudio`, `dsh`, `gigacode`,
      `atomcode`, `gsd`, `amp`, `easycode`, `veai`, `grok`, and `warp`, with the
      EasyCode TOML serializer and AtomCode `args:` dialect in `harness/`, and
      rename `bob` to "IBM Bob"; verify per-tool init integration tests and
      remove the pending tool entries
- [ ] 6.2 Move Kilo Code commands to `.kilo/command/` with a name-matched legacy
      cleanup; verify with the user-file-survives integration test
- [ ] 6.3 Port the 1.13.2–1.15.0 canon passages (verify, explore, update, specs,
      continue, tasks, ff, onboard, archive, proposal guidance, `project.md`
      migration, legacy-cleanup backup warning) with port-ledger records, then
      run `mise run generate`; verify the port-ledger test and
      `mise run generate:check`

## 7. Completion

- [ ] 7.1 Make zsh uninstall byte-faithful, leading blank lines included; verify
      with a round-trip unit test
- [ ] 7.2 Keep `__complete` lazy and telemetry-free, and add its timing to
      `bench:smoke`; verify with a unit test asserting the module set and with
      the bench output

## 8. Distribution

- [ ] 8.1 Add `scripts/install/install.sh` and `install.ps1` with checksum
      verification; verify with the alpine/ubuntu container e2e test and the
      corrupted-archive test
- [ ] 8.2 Add linux musl x64/arm64 targets, the alpine smoke job, and installer
      assets to `release.yml`; verify with a release dry run listing eight
      archives, `SHA256SUMS`, and both installers
- [ ] 8.3 Add `flake.nix` with `packages.default` and `overlays.default`; verify
      with `nix run .# -- --version`

## 9. Close-out

- [ ] 9.1 Confirm `parity-pending.yaml` is `[]`, update the docs-site parity and
      command pages, add release notes for the two strict-mode behaviour
      changes, and run `mise run check`; verify exit 0. The archive commit
      follows this one
