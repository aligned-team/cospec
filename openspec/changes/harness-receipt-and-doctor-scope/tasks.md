# Tasks

## 1. Baseline

- [x] 1.1 Confirm the worktree branch sits on `main` with #51
      (`harness-adapter-table`) merged and `cospec apply` exits 0. Verify
      `git log` shows `16598dad` as an ancestor.
- [ ] 1.2 Once this change's PR is open, record its number in `proposal.md`
      (Why) and in the verification ledger's header. Verify `grep -n '#'` finds
      it in both.

## 2. Receipt hint (tests first)

- [x] 2.1 Add unit tests for an exported `receiptHintLines`: - claude →
      `/cospec:propose`. - opencode → `/cospec-propose`. - codex and agents →
      `$cospec-propose (Codex) or /cospec-propose (other agents)`. - `[]` (none)
      → `/cospec:propose`. - `opencode,claude` → `/cospec-propose`. - A
      synthetic flat `@` row → `@cospec-propose`.

      Verify the opencode, codex, agents, explicit-order and `@` rows fail on
      the unmodified tree.

- [x] 2.2 Hand-edit only the two hint lines of
      `test/integration/__golden__/harness-wiring/init-receipts/{opencode,codex,agents}.txt`
      to the spelling in design decision 1. This is a ruled golden change
      (cospec-roadmap 2026-10-04), not a regeneration. Verify those three
      receipt tests fail on the unmodified tree and
      `{claude,all,default,none}.txt` are untouched.
- [x] 2.3 Share the canon workflow-manifest read between `render.ts` and
      `init.ts` (design decision 2) and verify the harness-render goldens and
      `generate:check` are unchanged.
- [x] 2.4 Implement `receiptHintLines` with `transformBody` over the first
      selected row's `bodyDialect` and `invocationPrefix`, and call it from
      `printReceipt`. Verify 2.1 and all seven init-receipt goldens pass.

## 3. Doctor scope (tests first)

- [x] 3.1 Add doctor unit tests (`test/unit/init/doctor.test.ts` and
      `doctor-rows.test.ts`): - A user `.claude/notes.md` with `/cospec:foo` and
      no frontmatter gives no finding. - A nested worktree under
      `.claude/worktrees/wt/` gives no finding. Its copies of
      `.claude/skills/cospec-propose/SKILL.md` and
      `.claude/commands/cospec/propose.md` carry `generatedBy: cospec@0.0.1` and
      `/cospec:not-a-real-workflow`. - `.claude/commands/cospec/propose.md`
      referencing `/cospec:not-a-real-workflow` is still a `dangling-ref`
      ERROR. - `.claude/skills/x/y/SKILL.md` is not a harness document. -
      `.codex/skills/<skill>/SKILL.md` still is.

      Verify the two false-positive rows fail on the unmodified tree.

- [x] 3.2 Flip `test/unit/harness/adapters.test.ts`'s
      `isHarnessDocument('<root>/notes/anything.md')` assertion to `false`,
      citing the ruling in the test name. Add shape rows for a nested worktree
      path, a deeper `SKILL.md`, and a namespaced and a flat command path.
      Verify the flipped row fails on the unmodified tree.
- [x] 3.3 Narrow `isHarnessDocument` to the two shapes of design decision 4 and
      rewrite its docstring. Verify 3.1 and 3.2 pass and the doctor `human.json`
      and `json.json` goldens are unchanged.
- [x] 3.4 Move the leftover-scan predicate and walker into `init.ts`
      (`isLeftoverCandidate`, `leftoverScanFiles`, today's breadth) and point
      `findOpsxFiles` and doctor's `checkOpsx` at it. Drop
      `harnessMarkdownFiles`'s extra `.agents/skills` walk. Verify every
      existing opsx row passes unchanged: - `init.test.ts` opsx rows. -
      `doctor.test.ts` opsx and overlap rows. - `doctor-rows.test.ts` "opsx
      leftover scans read each row's command extension". - The doctor goldens.
- [x] 3.5 Add a regression row that the leftover scan still finds an
      openspec-authored `.claude/commands/opsx/propose.md` and
      `.opencode/commands/opsx-propose.md`, the paths the pinned 1.13.1 dist
      writes (`core/command-generation/adapters/{claude,opencode}.js`), in both
      `findOpsxFiles` and `checkOpsx`. Verify it passes before and after.

## 4. Docs

- [x] 4.1 `apps/docs/guide/harness-setup.md`: state that `cospec init`'s closing
      `Try:` hint uses the first selected harness's spelling, and what `none`
      prints. Verify `mise run docs:build` exits 0.
- [x] 4.2 `apps/docs/reference/commands.md` `cospec doctor` row: name the
      boundary of the harness checks (`<skills-root>/<skill>/SKILL.md` and the
      table's command paths) and the BREAKING note (user markdown and nested
      worktree copies are no longer checked). Verify with `docs:build`.
- [x] 4.3 `docs/harness-integration.md`: rewrite the two "known defect …
      follow-on change `harness-receipt-and-doctor-scope`" passages to describe
      the corrected behaviour. Verify `grep -n 'known defect'` finds neither
      passage.

## 5. Agent docs

- [x] 5.1 `.agents/shared.md`: replace the "known defects on `main` … the
      follow-on change `harness-receipt-and-doctor-scope` fixes both" sentence
      with the corrected behaviour, then `mise run agents:sync`. Verify
      `mise run agents:check` exits 0 and `CLAUDE.md`/`AGENTS.md` carry the same
      text.

## 6. Release notes

- [ ] 6.1 Write the fix commit's body with a release-note paragraph that relays
      the proposal's BREAKING list (receipt hint for opencode/codex/agents;
      doctor's narrowed harness checks), with no `!` and no `BREAKING CHANGE:`
      footer (design decision 6). Verify with `git log -1 --format=%B`.
- [ ] 6.2 Relay the same BREAKING list verbatim in the PR body, which becomes
      the squash commit communique reads. Verify with `gh pr view --json body`.

## 7. Gate and archive

- [ ] 7.1 `mise run check` exits 0. Record the counts in the verification
      ledger.
- [ ] 7.2
      `mise run cospec -- validate harness-receipt-and-doctor-scope --strict` is
      clean and every verification row is `[x]` with observed evidence.
- [ ] 7.3 `mise run cospec -- archive harness-receipt-and-doctor-scope` as the
      final commit on the PR branch, before merge. Verify the change dir moved
      under `openspec/changes/archive/` and the `harness-workflows` spec gained
      both requirements.
