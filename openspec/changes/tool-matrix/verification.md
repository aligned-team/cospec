# Verification

## 1. Each new tool's generated tree matches the pinned binary's [critical]

- [ ] 1.1 @integration (agent) `mise run test:contract -- test/contract/harness-matrix.test.ts` -> all 35 new rows and the 4 existing rows pass with no `test.failing` left: row fields equal the pinned `AI_TOOLS` entry (`detectionPaths` = `detectionPaths ?? [skillsDir]`, setup note includes upstream's), and each render matches `upstream-init/<id>.json` by design decision 14's rule
- [ ] 1.2 @e2e (agent) for each of the 35 new ids, `cospec init --tools <id>` in a fresh git repo in a throwaway sandbox (private `HOME`, `XDG_*`, `CODEX_HOME`, `ZDOTDIR`, `EDITOR=true`), tree listed and compared to `upstream-init/<id>.json` -> identical tool-file path set after `opsx`→`cospec` and `openspec-`→`cospec-` respelling, identical scope and wrapper rule; the only differences are the documented deltas (cospec canon bodies, `COSPEC:` names, cospec `tags`, `metadata` provenance, `.cospec-target` instead of `.openspec-target`, cospec's own `openspec/` tree)
- [ ] 1.3 @e2e (agent) `cospec init --tools windsurf` and `cospec init --tools devin` in two fresh sandbox repos -> byte-identical trees and receipts naming `devin`
- [ ] 1.4 @e2e (agent) `cospec init --harness all` in a fresh sandbox repo compared to `upstream-init/combo-all.json` -> every row's files present per 1.2's rule, `~/.minimax/skills` written under the sandbox `HOME` only, receipt hint `/cospec:propose`
- [ ] 1.5 @manual (human) open a repo initialised with `--harness cursor,gemini,cline,kiro` in Cursor, Gemini CLI, Cline and Kiro -> each lists the cospec commands (`/cospec-propose`, `/cospec:propose`, the Cline workflow, the Kiro prompt) and the skills load

## 2. The four existing rows are byte-identical to main [critical]

- [ ] 2.1 @regression (agent) `git diff --exit-code 72ce24a7 HEAD -- apps/cli/test/unit/__golden__/harness-render/{claude,codex,opencode,agents,all}` -> exit 0
- [ ] 2.2 @integration (agent) `mise run test:integration -- test/integration/harness-wiring` with the receipt goldens diffed against the baseline -> only the `Harness:` list of `all`, the shared-root line of `codex`/`agents`/`all`, and the `all` setup notes and IDE-restart line changed; no rendered file changed
- [ ] 2.3 @integration (agent) `mise run generate:check` on the repo itself -> clean, and the repo's own `.claude/`, `.agents/skills/`, `.codex/`, `.opencode/` are unchanged apart from the new `.agents/skills/.cospec-target`

## 3. Shared .agents/skills root is written once and arbitrated [critical]

- [ ] 3.1 @e2e (agent) `cospec init --harness codex,agents,zed,antigravity` in a fresh sandbox repo -> 12 `.agents/skills/cospec-*/SKILL.md`, 12 `.agents/workflows/cospec-*.md`, one `.codex/rules/cospec.rules`, one `.agents/skills/.cospec-target` containing `codex`; no path written twice; matches `upstream-init/combo-shared-agents.json` by 1.2's rule
- [ ] 3.2 @integration (agent) marker persistence: marker `agents`, `cospec init --harness agents,zed`, then `cospec update --json` -> skills rendered for `agents`, marker unchanged, update detects `agents` only; `--harness antigravity` alone -> flat `/cospec-<id>` skill references and marker `antigravity`
- [ ] 3.3 @unit (agent) `shared-root.test.ts` precedence matrix -> marker, pre-marker evidence (rules file, legacy `.codex/skills`), current skills → agents, codex, table order, and the skills-native preference each decide the cases upstream's do

## 4. Detection round-trips for every row [critical]

- [ ] 4.1 @integration (agent) for each of the 39 rows: `cospec init --harness <id>` in a fresh repo, then `cospec update --json` and a bare `cospec init --json` -> both detect exactly `<id>` (for `.agents` rows, the arbitrated writer plus any row with its own surface); `cospec doctor` reports no harness finding; `cospec update --check` exits 0
- [ ] 4.2 @integration (agent) codex alignment scenarios -> an `.agents/` without skills selects nothing; `.agents/skills/cospec-propose/SKILL.md` alone selects `agents`; a bare `.codex/config.toml` selects nothing; a codex install with its rules file selects `codex`

## 5. update --check, doctor and removal work on each new row [critical]

- [ ] 5.1 @integration (agent) per new row: hand-edit one generated skill and one generated command (frontmatter-less ones included) -> `cospec update --check` exits 1 naming them, doctor reports `drift`, `cospec update` keeps the edits with `.cospec-new` sidecars, `--force` restores canon
- [ ] 5.2 @integration (agent) per new row: plant a cospec-authored command and skill for a workflow canon does not emit, plus a user file beside them -> `cospec update` removes the two cospec files (manifest entry for frontmatter-less rows) and leaves the user file
- [ ] 5.3 @integration (agent) per new row: plant the pinned binary's live `init --tools <id>` output, run `cospec doctor` then `cospec init --harness <id> --remove-opsx` -> doctor names every file that output wrote under the tool's directories as `opsx-leftover`; removal deletes exactly those and no cospec file

## 6. A write failure is isolated [critical]

- [x] 6.1 @e2e (agent) `.cursor` mode 000, `cospec init --harness claude,cursor --json` in a sandbox repo -> every `.claude/` file written, `failed` lists the `.cursor/` paths with `EACCES`, exit 1; after `chmod 755`, `cospec update` writes them and exits 0 -> test/integration/write-failure.test.ts passes: exit 1, every `failed` path under `.cursor/` with an `EACCES:` error, `.claude/` written; after chmod `update` exits 0 and writes `.cursor/` (the manifest's `retry` ledger names the harness, since none of its files exist to be detected)
- [x] 6.2 @unit (agent) `generate()` with a write stub throwing `ENOSPC` -> the error propagates, nothing is recorded as `failed` -> test/unit/errno-isolation.test.ts: `isolatedWriteFailure` returns nothing for `ENOSPC` (and `EMFILE`, `ENOENT`, `ELOOP`, `EBUSY`), which `generate()` rethrows; test/unit/init/write-failure.test.ts: a self-referencing `.cursor` symlink (`ELOOP`) throws out of `generate()`

## 7. The home skills root [critical]

- [ ] 7.1 @e2e (agent) `cospec init --harness minimax-code` with `HOME` a temp dir and `USERPROFILE` unset -> 12 skills under `<HOME>/.minimax/skills/cospec-*/SKILL.md`, none in the project; repeated with `USERPROFILE` set to a second temp dir -> skills under `<USERPROFILE>/.minimax/skills/` only
- [ ] 7.2 @integration (agent) `cospec update --check` and `cospec doctor` after 7.1 -> exit 0, the home root is read and not written (mtimes unchanged); an orphaned cospec skill there is removed by `cospec update`, a user skill is not

## 8. Legacy tool roots and Codex global prompts

- [ ] 8.1 @integration (agent) `.kimi/skills/openspec-*` + `cospec init --harness kimi` -> moved to `.kimi-code/skills/`, `.kimi/` removed when empty, receipt and `migration` report it; same for `.agent` → `.agents` (antigravity) and OpenSpec's `.codex/skills/openspec-*` → `.agents/skills` (codex, after generation)
- [ ] 8.2 @integration (agent) `.windsurf/workflows/opsx-*.md` plus a user workflow, then `cospec init --harness devin`, and separately `cospec update --json` with devin detected -> both move the OpenSpec files to `.devin/workflows/` without asking; the user workflow stays; a differing destination is kept and reported
- [ ] 8.3 @manual (human) `cospec update` on a real terminal with `.windsurf` OpenSpec content -> the yes/no question appears; "no" leaves `.windsurf` and reports it; `--force` skips the question
- [ ] 8.4 @integration (agent) `CODEX_HOME` = temp dir holding `prompts/opsx-apply.md` and `prompts/my-prompt.md`; `cospec init --harness codex --remove-opsx` -> `opsx-apply.md` listed with `scope: "home"` and removed after `.agents/skills/cospec-apply-change/SKILL.md` exists, `my-prompt.md` kept; with `--harness claude` nothing listed; the real home directory untouched

## 9. Pre-opsx leftovers are found for every tool

- [ ] 9.1 @integration (agent) for every `LEGACY_SLASH_COMMAND_PATHS` entry that has a row (`.opencode/command/` and `.qwen/commands/*.toml` included), a marker-carrying fixture -> reported by doctor and `init --json` `opsx.found`, removed by `--remove-opsx`; a same-named file without the markers is not; a directory entry holding a user file keeps the folder

## 10. Reachability and the table-only rule [critical]

- [ ] 10.1 @integration (agent) `mise run test:contract -- test/contract/reachability.test.ts` -> passes; `parity-pending.yaml` has no `tool-matrix` entry; the only pending `tool` is `github-copilot`; `windsurf` resolves through `HARNESS_ID_ALIASES` to `devin`
- [ ] 10.2 @integration (agent) `cospec init --tools universal` in a sandbox repo -> exit 1, `universal` named invalid, the fallback hint line spelled `--tools`, nothing written; with `--harness universal` the hint is spelled `--harness`
- [ ] 10.3 @unit (agent) `no-tool-branches.test.ts` -> no `HARNESS_TABLE` id literal in `apps/cli/src/commands/` outside the documented Claude-only lines

## 11. The oracle fixtures reproduce

- [ ] 11.1 @integration (agent) `mise run test:contract -- test/contract/upstream-init-fixtures.test.ts` -> a fresh capture from the pinned binary equals every committed `apps/cli/test/fixtures/upstream-init/*.json`, every field (stdout, stderr, exit code, each file's path, scope, bytes, sha256 and head) equal after parsing

## 12. Agents load the new rows' bodies

- [ ] 12.1 @eval (human) `COSPEC_EVAL_HARNESS=<id> mise run eval:e2e` (advisory; DeepSeek key held by the maintainer) once per new skill spelling — `cursor` (flat), `hermes` (skill), `kimi` (`/skill:`), `rovodev` (prose) — and once with the default `claude` -> each run's scores are within the eval's noise band of the `claude` run, and no scenario reports the agent invoking a workflow by a spelling the rendered bodies do not register

## 13. Docs and agent guidance

- [ ] 13.1 @integration (agent) `mise run docs:build` -> passes; `apps/docs/guide/harness-setup.md`'s target table lists all 39 `HARNESS_TABLE` ids with their paths, invocation, restart and setup note, and no longer says nothing is written under the home directory; `apps/docs/reference/commands.md` documents `windsurf`, the fallback hint, `failed`/exit 1 and `update`'s question
- [ ] 13.2 @integration (agent) `mise run agents:check` -> passes with `.agents/shared.md`'s table-only rule synced into `CLAUDE.md` and `AGENTS.md`

## 14. Full gate [critical]

- [ ] 14.1 @integration (agent) `mise run check` -> passes (lint, format, typecheck, unit, contract, integration, generate:check, agents:check, docs build)
- [ ] 14.2 @runtime (agent) `mise run test:pack` and the built binary's `init --harness all` in a sandbox repo -> the compiled binary writes the same tree as the source run in 1.4
