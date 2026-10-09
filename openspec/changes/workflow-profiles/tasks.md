# Tasks

Tracks follow design D1 and the roadmap's order (T1 to T7). Each track opens
with its contract or unit rows, written as `test.failing`, and the task that
implements them flips exactly those rows in the same commit. Every task ends
with `mise run check` green and one conventional commit (subject at most 72
characters, the harness's Co-Authored-By trailer, never `--no-verify`), with its
box ticked in that same commit. Every probe of the pinned binary runs under the
suite's oracle or a sandboxed HOME/XDG/CODEX_HOME/USERPROFILE/ZDOTDIR; contract
rows write the `config.json` under test into the sandbox's
`$XDG_CONFIG_HOME/openspec/` that `test/fixtures/support.ts` already provides.

## 1. Dependency gate (runs first; blocks groups 2 to 10)

- [x] 1.1 Confirm `tool-matrix` and `github-copilot` are merged and archived on
      `origin/main` (`git log origin/main`, `cospec list --archived` or the
      `openspec/changes/archive/` listing) and verify by naming both archive
      directories in the commit message; if either is absent, stop and report
      the blocker instead of starting group 2
- [x] 1.2 Rebase `worktree-workflow-profiles` onto that `main` (`git rebase`,
      then `git push --force-with-lease`), add both changes to
      `blocking-changes.md` "Blocked by" as `[x]` entries with their archive
      dates, and verify with
      `mise run cospec -- validate workflow-profiles --strict` clean and
      `mise run cospec -- apply workflow-profiles` exit 0; then re-read both
      changes' `design.md` and the merged `render.ts`, `init.ts`, `update.ts`,
      `adapters.ts`, and record in this file's commit body each place design
      D13's touch points moved
- [x] 1.3 Check `apps/cli/test/contract/parity-pending.yaml`: confirm
      `completion-install`'s entries are gone (it merged) or record that it has
      not, so verification row 8.4 is ticked only with a true statement; verify
      by `grep -c "owner:" apps/cli/test/contract/parity-pending.yaml` and the
      owners listed
- [x] 1.4 Capture the full-set golden before any source change: render the
      twelve bodies for every shipped row with all twelve installed into
      `apps/cli/test/fixtures/golden/profiles-full-set/` (extend the
      adapter-table golden set if one already holds them), and verify it is
      byte-identical to the committed `.claude/`, `.agents/`, `.codex/` and
      `.opencode/` output by a `test/unit/harness/full-set-golden.test.ts` that
      passes on the unmodified source

## 2. T1 — core workflows in the manifest (`apps/cli/src/canon/workflows/harness.yaml`)

- [x] 2.1 Write `test/unit/harness/core-workflows.test.ts` as `test.failing`
      (exactly `propose`, `explore`, `apply`, `update`, `sync-specs`, `archive`
      carry `core: true`, and the set equals the pinned `core/profiles.js`
      `CORE_WORKFLOWS` with `sync` read as `sync-specs`, imported in tests
      only), mark the six `core: true`, add `core?: boolean` to `WorkflowDef`,
      flip the test, and verify it passes with the pinned-dist comparison

## 3. T2 — conditionals, delivery and the render options (`harness/render.ts`)

- [x] 3.1 Write the failing rows: `test/unit/harness/optional-workflow.test.ts`
      (whole-line drop, inline, blank-line preservation, each of the three
      failure messages quoted in design D6, a truncated block in the dropped
      branch failing for every set) and
      `test/contract/optional-workflow-differential.test.ts` (cospec's resolver
      and the pinned `core/templates/optional-workflow.js` run over one matrix
      of well-formed and malformed texts and installed sets; outputs and thrown
      messages compared for equality), and verify both fail for want of the
      module
- [x] 3.2 Port `harness/optional-workflow.ts` from the pinned dist (patterns,
      `assertConditionalsWellFormed`, `resolveOptionalWorkflows`,
      `assertWorkflowConditionalsResolved`, the two helper constructors), flip
      the rows of 3.1, and verify the differential test passes across the whole
      matrix
- [x] 3.3 Write `test/unit/harness/delivery.test.ts` (the four predicates over
      every `HARNESS_TABLE` row, with a table-invariant test that classifies
      each row from its `commands` surface and `codex`, so a row added later
      needs no edit here; the shared-root rule; the zero-artifact line), add
      `harness/delivery.ts`, and verify the test passes against a fixture row of
      each capability
- [x] 3.4 Add `workflows` and `delivery` to `RenderOptions`; filter the emitted
      workflows; resolve conditionals on the raw body before `{{TYPE_TABLE}}`
      and `transformBody`; skip skills or commands per delivery; under `skills`,
      spell an adapter-backed row's skill bodies through
      `skillReferenceSpelling(row)` (the default `/cospec-<skill>`, not the
      Codex dual spelling, which only the shared root keeps; add it to
      `harness/delivery.ts` with a unit case per spelling); run the write-point
      assertion on every emitted body and again in `generate()` before any
      write. Verify by the rows of 3.1 and 3.3 and by `full-set-golden.test.ts`
      (task 1.4) still passing with no option set

## 4. T3 — wrap every cross-workflow reference (`apps/cli/src/canon/workflows/*.md`)

- [x] 4.1 Write `test/unit/canon/workflow-references.test.ts` as `test.failing`
      (any `/cospec:<id>` outside a conditional branch, any marker id outside
      the manifest, and any fallback naming `/cospec:` fails, naming file and
      line) plus `test/unit/harness/narrowed-render.test.ts` (rendering the core
      six, and `custom: [archive]`, yields no body naming an uninstalled
      workflow), and verify both fail on the current canon
- [x] 4.2 Wrap each reference in the twelve bodies per design D7's fallback
      table, run `mise run generate`, and verify the rows of 4.1 pass,
      `mise run generate:check` reports no drift, and `full-set-golden.test.ts`
      is unchanged (the full-set render is byte-identical)

## 5. T4 — init and the global config reader (`init.ts`, `command-table.ts`)

- [x] 5.1 Write `test/unit/core/global-profile.test.ts` as `test.failing` and
      add `core/global-profile.ts` (explicit key presence,
      `openspec config path` discovery, missing/unreadable/invalid/non-object
      file as nothing set, no warning of its own), then verify the cases pass,
      including `profile: null` counting as explicit and an unrecognised profile
      value selecting core
- [x] 5.2 Write `test/unit/harness/workflow-set.test.ts` and add
      `harness/workflow-set.ts` (core from the manifest, custom list with `sync`
      read as `sync-specs`, unknown ids dropped, non-array as empty, the
      `sync-specs` splice before the first `archive`/`bulk-archive`, explicit
      custom with no list empty), and verify it passes against the pinned
      `getProfileWorkflows` over the same inputs
- [x] 5.3 Write the failing rows of `test/contract/profiles.test.ts` for `init`
      (no profile installs twelve; explicit core key installs six and doctor has
      no `dangling-ref`; `{delivery:"both"}` alone installs twelve; `--profile`
      over a custom key; `custom [archive]` installs `sync-specs` and `archive`;
      invalid `--profile` refused before any write; the global file
      byte-identical; the receipt line and the `--json` keys), and verify they
      fail on the current `init`
- [x] 5.4 Make `init.run` async, declare `--profile` and `--language` as handled
      in the command table, validate `--profile` first, resolve the effective
      set and delivery, pass them to `generate()`, add the receipt line and the
      `profile`/`delivery` JSON keys, resolve `receiptHintLines` against the
      row's set, and delete the `init --profile` entry from
      `parity-pending.yaml` in the same commit; verify the rows of 5.3 pass and
      the reachability test resolves `--profile` to the table alone
- [x] 5.5 Write the failing `--language` rows (fresh repo gets the three lines;
      a config with a differing context refuses; a config with no context
      refuses; the same directive accepted; empty, control-character, over-50-KB
      and unwritable-destination refusals, each with its message compared to the
      pinned binary's `init --language` run in the sandbox) and verify they
      fail, then implement the validation and the `context:` write in `init.ts`,
      delete the `init --language` entry from `parity-pending.yaml`, and verify
      the rows pass and `init --language` refuses before writing anything
- [x] 5.6 Add the commented `operations:`, `store:` and `references:` examples
      to `CONFIG_YAML` (the binary's own `operations:` text, cospec-authored
      `store:` and `references:`), and verify by a test that parses the
      generated file with the pinned reader (`openspec status` in the sandbox)
      and sees no warning, and that the file contains the three example headings
- [x] 5.7 Write the failing rows for root-level legacy blocks (all eight
      filenames match the pinned `LEGACY_CONFIG_FILES`; a block stripped and the
      rest kept; a block-only file written empty and not deleted; an inline
      mention left alone; CRLF kept; no consent lists and changes nothing; each
      result compared byte for byte with `openspec init --force` run on a copy),
      port `hasOpenSpecMarkers` and `removeMarkerBlock` into the opsx scan as a
      second pass behind `--remove-opsx`/`--yes`, report the files in
      `opsx.found`, and verify the rows pass

## 6. T5 — update (`apps/cli/src/commands/update.ts`)

- [x] 6.1 Write the failing `update` rows in `profiles.test.ts`: an explicit
      core key over a twelve-workflow repo removes nothing; a custom profile
      that adds `verify` creates only it; delivery `skills`, then `commands`,
      then `both` moves files both ways and keeps every workflow installed; a
      later harness gets the profile's set while claude keeps twelve; detection
      with no `propose` skill and with commands only; a skills-only row under
      `commands`; `codex` keeping skills under `commands`; and `update --check`
      exits 0 on a repo that sets nothing, and verify they fail on the current
      `update`
- [x] 6.2 In `generate()`, compute each row's effective set (profile plus
      installed cospec-managed skill or command, or a manifest-tracked command),
      make `removeOrphanMarkdown` sweep the rows' directories rather than the
      rendered files' so a delivery switch removes the dropped surface, and
      apply the shared-root rule; verify the install, never-remove and delivery
      rows of 6.1
- [x] 6.3 Widen `hasHarnessEvidence` to any cospec-managed workflow skill or
      command file, keeping the `codex`/`agents` rules, make `update.run` async,
      add the receipt line, the zero-artifact line and the `profile`/`delivery`
      JSON keys, and verify the detection rows of 6.1 and the existing
      `detectHarnesses` unit cases still pass

## 7. T6 — doctor (`apps/cli/src/commands/doctor.ts`)

- [x] 7.1 Write the failing doctor rows: an explicit core key over twelve
      workflows reports an INFO `openspec-global-profile` finding naming the six
      outside the profile and no finding says "inert"; nothing explicit is
      silent; a narrowed install has no `dangling-ref`; a residual `[[opsx:`
      marker is a `dangling-ref` ERROR; and the check still flags a reference to
      an absent workflow, and verify they fail on the current `doctor`
- [x] 7.2 Replace `checkGlobalProfile` with a call to `core/global-profile.ts`,
      report the explicit profile, delivery and installed-outside-profile
      workflows under the same check id, add the residual-marker ERROR to the
      dangling-reference check, route the root-file scan of 5.7 into
      `opsx-leftover`, and verify the rows of 7.1 and
      `test/contract/doctor-parity.test.ts`

## 8. T7 — the profile matrix and parity close-out (`test/contract/profiles.test.ts`)

- [ ] 8.1 Complete the matrix: profile (unset, core, custom with and without
      `archive`) by delivery (unset, skills, commands, both) by harness (claude,
      codex, opencode, agents, and every row `tool-matrix` and `github-copilot`
      added with a distinct command surface), each cell running `init`, then
      `update`, then `doctor`, and verify every cell passes and none leaves a
      `test.failing` or `test.todo`
- [ ] 8.2 Retarget the tests that used the closed pending entries as fixtures:
      the `init --language` negative cases in `reachability.test.ts` (and any
      naming `init --profile`) and rows 77, 328, 329, 370 and 371 of
      `test/unit/core/command-table.test.ts`, onto a synthetic table row, drop
      `workflow-profiles` from `KNOWN_OWNERS` if nothing names it, and verify
      `mise run test:contract` and `mise run test` pass
- [ ] 8.3 Add the reachability assertion that `parity-pending.yaml` is empty and
      a docs-loader test that an empty list renders, and verify
      `grep -c "owner:" apps/cli/test/contract/parity-pending.yaml` prints 0 and
      `mise run docs:build` succeeds

## 9. Docs and shared guidance

- [x] 9.1 `apps/docs/guide/harness-setup.md`: remove the "no core/custom profile
      split" sentence and describe explicit-only profiles, delivery and
      never-removes; fix the "no global state" sentence's neighbours that this
      change touches (cospec reads the global config, writes none), and verify
      with `mise run docs:build` and a grep for the removed sentence
- [x] 9.2 `apps/docs/reference/configuration.md`: `profile`, `workflows`,
      `delivery` and `context` on the page that owns them, the note at the end
      of the machine-global section that said these keys are inert, and the
      `config.yaml` examples; verify with `mise run docs:build`
- [x] 9.3 `apps/docs/reference/commands.md`: the `init` row (`--profile`,
      `--language`, the root-file sweep under `--remove-opsx`), the `update` row
      (never removes; delivery), the `doctor` row, and the BREAKING cases;
      verify with `mise run docs:build` and by reading each flag against the
      table's `--help`
- [x] 9.4 `apps/docs/concepts/how-it-relates-to-openspec.md` (the loader renders
      an empty pending list; the sentence that every OpenSpec capability has a
      counterpart reads true), `docs/harness-integration.md` (line 17),
      `docs/architecture.md` (the grammar port, the one reader, the capability
      derivation), and verify `mise run docs:build` and a grep for "no
      core/custom profile split" across `apps/docs` and `docs` finds nothing
- [x] 9.5 `.agents/shared.md`: the explicit-only rule, the never-removes policy,
      where the one reader lives and the conditional grammar's differential
      test, then `mise run agents:sync` and verify `mise run agents:check`
      passes

## 10. Close-out

- [ ] 10.1 Run `mise run generate:check`, `mise run openspec:schema:validate`,
      `mise run test:contract` and `mise run check`, and verify each exits 0 on
      the rebased branch with no tracked file changed by `mise run generate`
- [ ] 10.2 Tick every `verification.md` row with its observed result or a
      `[~] defer:` reason, set each blocking entry's archive date with
      `mise run cospec -- sync-blockers`, and verify
      `mise run cospec -- validate workflow-profiles --strict` is clean
- [ ] 10.3 Final task: confirm the branch is rebased on `origin/main` with
      `mise run check` green and the ledger resolved, and push it, verifying
      with `git log origin/main..HEAD` that every commit is conventional; the
      archive commit follows this one
      (`mise run cospec -- archive workflow-profiles` is run after this box is
      ticked and is not itself a task)
