# Verification

## 1. Baseline reproduces both defects [critical]

- [ ] 1.1 @manual (agent) `16598dad` is an ancestor of this branch and `cospec apply opsx-leftover-scan-scope` exits 0 -> <git merge-base + exit code>
- [ ] 1.2 @manual (agent) plant a `.claude/worktrees/<name>/.git` + a real opsx command leftover inside it, run `findOpsxFiles` on the unmodified source -> it lists the nested file (defect reproduces)
- [ ] 1.3 @manual (agent) plant a real-shape OpenCode opsx leftover (description-only frontmatter + the literal body marker), run `findOpsxFiles` on the unmodified source -> it does NOT list the file (defect reproduces)

## 2. Leftover scan does not cross a nested worktree boundary [critical]

- [ ] 2.1 @regression (agent) unit row: a nested-worktree leftover fails (wrongly listed) before the fix and passes (not listed) after -> `bun test` red before, green after
- [ ] 2.2 @unit (agent) a sibling openspec-authored leftover outside any nested worktree is still listed and removed -> `bun test` green
- [ ] 2.3 @unit (agent) doctor's `opsx-leftover` finding over the same fixture names no path under `.claude/worktrees/` -> `bun test` green

## 3. OpenCode command leftovers are detected by their own shape [critical]

- [ ] 3.1 @regression (agent) unit row: a real-shape OpenCode opsx leftover fails `isOpsxMarkdown`/`findOpsxFiles` before the fix and passes after -> `bun test` red before, green after
- [ ] 3.2 @unit (agent) a user-authored file at the same path with the same description-only frontmatter but no body marker is never listed, before or after the fix -> `bun test` green on both
- [ ] 3.3 @unit (agent) doctor's `opsx-leftover` fires on the real OpenCode shape via the shared `isOpsxMarkdown`, and the existing row-3.2 hand-made OpenCode fixture (`name: "OPSX: …"`) is unchanged -> `bun test` green
- [ ] 3.4 @integration (agent) the real pinned 1.13.1 binary's `init --tools opencode` output (contract suite), run through `cospec init --remove-opsx` in a sandboxed temp repo, is detected and removed -> `bun test` green against the pinned binary

## 4. No regression on existing leftover-scan behavior

- [ ] 4.1 @unit (agent) the full existing opsx unit suite passes unchanged -> `bun test` green, no existing row edited
- [ ] 4.2 @integration (agent) `vanilla-legacy.test.ts`'s `--remove-opsx` coexistence test passes unchanged -> `bun test` green

## 5. Docs and gate

- [ ] 5.1 @manual (agent) `docs/harness-integration.md` and `apps/docs`'s harness-setup/commands pages state the nested-worktree boundary and the OpenCode detection shape -> pages read and confirmed
- [ ] 5.2 @manual (agent) `mise run check` exits 0 -> <pass/fail counts per suite>
