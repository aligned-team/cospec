# Tasks

## 1. Baseline and oracle (tests first)

- [x] 1.1 Rebase onto `main` if `opsx-leftover-scan-scope` or
      `archive-and-sync-parity` has merged, then record the byte-identity
      baseline before any source edit: run
      `mise run test -- test/unit/harness-render.test.ts` and
      `test/integration/harness-wiring` on the unmodified tree, and write the
      baseline commit sha into verification row 2.1; verify both pass and
      `git status` shows no change under `__golden__/`
- [x] 1.2 Add the tests-owned oracle regenerator
      `apps/cli/test/contract/support/upstream-init-capture.ts` (pinned binary,
      private sandbox per tool, `profile: custom` with all 12 workflows,
      `delivery: both`, the head rule from design "The oracle") and
      `apps/cli/test/contract/upstream-init-fixtures.test.ts`, which re-captures
      every id, `windsurf` and the two combinations and compares them to the
      committed `apps/cli/test/fixtures/upstream-init/*.json`; verify it passes
      against the fixtures committed by the planning commit, every field equal
      after parsing (oxfmt owns the files' layout)
- [x] 1.3 Add `apps/cli/test/contract/harness-matrix.test.ts`, importing the
      pinned `AI_TOOLS`, `TOOL_ID_ALIASES`, `LEGACY_TOOL_ROOTS`,
      `LEGACY_SLASH_COMMAND_PATHS` and adapters in the test only: one
      `test.failing` per pinned id except `github-copilot` asserting the row's
      `displayName`, `skillsDir`, `globalSkillsDir`, `legacySkillsDirs`,
      `legacyToolRoots`, `detectionPaths` (= upstream
      `detectionPaths ?? [skillsDir]`), `requiresIdeRestart`, `searchAliases`,
      setup note (includes upstream's), and the render compared to
      `upstream-init/<id>.json` by design decision 14's rule; plus passing
      assertions for the four existing rows except codex `detectionPaths`
      (`test.failing` until task 4.3); verify the suite runs with 35 expected
      failures and no unexpected one
- [x] 1.4 Add the invariant test
      `apps/cli/test/unit/harness/no-tool-branches.test.ts`: no `HARNESS_TABLE`
      id appears as a string literal in `apps/cli/src/commands/*.ts` outside the
      documented Claude-only lines (settings merge, fresh-repo default); verify
      it passes on the baseline

## 2. Rendering shapes (T9: `render.ts`, `adapters.ts`)

- [x] 2.1 Add `skill` and `prose` to `BodyDialect`, row fields `skillDialect`
      and `skillInvocationPrefix` (`/` | `/skill:`), and
      `workflowReferencePattern(row)`; switch doctor's reference check to it;
      verify unit tests on fixture rows through `RenderOptions.adapters` (skill,
      `/skill:`, prose, unknown id left verbatim, doctor finds a dangling
      `/skill:cospec-nope`) and the five existing render goldens unchanged
- [x] 2.2 Add the `markdown-header` and `plain` serializers with
      `frontmatter: null`, routed to the manifest by `generate()`; verify a
      fixture-row render's exact bytes
      (`# COSPEC: <title>\n\n<description>\n\n<body>`, bare body), manifest
      entries, a hand edit producing a `.cospec-new` sidecar, and
      `isHarnessDocument`/`removeOrphanMarkdown` ignoring them
- [x] 2.3 Change `injectArguments` to a placeholder value (`$ARGUMENTS` | `$@`)
      and set the opencode row to `$ARGUMENTS`; verify a `$@` fixture row's
      command carries `**Provided arguments**: $@`, its skill does not, and the
      opencode golden is unchanged
- [x] 2.4 Add the shared frontmatter builders by key set (description;
      description + `argument-hint`; name + description + `argument-hint`;
      name + description + category + tags; cursor's
      name/id/category/description; continue's name/description/`invokable`;
      name + description), each with cospec's `metadata`; verify one unit test
      per builder against the head of the matching `upstream-init` fixture with
      `opsx`→`cospec` respelled
- [x] 2.5 Add a `skillWriters` option to `renderHarnessFiles` that renders a
      shared skills root's skills only from its writer, and make
      `receiptHintLines` use the first row's skill dialect with the `prose`
      dialect's `ask <tool> to use …` form; verify fixture-row tests and the
      four existing receipt goldens' hint lines unchanged

## 3. Engine (T6: `update.ts` `generate()`, `managed-files.ts`)

- [x] 3.1 Land `test.failing` integration tests first: a mode-000 harness dir
      yields one `failed` entry per unwritable file, every other harness
      written, exit 1, `failed` in `init --json`/`update --json` and the
      receipt, and a retry after `chmod` writing them with exit 0; then isolate
      `EACCES`, `EPERM`, `EROFS`, `ENOTDIR`, `EISDIR` per file in `generate()`
      (errno asserted through `test/fixtures/errno.ts`) and flip the tests;
      verify they pass and an unexpected error still propagates (unit test
      throwing `ENOSPC`)
- [x] 3.2 Land `test.failing` tests for a home-scoped fixture row under a temp
      `HOME` and under `USERPROFILE`, then make the resolved home skills root a
      managed root (write, dry-run read only, provenance-gated orphan removal,
      `resolveContainedPath` home containment) and remove the home-scope
      refusal; verify the tests pass and `--check` writes nothing under the temp
      home

## 4. Shared skills root (T4: `harness/shared-root.ts`)

- [x] 4.1 Add `shared-root.ts` (`resolveSharedSkillWriters`,
      `reconcileSharedSkillTargets`, `isSharedSkillTargetActive`, marker
      read/write) with a unit precedence matrix ported from upstream's cases
      plus cospec's pre-marker evidence (rules file, legacy `.codex/skills`);
      verify the matrix passes
- [x] 4.2 Wire `generate()` to pass the writer set to render and write the
      `.cospec-target` marker (manifest-tracked); replace `detectHarnesses`'
      tie-break with decision 7's evidence and the receipt's shared-root line
      with decision 6's; update the `codex`, `agents` and `all` receipt goldens
      (only the shared-root line, `Harness:` list, notes and restart line
      change) and `setup-notes.test.ts`; verify the four render goldens are
      unchanged and the receipt diff is exactly those lines
- [x] 4.3 Port `getAvailableTools` to init detection (a `/skills` path selects
      only the arbitrated writer) and set codex `detectionPaths` to upstream's;
      flip the codex `test.failing` in `harness-matrix.test.ts`; verify the spec
      scenarios "agents is detected by its skills dir" and "a bare .codex
      directory no longer selects codex" as integration tests
- [x] 4.4 Break the writer's final tie in the pinned binary's `AI_TOOLS` order
      (`SHARED_ROOT_UPSTREAM_ORDER`) and port its owner retention
      (`sharedSkillRootOwner`, `withSharedRootOwners`) into `init`, so a
      configured owner stays the writer; verify a differential contract test
      runs the same `init` sequences through the binary and cospec and compares
      the markers, and unit and integration tests cover the order and the
      retention

## 5. Aliases and the unknown-tool hint (T7, part)

- [x] 5.1 Add `HARNESS_ID_ALIASES` and resolve it in `parseHarnessArg`; append
      upstream's fallback hint to the unknown-value error, spelled for the flag
      typed; change `reachability.test.ts`'s `tool-alias` case to check
      `HARNESS_ID_ALIASES[id]` against the pinned target; verify an integration
      test for `--tools universal` (exit 1, both lines, nothing written) and the
      reachability suite still passing with the `windsurf` entry pending

## 6. Rows: skills-only (T1)

- [x] 6.1 Add the render goldens for `codeartsagent`, `forgecode`, `hermes`,
      `kimi`, `minimax-code`, `vibe`, `rovodev`, `zed` (decision 14 layout) with
      their harness-render tests as `test.failing`; verify 8 expected failures
- [x] 6.2 Add rows `codeartsagent`, `forgecode`, `vibe` (skill dialect), remove
      their `parity-pending.yaml` entries, flip their tests; verify
      `harness-matrix` rows and goldens pass and `mise run generate:check` is
      clean
- [x] 6.3 Add the `hermes` row with its setup note and detection paths; same
      verification, plus the receipt test for upstream's note
- [x] 6.4 Add the `kimi` row (`/skill:` prefix, `legacyToolRoots` `.kimi`); same
      verification
- [x] 6.5 Add the `minimax-code` row (`globalSkillsDir: .minimax`); same
      verification, run under a temp `HOME`
- [x] 6.6 Add the `rovodev` row (prose dialect); same verification, plus its
      prose receipt hint
- [x] 6.7 Add the `zed` row (shared dialect, `.agents` root); same verification,
      plus the arbiter picking the marked writer

## 7. Rows: flat `<root>/commands/cospec-<command>` (T2)

- [x] 7.1 Add the render goldens for `auggie`, `bob`, `codeassistant`,
      `command-code`, `costrict`, `cursor`, `factory`, `iflow`, `junie`,
      `oh-my-pi`, `qwen`, `roocode`, `trae` as `test.failing`; verify 13
      expected failures
- [x] 7.2 Add rows `auggie`, `bob`, `factory`, `costrict`
      (`.cospec/openspec/commands`) with the argument-hint builder; remove their
      pending entries and flip their tests; verify as in 6.2
- [x] 7.3 Add rows `codeassistant`, `junie`, `qwen` (description builder) and
      `trae`; same verification
- [x] 7.4 Add rows `cursor` and `iflow` (cursor builder); same verification
- [x] 7.5 Add the `oh-my-pi` row (`$@`); same verification
- [x] 7.6 Add the `command-code` row (`plain`, `$ARGUMENTS`); same verification,
      plus its manifest entries
- [x] 7.7 Add the `roocode` row (`markdown-header`); same verification

## 8. Rows: other command layouts (T3)

- [x] 8.1 Add the render goldens for `amazon-q`, `antigravity`, `cline`,
      `devin`, `kilocode`, `pi`, `codebuddy`, `crush`, `lingma`, `qoder`,
      `zcode`, `continue`, `kiro`, `gemini` as `test.failing`; verify 14
      expected failures
- [x] 8.2 Add the `amazon-q` row (`.amazonq/prompts`, `@`); same verification as
      6.2
- [x] 8.3 Add the `antigravity` row (`.agents/workflows`, `.agents` skills,
      `legacySkillsDirs`/`legacyToolRoots` `.agent`); same verification, plus
      the four-row combination test against
      `upstream-init/combo-shared-agents.json`
- [x] 8.4 Add the `cline` row (`.clinerules/workflows`, `markdown-header`,
      skills under `.cline`); same verification
- [x] 8.5 Add the `devin` row (`.devin/workflows`, flat commands, skill-dialect
      skills, `legacyToolRoots` `.windsurf` with consent) and remove the
      `windsurf` `tool-alias` pending entry; same verification, plus
      `--tools windsurf` writing exactly devin's files
- [x] 8.6 Add rows `kilocode` (`plain`) and `pi` (`.pi/prompts`, `$@`); same
      verification
- [x] 8.7 Add the namespaced rows `codebuddy`, `crush`, `lingma`, `qoder`,
      `zcode`; same verification
- [x] 8.8 Add rows `continue` (`.prompt`), `kiro` (`.prompt.md`) and `gemini`
      (TOML, manifest-tracked); same verification
- [x] 8.9 With every row in, verify `harness-matrix.test.ts` has no
      `test.failing` left, `parity-pending.yaml` has no `tool-matrix` entry, the
      reachability suite passes with only `github-copilot` pending as a tool,
      and `init --harness all` against `upstream-init/combo-all.json` matches
      decision 14's rule for every row

## 9. Legacy roots and leftovers (T5, T7)

- [x] 9.1 Extend the leftover scan per design decision 12 (every row's upstream
      command location, `legacyCommandPaths` from `LEGACY_SLASH_COMMAND_PATHS`,
      root-guard and `OPENSPEC:START/END` provenance, directory entries removed
      only once empty), keeping any walk boundary `main` has; verify a contract
      test that plants the pinned binary's live `init --tools <id>` output for
      every row and asserts doctor names every file it wrote and `--remove-opsx`
      removes exactly those, plus pre-opsx fixtures for every
      `LEGACY_SLASH_COMMAND_PATHS` entry with a row
- [x] 9.2 Port `LEGACY_TOOL_ROOTS` moves into `legacy-skills.ts` (decision 9),
      with `init` consent by selection and `update`'s TTY-only question; verify
      integration tests for `.kimi`, `.agent`, `.codex` and `.windsurf`
      (`update --json` migrates without asking; a user file stays; a differing
      destination is kept and reported)
- [x] 9.3 Port the Codex global prompt cleanup (decision 13); verify an
      integration test under a temp `CODEX_HOME` (allowlisted file removed after
      the replacement skill exists, a user prompt kept, nothing outside the temp
      dirs read) and one with codex not selected
- [x] 9.4 List and remove the binary's `.agents/skills/.openspec-target` marker
      once no `openspec-*` skill is left under the root, and record the
      marker-pair rule for file-pattern legacy commands as a deliberate cospec
      opinion (decision 12, docs, spec); verify the sweep contract test counts
      the marker among the files the binary wrote and a contract test holds the
      binary's removal of a marker-less file against cospec keeping it

## 10. Docs and agent guidance

- [x] 10.1 Update `apps/docs/guide/harness-setup.md`: the target table for all
      39 rows (paths, invocation, restart, setup note), the shared `.agents`
      root and its marker, the home skills root replacing the "no global state
      under your home directory" sentence, legacy root moves; verify
      `mise run docs:build` passes and the table lists every `HARNESS_TABLE` id
- [x] 10.2 Update `apps/docs/reference/commands.md` (`--harness` values,
      `windsurf`, the fallback hint, `failed` and exit 1, `update`'s consent
      question, doctor's shared-root detection) and
      `docs/harness-integration.md` (the row fields, dialects, serializers,
      arbiter, home root); verify `mise run docs:build` passes
- [x] 10.3 Update `.agents/shared.md`: replace the "managed files" paragraph's
      now-false limits (home-scoped root "renders but is not yet written",
      legacy migration "covers only Codex") with "a tool is a `HARNESS_TABLE`
      row; anything a row cannot express is a `harness/` dialect, serializer or
      helper, never a branch in `commands/`", name the shared-root marker, and
      say where the oracle fixtures live and how they are re-taken; run
      `mise run agents:sync`; verify `mise run agents:check` passes
- [x] 10.4 Let `e2e/eval/run.ts` render its skill bodies from the harness named
      by `COSPEC_EVAL_HARNESS` (default `claude`), reading each skill through
      the row's skill path instead of the literal `.claude/skills/`, refusing an
      id that is not a harness; verify `mise run typecheck` and `mise run lint`
      pass, and verification row 12.1's runs render each harness's four skill
      bodies

## 11. Close-out

- [ ] 11.1 Run `mise run check`; verify it passes with `mise run generate:check`
      clean and the five pre-existing render golden directories unchanged
      against the task 1.1 baseline
      (`git diff --exit-code <baseline> HEAD -- apps/cli/test/unit/__golden__/harness-render/{claude,codex,opencode,agents,all}`)
- [x] 11.2 Record every verification row's observed result in `verification.md`
      and run `mise run cospec -- validate tool-matrix --strict`; verify it
      passes
- [x] 11.3 the archive commit follows this one
