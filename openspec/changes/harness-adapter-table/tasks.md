# Tasks

<!-- Each task ends in one commit. Groups 1 to 4 start now; group 5 waits for the three changes named in blocking-changes.md "Phase Gates". The archive is the branch's final commit, after 7.1. -->

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
- [ ] 1.3 Run `mise run build`, then `cospec init --harness all` with the built
      binary in a fresh temporary git repo, and record the sorted `sha256` list
      of the written files in verification 3.8. Commit the ledger note; verify
      the list has one entry per rendered file plus the schemas, config and
      settings the receipt names

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

- [ ] 3.1 Switch `renderHarnessFiles` to the rows: skills and command paths, the
      frontmatter builder and `injectArguments` from the row, the rules file
      from `rulesPath`, `scope` on `RenderedFile`, and a
      `RenderOptions.adapters` override. Delete `HarnessSurface`, the
      `harnesses:` block of `harness.yaml`, the `harness === …` branches, and
      the `opencode` dialect name (opencode's row uses `flat`, and the 2.2
      comparison retires with the block). Rebuild the render-conflict case on
      the override. Commit; verify verification 1.1, 1.4 and 2.8 pass
- [ ] 3.2 Add the pluggable serializer (`markdown` as today, `toml` with
      upstream's two escaping functions ported) and the per-row extension, with
      fixture-row tests for TOML, `.prompt`, `.prompt.md`, a split commands
      root, namespaced and flat filenames, the `@` prefix and home scope.
      Commit; verify verification 1.1, 2.4, 2.5, 2.6 and 2.7 pass

## 4. Track T4 (after): render equivalence checkpoint

Exclusive files: `openspec/changes/harness-adapter-table/verification.md`.

- [ ] 4.1 No-behavior-change check for groups 2 and 3: run `mise run test`,
      `mise run test:integration`, `mise run test:contract` and
      `mise run generate:check`, and the golden diffs of verification 1.2 and
      1.3. Record the observed results for verification 1.1 to 1.4, 2.1 to 2.9
      and 4.1 to 4.3 as they stand. Commit the ledger; verify every existing
      suite is green with no existing integration or contract test edited

## 5. Track T3: init, update and doctor read the table (gated)

Exclusive files: `apps/cli/src/commands/init.ts`,
`apps/cli/src/commands/update.ts`, `apps/cli/src/commands/doctor.ts`.

Starts only after `unknown-option-contract`, `upstream-spellings` and
`passthrough-json-and-doctor` have merged to `main`.

Order is fixed: rebase onto `main` (5.1), then re-take the wiring
characterization baseline on the rebased, unmodified tree (5.2), then implement
T3 (5.3 to 5.5), then compare against that baseline (5.6). The baseline is never
re-taken after any T3 edit.

- [ ] 5.1 Rebase the branch onto `main` (`--force-with-lease`). Record the three
      changes under `## Blocked by` in `blocking-changes.md` as checked,
      archived entries, and run `mise run cospec -- sync-blockers`. Commit;
      verify verification 4.4 and 5.1 pass and the group 1.1 render golden test
      is still green on the rebased tree
- [ ] 5.2 Before editing any command file, re-take the wiring characterization
      on the rebased tree: run `harness-wiring.test.ts` under
      `COSPEC_GOLDEN_WRITE=1`, and record the built binary's
      `init --harness all` stdout for verification 3.8. Commit only the golden
      files and the ledger note, and record the sha in verification 3.7; verify
      `git diff main -- apps/cli/src/commands/` is empty at that commit
- [ ] 5.3 `init.ts`: build the `--harness` value set and invalid-value message
      from `HARNESS_NAMES`, replace `DETECT_PATHS` with each row's
      `detectionPaths`, walk the leftover sweep over the derived scan roots, and
      replace `RESTART_LINES` with each selected row's `setupNote` plus the
      `requiresIdeRestart` line. Commit; verify verification 3.1, 3.2 and 3.5
      pass
- [ ] 5.4 `update.ts`: derive `SKILL_BASE`, `LEGACY_SKILL_BASE`, the marker
      (from `rulesPath`) and `MANAGED_REMOVAL_ROOTS` from the table, route
      manifest tracking on `frontmatter === null`, refuse a `scope: 'home'`
      file, and print the `requiresIdeRestart` line in the update receipt.
      Commit; verify verification 3.2, 3.3 and 3.6 pass
- [ ] 5.5 `doctor.ts`: derive its skill-base and command-location maps and its
      scan roots from the table, and attribute a file to the row whose primary
      root prefixes it. Commit; verify verification 3.4 passes
- [ ] 5.6 No-behavior-change check for group 5: run `mise run test`,
      `mise run test:integration`, `mise run test:contract`,
      `mise run generate:check` and `mise run test:pack`, the golden diffs of
      verification 1.2 and 3.7, and the built-binary run of verification 3.8.
      Record the observed results for every row in verification sections 1 to 4.
      Commit the ledger; verify every existing suite is green, unchanged

## 6. Docs

Exclusive files: `docs/harness-integration.md`.

- [ ] 6.1 Update `docs/harness-integration.md`: name `HARNESS_TABLE` in
      `harness/adapters.ts` as the one declaration of a tool's layout (what each
      field means, and that `harness.yaml` now carries workflow identity only),
      rewrite the "Restart lines" bullet as the per-row `setupNote` plus the
      `requiresIdeRestart` line, and keep the shared-root and legacy-migration
      bullets accurate to the derived fields. Commit; verify verification 5.2

## 7. Close-out

- [ ] 7.1 Confirm every verification row is `[x]` with observed evidence, run
      `mise run cospec -- validate harness-adapter-table --strict` and
      `mise run check`. Commit the final ledger; verify verification 5.3
