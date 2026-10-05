# Verification

## 1. Baseline reproduces both defects [critical]

- [x] 1.1 @manual (agent) `16598dad` is an ancestor of this branch and `cospec apply opsx-leftover-scan-scope` exits 0 -> `git merge-base --is-ancestor 16598dad HEAD` exit 0; `cospec apply` exit 0, gate clear
- [x] 1.2 @manual (agent) plant a `.claude/worktrees/<name>/.git` + a real opsx command leftover inside it, run `findOpsxFiles` on the unmodified source -> listed `[{relpath:".claude/worktrees/wt/.claude/commands/opsx/apply.md"}]` (defect reproduced, then fixed)
- [x] 1.3 @manual (agent) plant a real-shape OpenCode opsx leftover (description-only frontmatter + the literal body marker), run `findOpsxFiles` on the unmodified source -> returned `[]`, not listed (defect reproduced, then fixed in group 3)

## 2. Leftover scan does not cross a nested worktree boundary [critical]

- [x] 2.1 @regression (agent) unit row: a nested-worktree leftover fails (wrongly listed) before the fix and passes (not listed) after -> red before `isNestedWorktreeRoot` existed (confirmed by hand), green after (`bun test apps/cli/test/unit/init/doctor-rows.test.ts`: 26 pass, 0 fail)
- [x] 2.2 @unit (agent) a sibling openspec-authored leftover outside any nested worktree is still listed and removed -> `bun test` green (`a sibling leftover outside any nested worktree is still (and only) found`)
- [x] 2.3 @unit (agent) doctor's `opsx-leftover` finding over the same fixture names no path under `.claude/worktrees/` -> `bun test` green (`doctor's opsx-leftover never names a path under .claude/worktrees/`)

## 3. OpenCode command leftovers are detected by their own shape [critical]

- [x] 3.1 @regression (agent) unit row: a real-shape OpenCode opsx leftover fails `isOpsxMarkdown`/`findOpsxFiles` before the fix and passes after -> confirmed red by hand against unfixed source (returned `[]`); green after (`bun test`: 118 pass, 0 fail)
- [x] 3.2 @unit (agent) a user-authored file at the same path with the same description-only frontmatter but no body marker is never listed, before or after the fix -> `bun test` green on both (`a user file at the same path shape with no body marker is never listed`)
- [x] 3.3 @unit (agent) doctor's `opsx-leftover` fires on the real OpenCode shape via the shared `isOpsxMarkdown`, and the existing row-3.2 hand-made OpenCode fixture (`name: "OPSX: …"`) is unchanged -> `bun test` green, `the opsx leftover scan still reads upstream's legacy command paths` suite unedited and passing
- [x] 3.4 @integration (agent) the real pinned 1.13.1 binary's `init --tools opencode` output (contract suite), run through `cospec init --remove-opsx` in a sandboxed temp repo, is detected and removed -> `apps/cli/test/contract/opsx-opencode-leftover.test.ts`: 2 pass, 0 fail (11 expect() calls) against the pinned 1.13.1 binary

## 4. No regression on existing leftover-scan behavior

- [x] 4.1 @unit (agent) the full existing opsx unit suite passes unchanged -> `init.test.ts` + `doctor-rows.test.ts`: 47 pass, 0 fail (104 expect() calls); no pre-existing row edited
- [x] 4.2 @integration (agent) `vanilla-legacy.test.ts`'s `--remove-opsx` coexistence test passes unchanged -> 3 pass, 0 fail (13 expect() calls)

## 5. Docs and gate

- [x] 5.1 @manual (agent) `docs/harness-integration.md` and `apps/docs`'s harness-setup/commands pages state the nested-worktree boundary and the OpenCode detection shape, `.agents/shared.md` updated and `mise run agents:sync` run -> pages read and confirmed; `mise run docs:build` exits 0; `mise run agents:check` reports "All shared blocks are in sync."; `mise run generate:check` reports "no drift"
- [ ] 5.2 @manual (agent) `mise run check` exits 0 -> <pass/fail counts per suite>
