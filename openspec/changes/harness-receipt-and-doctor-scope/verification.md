# Verification

"Before" is `main` at `16598dad` (#51 merged). Every CLI run that writes uses a
throwaway sandbox with HOME and XDG\_\* pointed into it.

## 1. The receipt hint follows the first selected harness [critical]

- [ ] 1.1 @regression (agent) `cospec init --harness opencode` receipt (integration golden `init-receipts/opencode.txt`) -> before: ends `Try: /cospec:propose …`; after: ends `Try: /cospec-propose "feat: <what you want to build>"` and `Lightweight change? /cospec-propose "ci: fix release workflow" — 3 short artifacts.`
- [ ] 1.2 @regression (agent) `cospec init --harness codex` receipt (golden `init-receipts/codex.txt`) -> before: `/cospec:propose`; after: ends `Try: $cospec-propose (Codex) or /cospec-propose (other agents) "feat: <what you want to build>"` and the matching `Lightweight change?` line
- [ ] 1.3 @regression (agent) `cospec init --harness agents` receipt (golden `init-receipts/agents.txt`) -> before: `/cospec:propose`; after: the same shared-dialect lines as 1.2
- [ ] 1.4 @integration (agent) `cospec init --harness claude` receipt (golden `init-receipts/claude.txt`) -> byte-identical to `main`, ends `Try: /cospec:propose …`
- [ ] 1.5 @equivalence (agent) `--harness all` and the fresh-repo default receipts (goldens `all.txt`, `default.txt`) and `--harness none` (`none.txt`) -> byte-identical to `main`; `git diff main -- apps/cli/test/integration/__golden__/harness-wiring/init-receipts/{all,default,none,claude}.txt` is empty
- [ ] 1.6 @unit (agent) `receiptHintLines` per dialect: claude canonical, opencode flat, codex and agents shared, `[]` canonical, `opencode,claude` flat, and a synthetic flat `@` row giving `@cospec-propose` -> each row passes. Before the fix, the opencode, codex, agents, explicit-order and `@` rows fail.

## 2. Doctor checks only files cospec writes [critical]

- [ ] 2.1 @regression (agent) initialized repo plus a user `.claude/notes.md` (no frontmatter) mentioning `/cospec:foo`, `cospec doctor` and `cospec doctor --json` -> before: a `dangling-ref` ERROR naming `.claude/notes.md`, exit non-zero; after: no finding names `.claude/notes.md`, exit 0
- [ ] 2.2 @regression (agent) initialized repo plus a nested worktree copy under `.claude/worktrees/wt/` (`.claude/skills/cospec-propose/SKILL.md` and `.claude/commands/cospec/propose.md` with `generatedBy: cospec@0.0.1` and `/cospec:not-a-real-workflow`), `cospec doctor` -> before: `stale-harness`, `mixed-versions` and `dangling-ref` findings under `.claude/worktrees/`; after: no `stale-harness`, `mixed-versions` or `dangling-ref` finding names a path under `.claude/worktrees/` (the unchanged leftover scan and `stale-sidecar` walk are not part of this row)
- [ ] 2.3 @unit (agent) positive row: `.claude/commands/cospec/propose.md` referencing `/cospec:not-a-real-workflow` -> a `dangling-ref` ERROR naming that file, before and after; the doctor integration goldens (`doctor/human.json`, `doctor/json.json`, which carry `.claude/commands/cospec/opsx-and-dangling.md`'s dangling ref) are unchanged
- [ ] 2.4 @unit (agent) `isHarnessDocument` shape rows -> `<root>/skills/<skill>/SKILL.md` and `.codex/skills/<skill>/SKILL.md` true; `<root>/notes/anything.md`, `.claude/worktrees/wt/.claude/skills/x/SKILL.md` and `.claude/skills/x/y/SKILL.md` false; `.claude/commands/cospec/propose.md` and `.opencode/commands/cospec-propose.md` true; the synthetic `.prompt` and TOML row tests in `doctor-rows.test.ts` unchanged and passing

## 3. opsx leftover detection is unchanged

- [ ] 3.1 @unit (agent) every existing opsx row: `init.test.ts`, `doctor.test.ts` (including the `.agents` overlap-once row) and `doctor-rows.test.ts`'s `.prompt` leftover rows -> pass unmodified
- [ ] 3.2 @unit (agent) openspec-authored `.claude/commands/opsx/propose.md` and `.opencode/commands/opsx-propose.md` (pinned 1.13.1 adapter paths) -> listed by `findOpsxFiles` and warned by `checkOpsx`, before and after

## 4. Docs and agent docs

- [ ] 4.1 @manual (agent) `apps/docs/guide/harness-setup.md` -> states that the receipt's `Try:` hint uses the first selected harness's spelling (and `none` keeps `/cospec:propose`); `mise run docs:build` exits 0
- [ ] 4.2 @manual (agent) `apps/docs/reference/commands.md` `cospec doctor` row -> names the harness-check boundary and the BREAKING note for user markdown and nested worktree copies; `mise run docs:build` exits 0
- [ ] 4.3 @manual (agent) `docs/harness-integration.md` and `.agents/shared.md` -> neither still calls the hint or the scan breadth a known defect; both describe the corrected behaviour; `mise run agents:check` exits 0
- [ ] 4.4 @manual (agent) the fix commit body and the PR body -> each relays the proposal's BREAKING list, with no `!` and no `BREAKING CHANGE:` footer

## 5. Gate

- [ ] 5.1 @integration (agent) `mise run check` -> exit 0, with unit, integration, contract, bench and release counts and 0 fail recorded
- [ ] 5.2 @integration (agent) `mise run cospec -- validate harness-receipt-and-doctor-scope --strict` -> clean
