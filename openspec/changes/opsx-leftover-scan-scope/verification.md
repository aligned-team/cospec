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
- [x] 5.2 @manual (agent) `mise run check` exits 0 -> see 6.4 (the gate was re-run after the review-finding fixes in group 6 below; this row's own run folded into that one)

## 6. Review-finding fixes (post-review)

- [x] 6.1 @regression (agent) unit rows: a symlinked `.claude` scan root, and a symlinked `.agents/skills` root (`.agents` itself real), each pointing outside the project and holding a real openspec-authored leftover, are listed by `findOpsxFiles`/removed by `--remove-opsx` before the fix and are not listed/not removed after -> confirmed red against unfixed source (both files `.claude/commands/opsx/apply.md` and `.agents/skills/openspec-propose/SKILL.md` appeared in `opsx.found`); green after (`bun test apps/cli/test/unit/init/init.test.ts`: all pass)
- [x] 6.2 @unit (agent) a user-authored OpenCode command at an id the pinned dist never generates (`opsx-status.md`), and a real-id (`opsx-propose.md`) lookalike carrying only the bare `` `openspec list --json` `` substring without the `PROJECT_ROOT_GUARD` lead sentence, are never listed, before or after the fix; each fixture is rejected by its own check, the former by the id restriction (row 6.5 isolates it with a guard-carrying body) and the latter by the lead-sentence requirement -> confirmed red against unfixed source (both wrongly listed); green after (`bun test apps/cli/test/unit/init/doctor-rows.test.ts`: all pass)
- [x] 6.3 @manual (agent) design.md/spec.md updated for both fixes (symlink containment Decision 4 + spec requirement/scenarios; OpenCode Decision 2 rewritten for the id allowlist + full guard-lead sentence), `.agents/shared.md`/`docs/harness-integration.md`/`apps/docs` harness-setup+commands pages updated, `mise run agents:sync` run -> `mise run agents:check`: in sync; `mise run generate:check`: no drift
- [x] 6.4 @manual (agent) `mise run check` green after the review-finding fixes, rebased on 72ce24a7 -> exit 0: unit 2044 pass/0 fail, integration 193/0, contract 2682/0, bench 343/0, e2e release 14/0; `cospec validate opsx-leftover-scan-scope --strict` clean (0 errors, 0 warnings)
- [x] 6.5 @unit (agent) a user file at the never-generated id `.opencode/commands/opsx-status.md` carrying the FULL `PROJECT_ROOT_GUARD` lead sentence and `` `openspec list --json` `` is never listed, and the same body at the real id `opsx-propose.md` is -> `doctor-rows.test.ts`: both rows pass; confirmed red with the id allowlist relaxed to `opsx-[^/]+` (the status row wrongly listed), restored after
- [x] 6.6 @regression (agent) doctor's `stale-sidecar` check and `harnessMarkdownFiles` do not cross a nested worktree (`.git` entry) and do not follow a symlinked `.claude` outside the project; the project's own sidecar/harness file is still found -> `doctor.test.ts` "scans stay inside the project": 5 rows; 4 red against the unmodified walks (nested-worktree sidecar reported, symlinked-root sidecar and harness file read, nested checkout at a harness path read), all green after
- [x] 6.7 @manual (agent) docs and guidance state the shared boundary (`docs/harness-integration.md`, `apps/docs` commands doctor row and harness-setup page, `.agents/shared.md`, this change's design Decision 5 and spec requirement) -> `mise run agents:check`, `generate:check` and `docs:build` clean
- [x] 6.8 @manual (agent) `mise run check` green after the round-2 review-finding fixes -> unit 2051 pass/0 fail, integration 193/0, bench 343/0, e2e release 14/0, contract 2682/0 (one run hit a Bun segfault in the pinned binary's oracle on row 7.5, which passes alone; the suite was re-run whole and passed); lint, format, typecheck, generate:check, agents:check, vendor check, validate-all and schema:validate clean; `cospec validate opsx-leftover-scan-scope --strict` clean. Run with `TZ=UTC`, since the archive contract rows compare a date computed in the suite's UTC zone with one a child stamps in the machine's local zone, and disagree on local evenings west of UTC
