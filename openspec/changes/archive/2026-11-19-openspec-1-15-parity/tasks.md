# Tasks

## 1. Pin bump

- [x] 1.1 Move `@fission-ai/openspec` to 1.15.0 in `apps/cli/package.json` and
      `mise.toml`, regenerate `bun.lock`/`mise.lock`, update
      `EXPECTED_OPENSPEC_VERSION`, and run `mise run vendor:openspec`; verify
      with `mise run vendor:openspec:check`
- [x] 1.2 Register every surface the reachability test newly reports in
      `parity-pending.yaml` with `owner: openspec-1-15-parity`, and classify
      each new remedy sentence in `remedies.ts`/`remedy-sources.ts` (the
      `install-standalone.js` and `version-check.js` lines with a reason naming
      `standalone-install`); verify `mise run test:contract` passes
- [x] 1.3 Move the glob devDependencies from `fast-glob` to the
      `tinyglobby`/`picomatch`/`brace-expansion` versions 1.15.0 resolves,
      re-port `core/glob.ts` over them, and update CLAUDE.md's dependency rule
      through `.agents/shared.md`; verify with `test/contract/glob.test.ts`
- [x] 1.4 Update the pin in `.agents/shared.md`, `docs/`, and `apps/docs/` (the
      one page that owns it), then run `mise run agents:sync`; verify with
      `mise run agents:check` and `mise run docs:build`

## 2. Task-tracking and metadata parity

- [x] 2.1 Keep cospec's task counts equal to the binary's (every checkbox
      counts; post-archive steps live in a plain-bullet `## Workflow follow-up`
      section per the tasks guidance); verify with the differential test
- [x] 2.2 Relay `tasks[].sourcePath`/`line` and the tasks-complete guidance in
      `cospec apply --json`, with the next step naming verify; verify with the
      key oracle and an integration test
- [x] 2.3 Make the archive task gate read every file `apply.tracks` resolves
      (the resolver `status`/`apply` use) instead of `tasks.md`; verify with an
      integration test where an unchecked task in a second tracked file blocks
      archive
- [x] 2.4 Accept `x-` keys and add `change/unknown-metadata-key` in
      `core/change-metadata.ts`, surfaced by `status`, `validate` and `archive`,
      counting `change-stamp-x-prefix`'s stamp and its legacy `schemaVersion` as
      known keys; verify with unit and contract fixtures and the legacy-stamp
      case in `test/integration/schema-versioning.test.ts`

## 3. Validation parity

- [x] 3.1 Add `specs/requirement-too-long` (living specs and ADDED/MODIFIED) and
      `deltas/dropped-text`, both registered in `rules/views.ts`; verify with
      `views.test.ts` and an equivalence test against the pinned binary
- [x] 3.2 Port the placeholder-purpose case rule, the scenario-loss message
      detail, and `config/rules-item-type` (YAML rules, not registered in
      `rules/views.ts`); verify with unit fixtures and a contract run
- [x] 3.3 Suppress redraw on zero-width TTY, `CI`, and
      `OPEN_SPEC_INTERACTIVE=0`, and propagate both to wrapped calls; verify
      with a Bun PTY integration test that asserts the child saw zero columns

## 4. Spec discovery and archive robustness

- [x] 4.1 Accept in-project symlinked layouts and refuse escaping links in
      `core/spec-paths.ts`/`change.ts`; verify with integration fixtures for
      `list --specs`, `show`, `validate`, `sync-specs`, and `archive`
- [x] 4.2 Bound glob nesting (16) and expansion (1024) in `core/glob.ts`; verify
      with unit tests for both limits
- [x] 4.3 Preserve dominant line endings in sync-specs and archive
      post-conditions, and relay `archive_retirement_cleanup_failed`; verify
      with CRLF and cleanup-failure integration tests
- [x] 4.4 Include the declaring project in store `allowedEditRoots`; verify with
      a store-backed integration test
- [x] 4.5 Let `cospec init` run at a store-only repository root (relax
      `initPointerRefusal` for a valid pointer) without touching the pointer or
      creating planning dirs; verify with a contract test differential against
      the pinned `openspec init`
- [x] 4.6 Preserve dominant line endings when `harness/legacy-config-blocks.ts`
      removes a legacy marker block; verify with a CRLF `CLAUDE.md` unit test

## 5. Commands

- [x] 5.1 Add `cospec version [--check] [--json]` (`commands/version.ts`, table
      row, completion, docs) keeping upstream's document shape with an
      `openspec` key and an injectable registry endpoint; verify with key oracle
      rows for `version --json` and `version --check --json`, the
      registry-fixture tests, and remove its pending entry
- [x] 5.2 Add `list --archived`/`--all` with `type`/`archivedOn`; verify with
      the key oracle and sort tests, and remove the pending entries
- [x] 5.3 Rebuild `cospec view` as a native dashboard (active vs archived,
      artifact states, gate, ledger, archive-ready, 48-column alignment); verify
      with integration snapshots and remove the pending entry
- [x] 5.4 Add `name` to `show --json` requirements/scenarios; verify with the
      key oracle
- [x] 5.5 Add `cospec update --dry-run [--json]` emitting upstream's
      `changes`/`notes`/`failures`/`status` document plus `row`/`reason`,
      distinct from `--check`; verify with the key oracle, an early-failure
      contract test, and an e2e test that leaves `git status` clean
- [x] 5.6 Add `.github/ISSUE_TEMPLATE/bug_report.yml` and move `cospec feedback`
      to its headings and a prefilled `?template=bug_report.yml` link; verify
      with unit tests over `manualUrl`/body composition
- [x] 5.7 Pad `cospec view` active rows to upstream's adaptive name width,
      `min(48, max(30, longest name))`, so rows fit an 80-column terminal;
      verify with an integration test of every bar line at 80 columns or fewer

## 6. Harness targets and canon

- [x] 6.1 Add `HARNESS_TABLE` rows for `codestudio`, `dsh`, `gigacode`,
      `atomcode`, `gsd`, `amp`, `easycode`, `veai`, `grok`, and `warp`, with the
      EasyCode TOML serializer and AtomCode `args:` dialect in `harness/`, and
      rename `bob` to "IBM Bob"; verify per-tool init integration tests and
      remove the pending tool entries
- [x] 6.2 Move Kilo Code commands to `.kilo/command/` with a name-matched legacy
      cleanup; verify with the user-file-survives integration test
- [x] 6.3 Port the 1.13.2–1.15.0 canon passages (verify, explore, update, specs,
      continue, tasks, ff, onboard, archive, proposal guidance, `project.md`
      migration, legacy-cleanup backup warning) with port-ledger records, then
      run `mise run generate`; verify the port-ledger test and
      `mise run generate:check`

## 7. Split from #100

- [x] 7.1 Leave `install` to `standalone-install`: no `install` table row or
      `COMMAND_MODULES` line, one `parity-pending.yaml` entry
      `{ kind: command, path: [install], owner: standalone-install }`,
      `standalone-install` in reachability's `KNOWN_OWNERS`, the pending
      assertion in `reachability.test.ts` and `parity-docs-loader.test.ts`
      expecting that entry, and the stale `pending()` comment in
      `command-table.ts` reworded; verify `reachability.test.ts` and
      `parity-docs-loader.test.ts` pass and `mise run docs:build` renders the
      one pending item
- [x] 7.2 Return `null` from `upgradeCommand('standalone')` (as for `source`)
      until `cospec install` exists, with a `version.test.ts` case for it, and
      name `version` in the `--store` refusal lists of
      `apps/docs/reference/commands.md` and `docs/architecture.md`, and in the
      `table`-parse list of `docs/architecture.md`; verify
      `test/unit/commands/version.test.ts` passes
- [x] 7.3 Keep only this change's requirement blocks in its delta specs and
      amend the ones the code contradicts: the shared `.agents/skills` rows and
      writer order (`amp`, `gsd`), delivery's `skills-invocable` rows (`warp`),
      a new Continue command-preamble requirement, the frontmatter-less command
      example path (`.kilo/command/cospec-propose.md`), in-project symlink
      discovery, the tasks-complete `next`, and the 1.15.0 pin's one pending
      entry, keeping every scenario name a lower change's delta also carries;
      verify `cospec validate openspec-1-15-parity --strict`,
      `cospec validate --all --strict` and `cospec sync-specs`

## 8. Close-out

- [x] 8.1 Confirm `parity-pending.yaml` holds only the `install` entry owned by
      `standalone-install`, update the docs-site parity and command pages, add
      release notes for the two strict-mode behaviour changes, and run
      `mise run check`; verify exit 0. The archive commit follows this one
