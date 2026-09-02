<!-- One checkbox per work unit (W1-W21), grouped by implementation track. -->
<!-- Tracks own files exclusively; a unit needing another track's file hands -->
<!-- the content over rather than editing it. Track A's pin commit lands -->
<!-- first, alone; B/C/D/E/F then run in parallel; G runs last. -->

## 1. Track A — pin and wrapped-call layer

- [x] 1.1 W1 — bump `@fission-ai/openspec` 1.5.0 → 1.11.0 in
      `apps/cli/package.json`, the `npm:` mise tool pin and `mise.lock`'s
      version record (mise's npm backend records no per-platform rows, so the
      plan's "every platform entry" was not applicable), and
      `PINNED_OPENSPEC_VERSION`; regenerate `bun.lock` and the vendored bundle +
      third-party notices via `mise run vendor:openspec`; keep
      `OPENSPEC_VERSION_FLOOR` at `1.0.0`; correct the stale dead type
      declarations (`ArtifactStatus`, `StatusJson`, `ArtifactInstructionsJson`;
      `ListJson` re-verified against upstream and accurate as written). Verify:
      `mise run test:contract` (`version-tripwire.test.ts` green on the
      manifest/mise/live-binary triple), `mise run vendor:openspec:check` clean,
      and `test:integration`'s `pack-standalone.test.ts` proving the embedded
      bundle still runs with no `node_modules`. Hand off to F the new version
      literal for the doctor tests.
- [x] 1.2 W18 — add `OPENSPEC_NO_COMPLETIONS: '1'` to `spawnRaw`'s forced
      environment beside `OPENSPEC_TELEMETRY: '0'`, and comment that the
      telemetry switch is what also disables the wrapped per-command update
      check. Verify: a unit test asserting both keys are present in the spawn
      env, plus a contract assertion that wrapped stderr carries no shell
      completions suggestion when HOME has no prior openspec global config.
- [x] 1.3 W19 — run `mise run test:contract` against real 1.11.0 **before**
      editing any test, record every failure, then rewrite each affected
      narrative to describe the new reality (`scenario-preservation`,
      `archive-parity`, `archive-gotchas`, `hard-reality`, `store`,
      `legacy-schema-lifecycle`), never weakening an assertion to make it pass;
      fix fixtures that newly fail `--strict` under the 1.8/1.9 delegated rules
      instead of filtering the rules. The `schemas --store` and `show --diff`
      relay tests the plan also named were NOT authored: both land in files
      another track owned and the hand-off was dropped. Both surfaces are
      generic passthroughs (`runPassthrough` threads `--store` and forwards
      `--diff` verbatim), so no behaviour is unshipped — only the dedicated
      coverage, recorded as a follow-up and deferred in this change's
      verification ledger. Verify: `mise run test:contract` green plus a written
      record of every behavioural delta, transcribed into this change's
      verification ledger.

## 2. Track B — archive correctness and change metadata

- [x] 2.1 W2 — replace `commands/archive.ts`'s UTC
      `new Date().toISOString().slice(0,10)` with a local-date helper mirroring
      upstream's `formatLocalDate`, and widen the step-9 target matcher to
      accept both `YYYY-MM-DD-<id>` and an already-date-prefixed `<id>`
      verbatim. `core/change.ts readArchiveIndex`'s slug derivation was probed
      and deliberately left unchanged, with the reason recorded in
      `isArchiveTargetFor`'s doc comment: `CHANGE_ID_RE` makes `resolveChange`
      return undefined for a date-prefixed id and `nameKebabIssues` raises an
      ERROR on `ARCHIVE_PREFIX_RE` before archive delegates, so the path is
      unreachable through cospec's own surfaces. `buildValidateContext` in
      `commands/validate.ts` needed no twin fix — `toISOString()` date stamping
      no longer appears anywhere outside `archive.ts`'s comment. Verify: a unit
      test on the date helper under a zone east of UTC where `toISOString()`
      still says today, a unit test on the target matcher covering both binary
      behaviours, and a contract test archiving through the real binary in a
      deliberately skewed zone asserting success plus the target directory on
      disk.
- [x] 2.2 W4 — harden `core/deltas.ts`: strip a leading U+FEFF and normalise
      `\r\n`/`\r` at both `parseDeltaSpec` and `parseLivingSpec` entry, port
      upstream's `buildCodeFenceMask` semantics
      (```and`~~~`; a closing fence     must match the opening marker and be at least its length), and mask     HTML-comment spans (including unterminated-to-EOF) in place so line     numbers do not shift. Verify: unit fixtures for BOM, CRLF, a     commented-out `###
      Requirement:`/`####
      Scenario:`, a four-backtick block     containing a three-backtick line, and a `~~~`
      fence — each asserting the header is not counted and that the reported
      line numbers still match the source file; plus an integration assertion
      that the scenario-preservation gate still refuses when the only surviving
      scenarios are masked.
- [x] 2.3 W5 — capture the wrapped archive's warning-shaped stdout on the
      success path (today discarded unless the archive fails) and surface it as
      `Warning:` lines in the human summary and a `warnings: string[]` array in
      `cospec archive --json`, without changing how success is computed and
      without adding `--json` to the archive spawn. Verify: a contract test
      archiving a change with an indented Notes paragraph inside a requirement,
      asserting the warning appears in both cospec's stdout and its `--json`;
      plus a regression test that `ABORTED_RE`/`CANCELLED_RE` do not match the
      new hint text and the archive is still reported successful.
- [x] 2.4 W6 — recognise `retire_capabilities` in `core/change.ts`
      `readOpenspecYaml` and `core/rules/meta.ts`, and surface a declared
      capability retirement in `archive.ts`: relay the wrapped binary's
      retirement warning, report retired capabilities as `Retired:` in the human
      summary and `retired: string[]` in `--json`, and have step 10's
      `spotCheckMiss` raise an invariant breach when a living `spec.md`
      disappears WITHOUT the marker. The unit's premised false invariant breach
      on a _declared_ retirement was probed both ways against real 1.11.0 and is
      NOT reproducible — openspec only retires once no requirement block
      survives, so every surviving op is a REMOVED/RENAMED-from that
      `spotCheckMiss` tests for absence and passes — so no fix was invented for
      it and the unit shipped as retirement reporting plus the new unmarked-
      deletion check. Verify: a contract test on a change whose `REMOVED` op
      takes the last requirement, run twice — without the marker cospec relays
      the wrapped refusal; with it archive succeeds and no invariant-breach
      message is printed — plus a unit test that the spot check still reports a
      genuine miss on a non-retired capability.
- [x] 2.5 W7 — recognise `skip_specs` on `LoadedChange.openspecYaml`, honour it
      as a persisted equivalent of `cospec archive --skip-specs` with precedence
      CLI flag > marker > structural, and raise an ERROR when the marker is
      declared alongside any file under `specs/`; land this metadata interface
      FIRST so C and E can consume it, and hand the `commands/apply.ts` gate
      wiring to track E, which owns that file. Verify: a unit precedence table
      over flag/marker/structural, a unit test on the conflict ERROR, and an
      integration test that a `feat` change with `skip_specs: true` and an empty
      `specs/` passes `cospec validate` and `cospec apply` while adding one file
      under `specs/` flips it to an ERROR.

## 3. Track C — validate and spec paths

- [x] 3.1 W3 — add `core/spec-paths.ts` (recursive discovery skipping dot-dirs,
      posix ids sorted by id, capability from the file's immediate parent
      directory, in-capability symlink resolution, rejection of escaping links,
      dangling links skipped, only `ENOENT` swallowed) and consume it in
      `validate.ts`'s `loadChange`, `livingSpecCaps`, and `mapDelegated`; add
      the root-level `specs/spec.md` ERROR in `core/rules/deltas.ts` with
      registration in `core/rules/index.ts`; land it as an early standalone
      commit and hand `changeDeltaOps` to track B. Verify: a fixture laid out
      `specs/<area>/<capability>/spec.md` driven end to end through
      `cospec validate`, the scenario-preservation gate, and archive's
      post-merge spot check asserting the capability resolves to `<capability>`;
      unit tests for the escaping-symlink rejection and the non-`ENOENT`
      propagation; and a fixture with a root-level `specs/spec.md` asserting the
      named cospec ERROR with the delegated duplicate suppressed.
- [x] 3.2 W11 — add `cospec validate --archived` as pure delegation to
      `openspec validate --archived --json --no-interactive` plus
      `root.storeArgs`, mirroring the existing `--specs` path and rendering the
      envelope through cospec's issue reporter; hand the `cli.ts` help row to
      track E. Verify: a contract test that archives a change with an incomplete
      task list, then asserts `cospec validate --archived --json` surfaces the
      ERROR and exits 1, plus an assertion that
      `validate <slug>`/`--specs`/`--all` behaviour and exit codes are
      unchanged.
- [x] 3.3 W12 — extend `core/rules/specs.ts`'s `specs/purpose-tbd` to a
      `## Purpose` whose first non-blank line opens with a word-boundary,
      unicode-aware `TBD`/`TODO` marker, keeping the frozen rule id and WARNING
      severity, keeping the two placeholder forms mutually exclusive, and
      suppressing the delegated 1.11 `purpose-placeholder` duplicate when the
      native rule fired for the same file. Verify: unit tests for both
      placeholder forms, an unchanged-behaviour test for an empty `Purpose`, a
      `--strict` promotion test, and a merged-report test asserting exactly one
      issue per defect while an unmatched delegated issue still survives.

## 4. Track D — root and store

- [x] 4.1 W8 — add `defaultStore` to `core/root.ts` as a FALLBACK consulted only
      after local-root resolution fails (never as a tier above `localRoot`),
      read through the wrapped binary's `config get defaultStore` raw value
      (exit 1 when unset) rather than by reimplementing global-config path
      discovery, and degrade to `resolveStore`'s actionable error on a stale id.
      Verify: extend `test/integration/store-aware.test.ts` with a
      `defaultStore`-configured HOME asserting `cospec status`/`list`/
      `validate` target the store when no local root resolves, that a local
      repository still wins, that `--store` and a local `store:` pointer outrank
      it, and that a stale id produces the unknown-store error.

## 5. Track E — new and reworked CLI surfaces

- [x] 5.1 W9 — add `archive` to `ARTIFACTS` in `commands/instructions.ts` so the
      command advertises it, leave it on the generic read-only branch (not
      aliased to `cospec archive`), and route that branch through
      `passthroughOpenspec`/`callPassthrough` so it gains the one-JSON-document
      invariant and exit-code normalisation. Verify: a contract test that
      `cospec instructions archive --change <id>` and its `--json` form relay
      the wrapped payload with the right exit code and leave the change in
      `openspec/changes/`, plus a unit test that a wrapped
      `status:[{severity:"error"}]` body at exit 0 normalises to exit 1.
- [x] 5.2 W10 — add `cospec status --all`, mutually exclusive with `--change`:
      loop `listChanges(base)`, `computeStatus` per change, sort by id, emit a
      per-change failure entry instead of aborting, `{changes, root}` under
      `--json`, blank-line-separated blocks in text mode, exit 1 if any entry
      failed; keep the single-change shapes byte-identical, and add the `cli.ts`
      help rows for `--all`, `--archived`, `instructions archive`, and
      `--skip-specs` on behalf of C. Verify: unit tests for the sweep and its id
      ordering, the mutual-exclusion error, one-bad-change-does-not-abort, the
      exit code, and a snapshot proving the single-change `--json` document is
      unchanged.
- [x] 5.3 W21 — reconcile `cospec apply --json`'s task accounting with the 1.8+
      `openspec instructions apply --json` payload, which now counts nested
      sub-task checkboxes while `core/tasks.ts` counts only top-level rows.
      Probing established the two counts can never disagree on any change that
      reaches `cospec apply`'s clear-gate JSON: `tasks/checkbox-grammar` is an
      ERROR that always runs during apply's fast validation and blocks a nested
      checkbox before the wrapped payload is ever produced. The unit therefore
      shipped as documentation plus tests rather than a counting-rule change —
      no code change was needed and none was invented. Also wire W7's
      `skip_specs` marker into the apply gate's specs requirement. Verify: a
      contract test against the real binary asserting a nested-checkbox
      `tasks.md` is blocked at apply Step 2 with `tasks/checkbox-grammar` and no
      `progress` key in stdout, and that a flat `tasks.md` exits 0 with
      `apply.progress.total`/`complete` matching `parseTasks` exactly; plus an
      integration test that a marked, spec-less `feat` change passes the gate.

## 6. Track F — canon, harness, and generated output

- [x] 6.1 W13 — add the twelfth workflow: `canon/workflows/update.md` (revise
      existing artifacts only; never invent an artifact or edit code; route
      through `cospec status --change <slug> --json` and
      `cospec instructions <artifact> --change <slug> --json`; hand off to
      `/cospec:continue` or `/cospec:apply`), register it in
      `canon/workflows/harness.yaml` and `canon/workflows/embedded.ts`, add
      `update: 'cospec-update-change'` to `doctor.ts`'s `WORKFLOW_SKILL`, and
      run `mise run generate`. Verify: `mise run generate:check` clean,
      `cospec doctor` reporting no dangling refs, and harness unit tests whose
      workflow count moves 11 → 12 across all three harnesses while
      `cospec schemas` still lists eleven schemas.
- [x] 6.2 W14 — canon workflow prose pass: replace `AskUserQuestion` with
      runtime-neutral wording in `new.md`, `continue.md`, `ff.md`, `propose.md`;
      add re-read-from-disk to `continue`/`propose`/`ff`; add scope honesty to
      `apply.md`'s exit-0 branch; add consent gating and `openspec/config.yaml`
      reading to `explore.md`; add the declined branch to `bulk-archive.md`; add
      sole-active-change auto-select with an announcement to
      `continue`/`verify`/`sync-specs`/`archive` (never `bulk-archive`); add the
      capability-retirement procedure to `sync-specs.md` and `archive.md`; then
      `mise run generate`. Verify: `mise run generate:check` clean and a render
      assertion that no generated harness file contains `AskUserQuestion` or
      `TodoWrite`, plus per-body assertions for the consent gate, the declined
      branch, and the auto-select announcement.
- [x] 6.3 W15 — canon artifact-instruction pass: adopt
      `<planningHome.root>/openspec/specs/<capability-path>/spec.md` phrasing in
      `canon/artifacts/specs/meta.yaml` (the bare CWD-relative path is wrong
      under a registered store today), add nested `<capability-path>` wording to
      `specs`/`proposal`/`types/feat`, require each task to state its own
      verification in `canon/artifacts/tasks/meta.yaml` and its `templateBody`,
      and port the design scope-boundary wording if absent; then
      `mise run generate`. Verify: `mise run generate:check` and
      `mise run openspec:schema:validate` clean, plus the 11 regenerated schema
      goldens passing byte-for-byte. No dedicated `--store` integration test was
      authored: the emitted guidance is static canon prose that names
      `<planningHome.root>` as a placeholder and is identical with or without
      `--store`, so `cospec instructions specs --change <id>` was observed
      directly instead.
- [x] 6.4 W16 — add `injectOpenCodeArgs(body)` to the harness adapters and wire
      it into the opencode transform in `harness/render.ts`: no-op when the body
      already references `$ARGUMENTS`/`$1`, otherwise inject a
      `**Provided arguments**: $ARGUMENTS` line at the input-contract point,
      preserving line endings, applied only to workflows audited as taking
      positional input. Verify: unit tests for the already-has-placeholder no-op
      and CRLF preservation, a render test asserting every arg-taking
      `.opencode/commands/cospec-*.md` contains `$ARGUMENTS` and that the claude
      and codex outputs are unchanged, and `mise run generate:check`.
- [x] 6.5 W17 — add `.agents/skills` to `findOpsxFiles`' scanned roots in
      `commands/init.ts` (scan only — never a cospec generation target) so
      `cospec init --remove-opsx` and `doctor`'s `opsx-leftover` check see
      post-1.8 openspec installs; leave the shape-based `isOpsxMarkdown`
      detector unchanged; and take A's new version literal into the doctor
      tests. Verify: add `.agents/skills/openspec-propose/SKILL.md` to
      `test/fixtures/vanilla-openspec/` and assert `cospec doctor` reports it as
      `opsx-leftover`, `cospec init --remove-opsx` deletes it and prunes the
      emptied directory, a non-openspec file under `.agents/skills/` survives
      untouched, and `cospec init` still writes nothing under `.agents/`.

## 7. Track G — docs and shared prose

- [x] 7.1 W20 — sweep every user-facing doc after the other tracks settle:
      `1.5.0` → `1.11.0` across `docs/`, `apps/docs/`, and `README.md`; 11 → 12
      **workflow** count while leaving the eleven **schema** count alone;
      command-reference rows for `status --all`, `validate --archived`,
      `instructions archive`, `show --diff`, and archive's `warnings[]`; the
      per-surface runtime minimums (≥1.7.0, ≥1.9.0) and the unchanged `1.0.0`
      floor; `skip_specs`/`retire_capabilities` in the configuration reference;
      the `defaultStore` fallback in the stores pages; deletion of the
      `/opsx:update` deferral bullet in `docs/harness-integration.md`; the
      defence-in-depth framing for cospec's scenario gate; then
      `.agents/     shared.md` and `mise run agents:sync`. Verify:
      `mise run docs:build` and `mise run agents:check` green, and a grep
      showing no surviving `1.5.0` literal or "eleven workflows" phrasing.
