# Tasks

<!-- Each task ends in one commit. Groups 1 to 4 start now; group 5 waited for the three changes now recorded under blocking-changes.md "Blocked by". The archive is the branch's final commit, after 7.1. -->

## 1. Track T4 (before): baseline on unmodified code

Exclusive files: `apps/cli/test/unit/harness-render.test.ts`,
`apps/cli/test/unit/__golden__/harness-render/**`,
`apps/cli/test/integration/harness-wiring.test.ts`,
`apps/cli/test/integration/__golden__/harness-wiring/**`.

- [x] 1.1 Before any source edit, add
      `apps/cli/test/unit/harness-render.test.ts` and its golden directory:
      render claude, codex, opencode and agents each alone and all four together
      at the fixture version; under `COSPEC_GOLDEN_WRITE=1` write every file's
      raw bytes plus one `index.json` per render (`path`, `kind`, `workflow`,
      `harness`, `contentHash`); otherwise compare `Buffer`s and the exact path
      set. Commit as the branch's first commit and record its sha in
      verification 1.2; verify the test is green without the variable and
      `git diff main -- apps/cli/src` is empty at that commit -> done together
      with 1.2 in one commit (see its sha below); 5 describe blocks
      (claude/codex/opencode/agents/all) each assert the exact path set, the
      index.json, and byte-identical content against the committed golden; green
      under `bun test test/unit/harness-render.test.ts` with and without
      `COSPEC_GOLDEN_WRITE=1`; `git diff main -- apps/cli/src` empty at this
      commit (verified before committing). Also added `__golden__/` to
      `.prettierignore` (repo root, not in this task's exclusive-file list but
      required: oxfmt's md/json overrides were reflowing the committed
      byte-exact golden files) — flagged for review
- [x] 1.2 Add `apps/cli/test/integration/harness-wiring.test.ts` and its golden
      directory, written the same way: init receipts per harness, `all`, `none`
      and the auto-detected default; the invalid `--harness` message and exit
      code; init detection and `detectHarnesses` over the verification 3.2
      fixtures; the verification 3.3 removal-containment fixture; doctor's human
      and `--json` output over the verification 3.4 fixture. Commit; verify it
      is green and `git diff main -- apps/cli/src` is still empty ->
      init-receipts/{claude,codex,opencode,agents,all,none,default}.txt,
      invalid-harness.json, detect-harnesses/_.json (via
      `update --check     --json`) + init-auto-detect/_.json (via `init --json`,
      no --harness) over the 6 verification-3.2 fixtures (claude-only,
      codex-migrated, codex-legacy, agents-only, codex-plus-agents, all-four —
      confirms the two detection systems disagree on the codex/agents collision
      by design), removal-containment.json (5 real leftovers removed, `.foo/x`
      and `../victim.txt` never resolved — asserted directly, not just
      captured), doctor/{human,json}.json (opsx x2, dangling-ref, stale-sidecar,
      legacy-layout, in stable order); `XDG_CONFIG_HOME` isolated per doctor
      call so the real machine's `~/.config/openspec` never leaks in. Green
      under `bun test test/integration/harness-wiring.test.ts` with and without
      `COSPEC_GOLDEN_WRITE=1`, repeated twice for stability;
      `git diff main -- apps/cli/src` empty at this commit
- [x] 1.3 Run `mise run build`, then `cospec init --harness all` with the built
      binary in a fresh temporary git repo, and record the sorted `sha256` list
      of the written files in verification 3.8. Commit the ledger note; verify
      the list has one entry per rendered file plus the schemas, config and
      settings the receipt names -> 127 files, `sha256:c9ff1f08…6ff305` over the
      sorted `sha256sum` output, stdout `sha256:87775b30…b3d750`; recorded in
      verification 3.8 (row stays unticked there — it compares against the task
      5.2 re-take, not this baseline alone)

## 2. Track T1: the per-tool table

Exclusive files: `apps/cli/src/harness/adapters.ts`,
`apps/cli/test/unit/harness/adapters.test.ts`.

- [x] 2.1 Add `HarnessAdapter` and `HARNESS_TABLE` with the four rows in today's
      order, exactly as design.md tabulates them (upstream-meaning
      `skillsDir`/`legacySkillsDirs`, today's `detectionPaths`, `RESTART_LINES`
      text as `setupNote`, the claude and minimal frontmatter builders, the
      codex `rulesPath`, `injectArguments` on opencode). Derive `HarnessName`,
      `HARNESS_NAMES` and `isHarnessName` from the table, and add the path, scan
      root and removal root helpers of design decisions 4 and 12. Add the `flat`
      dialect beside `opencode`, which stays until 3.1 removes it. The change is
      additive: `render.ts` still reads `harness.yaml`. Commit; verify
      verification 2.1, 2.2, 2.3 and 2.9 pass, `mise run test` is green and both
      golden tests from group 1 pass unchanged -> `HARNESS_TABLE` (4 rows,
      `as const satisfies readonly HarnessAdapter[]`, so `HarnessName` stays the
      literal union, pinned by a `@ts-expect-error` case) plus `adapterFor`,
      `skillsRoot`/`skillPath`/`legacySkillsRoots`/`commandPath`, `scanRoots`
      and `removalRoots`; `HARNESS_NAMES` derived, same name/values/order.
      adapters.test.ts: invariants (2.1), per-workflow path equality against the
      `harnesses:` block for all four ids (2.2), `displayName`/`skillsDir`/
      `globalSkillsDir`/`legacySkillsDirs`/`requiresIdeRestart` and agents
      `searchAliases`/`detectionPaths` equal to the pinned `AI_TOOLS` with the
      codex `detectionPaths` divergence named (2.3), scan roots
      `.claude,.codex,.opencode,.agents`, removal-root set and
      `LEGACY_CODEX_SKILL_ROOT` tie (2.9) — 37 pass; `mise run test` 1025 pass;
      harness-wiring 17 pass; typecheck, lint, format:check, generate:check
      green

## 3. Track T2: render reads the table

Exclusive files: `apps/cli/src/harness/render.ts`,
`apps/cli/src/canon/workflows/harness.yaml` (the `harnesses:` block only),
`apps/cli/test/unit/harness/render.test.ts`.

- [x] 3.1 Switch `renderHarnessFiles` to the rows: skills and command paths, the
      frontmatter builder and `injectArguments` from the row, the rules file
      from `rulesPath`, `scope` on `RenderedFile`, and a
      `RenderOptions.adapters` override. Delete `HarnessSurface`, the
      `harnesses:` block of `harness.yaml`, the `harness === …` branches, and
      the `opencode` dialect name (opencode's row uses `flat`, and the 2.2
      comparison retires with the block). Rebuild the render-conflict case on
      the override. Commit; verify verification 1.1, 1.4 and 2.8 pass ->
      render.ts reads rows via `adapterFor` over
      `opts.adapters ?? HARNESS_TABLE` (skill path from `skillsRoot`, command
      path from `commandPath`, frontmatter builder and `injectArguments` from
      `row.commands`, rules from `rulesPath`, `scope` on every `RenderedFile`);
      a non-`markdown` serializer or a markdown surface with no builder throws
      an internal error until 3.2. `HarnessSurface`, the `harnesses:` block and
      the `opencode` dialect are gone; the 2.2 yaml-parity tests retired with
      the block. Conflict case now injects an `agents` row with
      `bodyDialect: 'canonical'` and throws the same message (2.8).
      harness-render goldens pass and
      `git diff --exit-code a2fdaef -- apps/cli/test/unit/__golden__/ apps/cli/test/integration/__golden__/`
      exit 0 (1.1); `__snapshots__/` no diff from main; generate:check no drift
      (1.4); `mise run test` 1021 pass, test:integration 180 pass, test:contract
      120 pass
- [x] 3.2 Add the pluggable serializer (`markdown` as today, `toml` with
      upstream's two escaping functions ported) and the per-row extension, with
      fixture-row tests for TOML, `.prompt`, `.prompt.md`, a split commands
      root, namespaced and flat filenames, the `@` prefix and home scope.
      Commit; verify verification 1.1, 2.4, 2.5, 2.6 and 2.7 pass -> render.ts
      dispatches on `commands.serializer`: `toml` emits
      `serializeTomlCommand(description, body)` (upstream Gemini layout, both
      escapers ported in upstream's replace order; the control-char class is a
      per-character scan because oxlint's no-control-regex rejects the regex)
      with `frontmatter: null` and `contentHash: null`; the body's one trailing
      newline is dropped since upstream's template supplies it. The no-builder
      check is scoped to `markdown`, and a `toml` row declaring a builder is
      refused. render.test.ts: formatFile parity against the pinned `gemini.js`
      on backslash, `"""`, tab, C0, lone CR, CRLF, all 128 ASCII code units and
      a description with `"`/newline (2.4; a replace-order mutation fails 3 of
      these); split `.cline`/`.clinerules/workflows` root,
      `.prompt`/`.prompt.md`/`.toml` filenames, namespaced vs flat (2.5); `@`
      respelling and a relocated `/` row byte-identical to the committed
      OpenCode golden (2.6); `globalSkillsDir` row home-scoped, the four real
      rows all project-scoped (2.7). The `generate()` home-scope refusal is
      5.4's (T3), not done here. Goldens: `git diff --exit-code a2fdaef` over
      both `__golden__/` dirs exit 0 (1.1); `__snapshots__/` no diff from main;
      generate:check no drift; `mise run test` 1043 pass, test:integration 180,
      test:contract 120, test:pack 2; typecheck, lint, format:check green

## 4. Track T4 (after): render equivalence checkpoint

Exclusive files: `openspec/changes/harness-adapter-table/verification.md`.

- [x] 4.1 No-behavior-change check for groups 2 and 3: run `mise run test`,
      `mise run test:integration`, `mise run test:contract` and
      `mise run generate:check`, and the golden diffs of verification 1.2 and
      1.3. Record the observed results for verification 1.1 to 1.4, 2.1 to 2.9
      and 4.1 to 4.3 as they stand. Commit the ledger; verify every existing
      suite is green with no existing integration or contract test edited ->
      `mise run test` 1043 pass, `test:integration` 180 pass, `test:contract`
      120 pass, `generate:check` no drift; golden diffs 1.2
      (`git diff --exit-code a2fdaef HEAD -- .../harness-render/`) and 1.3
      (`git diff --exit-code main -- .../__snapshots__/`) both exit 0; 4.1's
      `test(` diff shows only the design-decision-8 dialect rename (`opencode`
      -> `flat`) and the 2.8 conflict-case rebuild, no removed assertion;
      recorded verification 1.1-1.3 [x], 1.4 [~] defer (after-5.5 half awaits
      T3), 2.1-2.9 [x], 4.1-4.3 [x]; `cospec validate --strict` passes

## 5. Track T3: init, update and doctor read the table (gated)

Exclusive files: `apps/cli/src/commands/init.ts`,
`apps/cli/src/commands/update.ts`, `apps/cli/src/commands/doctor.ts`.

Starts only after `unknown-option-contract`, `upstream-spellings` and
`passthrough-json-and-doctor` have merged to `main`.

Order is fixed: rebase onto `main` (5.1), then re-take the wiring
characterization baseline on the rebased, unmodified tree (5.2), then implement
T3 (5.3 to 5.5), then compare against that baseline (5.6). The baseline is never
re-taken after any T3 edit.

- [x] 5.1 Rebase the branch onto `main` (`--force-with-lease`). Record the three
      changes under `## Blocked by` in `blocking-changes.md` as checked,
      archived entries, and run `mise run cospec -- sync-blockers`. Commit;
      verify verification 4.4 and 5.1 pass and the group 1.1 render golden test
      is still green on the rebased tree -> rebased onto `main` d25c5c0 with 0
      conflicts (`git diff origin/main -- apps/cli/src/commands/` empty after
      it);
      `env -u FORCE_COLOR -u NO_COLOR -u COLORTERM -u CLICOLOR mise run check`
      green on the rebased tree (unit 1848, integration 184, contract 2397,
      bench 339, release-test 14) and pushed `--force-with-lease`; the three
      changes recorded under `## Blocked by`, `sync-blockers` reports the change
      fully unblocked; verification 4.4 and 5.1 observed;
      `harness-render.test.ts` 15 pass on the rebased tree
- [x] 5.2 Before editing any command file, re-take the wiring characterization
      on the rebased tree: run `harness-wiring.test.ts` under
      `COSPEC_GOLDEN_WRITE=1`, and record the built binary's
      `init --harness all` stdout for verification 3.8. Commit only the golden
      files and the ledger note, and record the sha in verification 3.7; verify
      `git diff main -- apps/cli/src/commands/` is empty at that commit ->
      `git diff --exit-code origin/main -- apps/cli/src/commands/` exits 0
      before and at this commit; `COSPEC_GOLDEN_WRITE=1` re-take of
      `harness-wiring.test.ts` 17 pass and wrote every golden byte-identically,
      so this commit carries only the ledger note (no golden file changed);
      built-binary `init --harness all --yes` -> 127 files, file-list digest
      equal to task 1.3's `c9ff1f08…6ff305`, normalized stdout
      `sha256:62918ecd…756a04` recorded in verification 3.7 and 3.8
- [x] 5.3 `init.ts`: build the `--harness` value set and invalid-value message
      from `HARNESS_NAMES`, replace `DETECT_PATHS` with each row's
      `detectionPaths`, walk the leftover sweep over the derived scan roots, and
      replace `RESTART_LINES` with each selected row's `setupNote` plus the
      `requiresIdeRestart` line. Commit; verify verification 3.1, 3.2 and 3.5
      pass -> commit `afc4b69f`: `VALID_HARNESS_MSG` built from `HARNESS_NAMES`
      (same sentence), `isDetected` over each row's `detectionPaths`, the opsx
      sweep over `scanRoots()`, and `setupNoteLines` (exported, `table` seam)
      printing each selected row's `setupNote` then `ideRestartLine`'s single
      restart line; `DETECT_PATHS` and `RESTART_LINES` deleted. `adapters.ts`
      gains `primaryRoot` and `ideRestartLine`. With update/doctor still
      unmodified: wiring test green (3.1, 3.2), `setup-notes.test.ts` 6 pass
      (3.5), typecheck and lint green
- [x] 5.4 `update.ts`: derive `SKILL_BASE`, `LEGACY_SKILL_BASE`, the marker
      (from `rulesPath`) and `MANAGED_REMOVAL_ROOTS` from the table, route
      manifest tracking on `frontmatter === null`, refuse a `scope: 'home'`
      file, and print the `requiresIdeRestart` line in the update receipt.
      Commit; verify verification 3.2, 3.3 and 3.6 pass -> commit `efd24ce8`:
      skills root, legacy roots and marker read from the row (`skillsRoot`,
      `legacySkillsRoots`, `rulesPath`),
      `MANAGED_REMOVAL_ROOTS = removalRoots()`, manifest routing on
      `frontmatter === null`, a `scope: 'home'` file refused before any write,
      `GenerateOptions.adapters` seam, and `updateRestartLine` printed after a
      write in the human receipt only; `SKILL_BASE`, `LEGACY_SKILL_BASE`,
      `HARNESS_MARKER` and the stale "mirrors canon/workflows/harness.yaml"
      comment deleted. Wiring test green (3.2, 3.3), `generate-rows.test.ts` 3
      pass (3.6), `update-restart.test.ts` 2 pass
- [x] 5.5 `doctor.ts`: derive its skill-base and command-location maps and its
      scan roots from the table, and attribute a file to the row whose primary
      root prefixes it. Commit; verify verification 3.4 passes -> commit
      `0b78f988`: `SKILL_BASE`/`COMMAND_LOC` replaced by the owning row's
      `skillsRoot`/`commandPath`, both walks over `scanRoots()`, and attribution
      by `primaryRoot`; `WORKFLOW_SKILL`'s comment now says it mirrors the
      `workflows:` block (workflow identity), which is still true, rather than
      implying tool layout lives there. Wiring doctor goldens match (3.4); a
      reversed scan order fails them (mutation check, reverted)
- [x] 5.6 No-behavior-change check for group 5: run `mise run test`,
      `mise run test:integration`, `mise run test:contract`,
      `mise run generate:check` and `mise run test:pack`, the golden diffs of
      verification 1.2 and 3.7, and the built-binary run of verification 3.8.
      Record the observed results for every row in verification sections 1 to 4.
      Commit the ledger; verify every existing suite is green, unchanged -> at
      HEAD `77db34ae`: `mise run test` 1860, `test:integration` 184,
      `test:contract` 2397 pass (all inside `mise run check`), `generate:check`
      no drift, `test:pack` 2 pass; golden diffs 1.2 (`e7725617`/`703fe1b` vs
      HEAD) and 3.7 (`46250568` vs HEAD) exit 0; the 3.8 built-binary run is
      identical to task 5.2's (file list and normalized stdout). Every row in
      verification sections 1 to 4 recorded `[x]`. The first suite run failed in
      node children only, from this shell's stale `NODE_OPTIONS` preload (see
      verification 1.5), and was re-run with it unset

## 6. Docs

Exclusive files: `docs/harness-integration.md`.

- [x] 6.1 Update `docs/harness-integration.md`: name `HARNESS_TABLE` in
      `harness/adapters.ts` as the one declaration of a tool's layout (what each
      field means, and that `harness.yaml` now carries workflow identity only),
      rewrite the "Restart lines" bullet as the per-row `setupNote` plus the
      `requiresIdeRestart` line, and keep the shared-root and legacy-migration
      bullets accurate to the derived fields. Commit; verify verification 5.2 ->
      added a paragraph naming `HARNESS_TABLE` in
      `apps/cli/src/harness/adapters.ts` as the one declaration of tool layout
      and `harness.yaml` as workflow identity only; reworded the shared-root and
      legacy bullets to cite
      `skillsDir`/`bodyDialect`/`legacySkillsDirs`/`rulesPath`; renamed "Restart
      lines" to "Setup notes" describing `setupNote` + `requiresIdeRestart`.
      `git diff --exit-code main -- apps/docs/` exits 0 (this change alters no
      user-facing behavior); `format:check` and `cospec validate --strict`
      green. The receipt wiring this page describes is T3's (held); the doc
      leads the code within this PR by design. After T3 landed, commit
      `77db34ae` brought the page to HEAD: what `init`, `update` and `doctor`
      read from the table, the manifest tracking of TOML commands, the
      home-scope refusal and update's restart line

## 7. Close-out

- [x] 7.1 Confirm every verification row is `[x]` with observed evidence, run
      `mise run cospec -- validate harness-adapter-table --strict` and
      `mise run check`. Commit the final ledger; verify verification 5.3 ->
      every verification row is `[x]` with observed evidence (no `[ ]` or `[~]`
      left); `validate harness-adapter-table --strict` passes; `mise run check`
      green at `77db34ae` (verification 5.3) and re-run on this ledger commit;
      re-run green at `211782d1` after the review fixes of group 8, and at
      `5acadf16` after the round-2 fixes 8.4–8.7, and at `8bc417dc` after the
      round-3 fixes 9.1–9.2 (verification 5.3)

## 8. Review fixes: commands still hard-coding a tool shape

- [x] 8.1 `update.ts`: match the orphan sweep's command-dir entries against the
      `extension` of the markdown-serializer rows rendering into each dir,
      leaving TOML dirs to the manifest; add the `.prompt` fixture-row cases to
      `generate-rows.test.ts`. Verify verification 3.9 -> `removeOrphanMarkdown`
      takes the table and builds a dir -> extensions map; the `.prompt` and
      TOML-dir cases fail on the literal `.md` filter and pass after it
- [x] 8.2 `doctor.ts`: attribute a file by primary root, then by any row surface
      (skills root, commands dir, rules dir), and match references with the
      owning row's `invocationPrefix` as well as `/`; give
      `harnessMarkdownFiles`/`checkDanglingRefs` a `table` seam and add
      `doctor-rows.test.ts`. Verify verification 3.10 -> `owningRow` and
      `referencePattern` in `doctor.ts`; the `@` and split-root cases fail
      before the change and pass after it; the four rows' doctor goldens are
      unchanged
- [x] 8.3 Narrow `docs/harness-integration.md` and `.agents/shared.md` so they
      say what the table drives and name what still sits outside it, then
      `mise run agents:sync`. Verify verification 5.4 -> both texts drop the "a
      new tool is only a new row" claim and name init's settings merge and
      `claude` default, the codex/agents receipt line and doctor's `.md`-only
      scan; `CLAUDE.md`/`AGENTS.md` re-synced
- [x] 8.4 `doctor.ts`: collect harness files by each row's shape from the table,
      never a literal `.md`: the skill file's extension under a dir holding a
      row's skills or legacy skills root, and each markdown-serializer row's
      `commands.extension` under its `commands.dir`, a TOML row's commands left
      to the manifest (decision 9), through `isHarnessDocument` in
      `adapters.ts`; export `checkStaleness` as a seam and add the `.prompt` and
      TOML fixture-row cases to `doctor-rows.test.ts`. Verify verification 3.11
      -> `harnessMarkdownFiles` walks the scan roots through `isHarnessDocument`
      and the dangling-ref check resolves skills through `skillPath`; the three
      `.prompt` cases fail on the literal `.md` filter and pass after it; the
      four rows' doctor goldens are unchanged
- [x] 8.5 `init.ts`: derive the receipt's shared-skills-root line from the rows
      whose resolved skills root is equal, not from the ids `codex` and
      `agents`, through an exported `sharedSkillsRootLines(harnesses, table)`;
      add the synthetic-row cases to `setup-notes.test.ts`. Verify verification
      3.12 -> one line per root two or more rows resolve to, naming every row on
      it in table order, printed when any selected row writes there; the
      synthetic-row cases fail on the id-keyed line and pass after it; the init
      receipt goldens are unchanged
- [x] 8.6 Sweep `init.ts`, `update.ts`, `doctor.ts` and `harness/` for a literal
      harness id, extension or root outside `HARNESS_TABLE`: init's opsx
      leftover scan reads files through `isHarnessDocument` (a `table` seam on
      `findOpsxFiles`, and on doctor's `checkOpsx`), and the skill filename
      comes from `SKILL_FILE` in `adapters.ts` (`render.ts` through `skillPath`,
      `update.ts`'s sentinel and orphan sweep, `legacy-skills.ts`); add the
      `.prompt` opsx cases to `doctor-rows.test.ts`. Verify verification 3.13 ->
      the init case fails on the literal `.md` filter and passes after it;
      render and wiring goldens unchanged; what remains is named in design.md as
      deliberate
- [x] 8.7 Record in design.md what stays outside the table on purpose (init's
      Claude-only settings merge, `claude` default and `/cospec:propose` hint
      under Non-Goals; openspec's `OPSX_SHARED_SKILL_ROOT` in Seam ownership)
      and the per-row file scan in decision 9; rewrite
      `docs/harness-integration.md` and `.agents/shared.md` so they no longer
      list the receipt line or doctor's scan as gaps, then
      `mise run agents:sync`. Verify verification 5.4 -> both texts name only
      the Claude-only behaviour as outside the table; `CLAUDE.md`/`AGENTS.md`
      re-synced; `apps/docs/` unchanged

## 9. Review fixes: doctor attribution and what the docs say the scan reads

- [x] 9.1 `doctor.ts`: attribute a file to the row with a surface (project or
      legacy skills root, commands dir, rules dir) that is the longest prefix of
      it; break a tie by primary root, then table order; fall back to the
      primary root only for a file on no surface. Add the nested-commands and
      legacy-root fixture rows to `doctor-rows.test.ts`. Verify verification
      3.14 -> the nested-commands and legacy-root cases fail on the
      primary-root-first `owningRow` and pass after it; the shared-root case and
      the existing `.agents/skills` case keep `agents`; the four rows' doctor
      goldens are unchanged
- [x] 9.2 Correct `docs/harness-integration.md`, design.md decision 9 and
      decision 12 and `.agents/shared.md`: the scan reads every `.md` file under
      a top-level dir holding a row's skills or legacy skills root, with what
      that means for user markdown and a `.github` row; doctor's longest-surface
      attribution; the legacy-skills migration, its receipt and `update --check`
      lines and doctor's `legacy-layout` warning cover only codex's
      `.codex/skills`; then `mise run agents:sync`. Verify verification 5.4 ->
      each text matches `isHarnessDocument`, `owningRow` and `legacy-skills.ts`;

## 10. Review fixes: remove the self-written Non-Goal mislabeling

- [x] 10.1 design.md's Non-Goals (Context) and decision 12 call the receipt's
      `/cospec:propose` hint and doctor's scan breadth deliberate, unreviewed
      self-assessments; an agent may not non-goal a defect it is the one
      reporting. Reclassify both as known defects on `main`, routed by ruling to
      the follow-on change `harness-receipt-and-doctor-scope`, not preserved on
      purpose by this one; sync `docs/harness-integration.md` and
      `.agents/shared.md`, then `mise run agents:sync`. Verify verification 5.5
      -> design.md no longer calls either one deliberate; both docs name them as
      known defects fixed by `harness-receipt-and-doctor-scope`; `CLAUDE.md`/
      `AGENTS.md` re-synced; `git diff --exit-code main -- apps/docs/` exits 0
      `CLAUDE.md`/`AGENTS.md` re-synced; `apps/docs/` unchanged
