# Verification

## 1. No test run reads the real home [critical]

- [x] 1.1 @regression (agent) with a scratch HOME whose `.config/openspec/config.json` is the host's (`profile: core`, `delivery: both`), run `bun test test/unit/init/write-failure.test.ts test/integration/init.test.ts` from `apps/cli` with no `--preload` -> on edac76c2 3 fail (`write-failure` per-file failure, `init` state A, state B, each `expect(...).toContain`/`toEqual` on a 6-workflow render) and the same two files pass with `--preload no-completion-tip.ts`; after the change the bare run is 18 pass / 0 fail, and from the repo root (`bun test apps/cli/test/...`) 19 pass / 0 fail
- [x] 1.2 @unit (agent) `support-machine-isolation.test.ts` passes under a clean and a profile-core HOME, and fails by name with the bunfig disabled (`--config=<empty file>`) -> 8 pass under the profile-core HOME and under the clean HOME (check run); with the bunfig disabled 4 fail (preload ran, environment resolves under tmpdir, `os.homedir()`/XDG off the real home, the binary's printed path off the real home) and 4 pass (the guard's own refusal rows)
- [x] 1.3 @integration (agent) the full unit and integration suites pass under the profile-core HOME with no `--preload` flag -> `mise run check` on the host (real HOME, `profile: core`): unit 3111 pass / 0 fail (3115 tests, 4 skip), integration 394 pass / 0 fail
- [x] 1.4 @integration (agent) the contract suite passes under the profile-core HOME -> contract 3231 pass / 0 fail in the same run, bench 343 pass, e2e release 14 pass

## 2. generate is host-independent [critical]

- [x] 2.1 @regression (agent) delete `.claude/skills/cospec-verify-change/` and `.claude/commands/cospec/verify.md`, run `update --check` under a clean HOME and the profile-core HOME -> before: clean lists `created` for both files; profile-core lists no `created` row at all, two `updated` rows on `cospec-update-change` (skill and command) and the `Workflows: 6 of 12` line; after, `scripts/generate-self update --check` lists the same two `created` rows under both HOMEs and no Workflows line (tree restored with `git checkout .claude`)
- [x] 2.2 @integration (agent) `mise run generate:check` and `mise run generate` on the committed tree exit 0 under the profile-core HOME -> `cospec update --check: no drift` and `cospec update: everything up to date`, no "6 of 12" line, `git status` unchanged by generate

## 3. Docs and gate

- [x] 3.1 @manual (agent) `docs/self-hosting.md`, `docs/architecture.md` and `.agents/shared.md` state both rules, `agents:check` clean; `apps/docs` and `apps/cli/src` untouched -> `git diff --stat origin/main -- apps/docs apps/cli/src` is empty; `mise run agents:check` prints `All shared blocks are in sync.`; `mise run check` runs it
- [x] 3.2 @manual (agent) `mise run check` exits 0 under a clean HOME and under the profile-core HOME, and `cospec validate test-home-isolation --strict` is clean -> `mise run check` with the host's real profile-core HOME: unit 3111 pass, integration 394, contract 3231, bench 343, e2e 14, all 0 fail, generate:check and agents:check clean, exit 0; the same command with HOME, USERPROFILE, ZDOTDIR and XDG_CACHE_HOME in an empty scratch dir and XDG_CONFIG_HOME unset: the same counts, 0 fail, exit 0 (the host's `~/.config/openspec/config.json` unmodified); `cospec validate test-home-isolation --strict` `0 errors, 0 warnings`
