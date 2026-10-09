# Verification

"Before" is `main` at `72ce24a7` (v0.9.0). Every CLI run that writes uses a
throwaway sandbox with HOME, XDG\_\*, CODEX_HOME, USERPROFILE and ZDOTDIR pointed
into it. The pinned binary is `apps/cli/node_modules/.bin/openspec` (1.13.1),
run through `test/contract/support/upstream-oracle.ts`.

## 1. The pending entries are gone [critical]

- [ ] 1.1 @regression (agent) `bun test test/contract/reachability.test.ts` -> before: `parity-pending.yaml` carries `{ kind: tool, id: github-copilot }`, `{ kind: flag, path: [init], flag: --copilot-cloud }` and `--no-copilot-cloud`; after: all three are deleted and the walk resolves each (the tool through `HARNESS_TABLE`, the flags through the command table) with no pending entry
- [ ] 1.2 @integration (agent) `cospec init --copilot-cloud .` and `cospec init --no-copilot-cloud .` in a temp repo -> before: exit 1, `cospec init: '--copilot-cloud' is not supported yet`; after: neither prints that, `cospec init --help` and `cospec completion generate zsh` list both flags
- [ ] 1.3 @unit (agent) the four tests that asserted pending (`command-table.test.ts` `EXPECTED_PENDING`, `completions.test.ts`, `cli.test.ts`, `unknown-option-differential.test.ts`) -> pass in their handled form, and the `EXPECTED_PENDING` list no longer names `github-copilot`

## 2. The precedence matrix matches upstream row for row [critical]

- [ ] 2.1 @equivalence (agent) `test/contract/copilot-cloud.test.ts` tier 1 cells: `--copilot-cloud`, `--no-copilot-cloud`, both orders, with a persisted `true`, `false` and no config -> for each cell the pinned binary and cospec agree on which cloud paths exist, the persisted value, the removed count, the sentences (with `openspec` read as `cospec`) and the exit code; the last flag wins in both orders
- [ ] 2.2 @equivalence (agent) tier 2 and 3 cells: persisted `true` with no flag, persisted `false` with and without managed files present, managed files present with no config key (config stays keyless), malformed `cloudAgent` -> binary and cospec agree on every cell, including that a persisted `false` beats files on disk
- [ ] 2.3 @equivalence (agent) tier 5 and the pre row: nothing decided with no terminal prints the `Skipped GitHub Copilot cloud files (opt-in). Enable with 'cospec init --copilot-cloud'.` line and persists nothing; `--harness claude --copilot-cloud` and `--no-copilot-cloud` print the ignored-flag sentence, exit 0, write nothing -> agree with the binary's cells
- [ ] 2.4 @unit (agent) tier 4 with an injected terminal and answer stream -> `y` writes both files and persists `true`; empty, `n` and EOF write nothing and persist `false`; no prompt with `--harness`, `--json`, `CI` set or `OPEN_SPEC_INTERACTIVE=0`; the prompt text equals the quoted upstream text with `.github/agents/cospec.agent.md`
- [ ] 2.5 @integration (agent) tier 4 under a real pseudo-terminal in the sandbox (`script`) in a repo where `.github/prompts` is detected, no `--harness` -> the prompt appears, an empty answer leaves no cloud file and writes `cloudAgent: false`; the binary cannot be driven to this cell without answering its tool picker, so the source quote in design.md decision 1 is the upstream evidence
- [ ] 2.6 @equivalence (agent) alternate-profile and unmanaged-file cells (`cospec.md` present, both profiles present, an unmanaged `cospec.agent.md`, an unmanaged workflow) -> agree with the binary's cells (`openspec.md` / `openspec.agent.md` there): suppressed, conflict failure naming both paths with exit 1, `Left your existing ... untouched` line, nothing overwritten

## 3. Opting in, then out, then in again works [critical]

- [ ] 3.1 @integration (agent) `init --harness github-copilot --copilot-cloud`, then `--no-copilot-cloud`, then `--copilot-cloud` in one temp repo -> after the first both `.github/workflows/copilot-setup-steps.yml` and `.github/agents/cospec.agent.md` exist and the config holds `cloudAgent: true`; after the second neither exists and the config holds `false`; after the third both exist and the config holds `true`; the skills and prompts are untouched throughout
- [ ] 3.2 @e2e (agent) the compiled standalone binary (`mise run test:pack` smoke) runs `init --harness github-copilot --copilot-cloud` in a temp directory -> both cloud files are written from the embedded canon, the workflow contains `npm install -g @aligned-team/cospec` and `cospec --version`
- [ ] 3.3 @integration (agent) `update` after each step of 3.1 -> opted in: both files `unchanged`; opted out: files stay absent; a deleted managed file under `true` comes back as `created` in `update --json`
- [ ] 3.4 @integration (agent) `update` when `github-copilot` is no longer detected (the `.github/skills/cospec-*` tree deleted) and when the config holds `false` -> managed cloud files are removed with `Removed: <n> Copilot cloud agent file(s) (github-copilot not configured)` and `... (opted out of cloud files)`; undecided prints the `cospec init --copilot-cloud` hint only on an interactive run
- [ ] 3.5 @integration (agent) `update --check` and `cospec doctor` with `cloudAgent: true` and the agent file missing -> `update --check` exits 1 listing it as `created` and writes nothing; `doctor` reports the same drift; with the file present both are clean

## 4. A hand-edited cloud file survives opt-out, a managed one is removed [critical]

- [ ] 4.1 @integration (agent) append a line to `.github/agents/cospec.agent.md`, then `init --harness github-copilot --no-copilot-cloud` -> the workflow is removed, the edited agent file is on disk with the appended line, and the receipt and `--json` `copilotCloud.leftInPlace` name it
- [ ] 4.2 @integration (agent) a `.github/workflows/copilot-setup-steps.yml` containing `name: mine`, then `--copilot-cloud`, then `--no-copilot-cloud` -> the file still holds `name: mine` throughout, `copilot-setup-steps.yml.cospec-new` holds cospec's version after the first, and the receipt carries the `Left your existing ... add the cospec install step by hand` line
- [ ] 4.3 @integration (agent) OpenSpec's own `.github/agents/openspec.agent.md` and `copilot-setup-steps.yml` (written by the pinned binary in the sandbox with `--tools github-copilot --copilot-cloud`), then cospec opt-in and opt-out -> `openspec.agent.md` is never touched, and OpenSpec's workflow is preserved with a sidecar, never removed
- [ ] 4.4 @unit (agent) the managed classification (`harness/copilot-cloud.ts`) -> untouched agent and tracked-and-matching workflow are managed; an edited one, a file with no provenance and a workflow with no manifest entry are not

## 5. The harness row

- [x] 5.1 @equivalence (agent) `test/contract/github-copilot-row.test.ts` against the pinned dist -> `skillsDir` `.github`, the seven `detectionPaths` in order, `requiresIdeRestart` true, no `globalSkillsDir`, and the command path `.github/prompts/cospec-<id>.prompt.md` equal upstream's `opsx-<id>.prompt.md` with `opsx` respelled -> github-copilot-row.test.ts: 4 pass against the pinned dist (skillsDir `.github`, seven detectionPaths in order, requiresIdeRestart true, no globalSkillsDir, paths equal upstream's with `opsx-` respelled `cospec-`, row between gemini and hermes); harness-matrix.test.ts runs github-copilot as a plain test against the capture
- [x] 5.2 @integration (agent) `init --harness github-copilot` in a fresh repo -> twelve skills under `.github/skills`, twelve `.prompt.md` files under `.github/prompts`, bodies spell `/cospec-<id>`, no bare `openspec`, the receipt ends with `Restart your IDE to refresh commands.`, a second run is all `unchanged`, and `cospec doctor` exits 0 -> harness-rows.test.ts: 12 skills (each with SKILL.md) and 12 `cospec-<id>.prompt.md` under `.github`, prompt bodies spell `/cospec-apply`, a second run is all `unchanged`, `update` detects `github-copilot`, `doctor` exits 0; the receipt names `Harness: github-copilot` and carries `Restart your IDE to refresh commands.` as its own line before the `Try:` lines (R9's receipt layout), not as the last line
- [x] 5.3 @integration (agent) auto-detection and `update` -> a repo with only `.github/prompts/` selects `github-copilot` with no `--harness`; `update` finds the target from the sentinel skill under `.github/skills` -> harness-rows.test.ts: a repo with only `.github/prompts/` selects `github-copilot` on a bare `init --json`; `update --json` lists it from `.github/skills`
- [x] 5.4 @integration (agent) leftover scan -> a `.github/prompts/opsx-propose.prompt.md` and an `openspec-propose.prompt.md` with upstream's provenance are listed and removed by `--remove-opsx`; a user's `.github/prompts/release.prompt.md` is not -> unit/init/init.test.ts and legacy-command-sweep.test.ts: `.github/prompts/opsx-propose.prompt.md`, `openspec-propose.prompt.md` and the openspec skill are listed in `opsx.found` and removed by `--remove-opsx`; a user's `release.prompt.md` is byte-identical afterwards
- [x] 5.5 @regression (agent) `--harness all`, `claude`, `codex`, `opencode` and `agents` receipts -> only `all` gains the `github-copilot` lines and the restart line; the `claude`, `codex`, `opencode` and `agents` goldens are byte-identical to `main`; `mise run generate:check` exits 0 -> harness-wiring goldens: only `all.txt` (+24 files, +1 harness name), `all-four` detect/auto-detect and `invalid-harness.json` gain `github-copilot`; claude/codex/opencode/agents goldens unchanged; `generate:check` -> no drift; the restart line only appears for harnesses that need it

## 6. Persisting the choice

- [ ] 6.1 @integration (agent) a config with a header comment, `schema: feat`, a trailing comment and a `context:` block, then `init --harness github-copilot --copilot-cloud` -> every original line is present in order and the file ends with `githubCopilot:` / `  cloudAgent: true`; tiers 2, 3 and 5 leave the config bytes unchanged
- [ ] 6.2 @unit (agent) the persist edge cases (scalar `githubCopilot`, non-map root, unparseable file, `EACCES`) -> replaced, fresh document, byte-identical with a stderr warning, a warning with code and path and exit 0
- [ ] 6.3 @integration (agent) `cospec init --harness github-copilot --json` with nothing decided, then `--copilot-cloud` -> stdout is exactly one document each time; the first has `copilotCloud.tier` `undecided`, the second `flag`, `enabled` true, `persisted` true and both paths in `present`; with `--harness claude --copilot-cloud --json` stderr holds the ignored-flag sentence and `ignoredFlag` is true

## 7. Docs and agent docs

- [ ] 7.1 @manual (agent) `apps/docs/guide/harness-setup.md` -> lists GitHub Copilot and its paths, the cloud-agent opt-in with the five tiers in order, the two files, removal and survival rules and the OpenSpec-file collision; `mise run docs:build` exits 0
- [ ] 7.2 @manual (agent) `apps/docs/reference/configuration.md` -> documents `githubCopilot.cloudAgent` (type, who writes it, when) and no longer says `config.yaml` is never touched; `mise run docs:build` exits 0
- [ ] 7.3 @manual (agent) `apps/docs/reference/commands.md` `cospec init` row -> names `--copilot-cloud`, `--no-copilot-cloud` and the `copilotCloud` JSON key; `mise run docs:build` exits 0
- [ ] 7.4 @manual (agent) `.agents/shared.md`, `CLAUDE.md`, `AGENTS.md` -> describe the `.github` managed root, the cloud files and the persisted key; `mise run agents:sync` then `mise run agents:check` exits 0
- [ ] 7.5 @manual (agent) the commit body and the PR body -> each relays the proposal's BREAKING list, with no `!` after the type/scope and no `BREAKING CHANGE:` footer

## 8. Gate

- [ ] 8.1 @integration (agent) `mise run check` -> exit 0, with unit, integration, contract, bench and release counts and 0 fail recorded, and no `test.failing` or `test.todo` row
- [ ] 8.2 @integration (agent) `mise run cospec -- validate github-copilot --strict` and `mise run cospec -- apply github-copilot` -> clean, and exit 0
