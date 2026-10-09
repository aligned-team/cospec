# Design

## Context

The proposal covers why and what; the specs cover the requirements. This section
records the current state, the oracle, and where the pinned binary contradicts
the roadmap row (the binary wins).

### Current state

`HARNESS_TABLE` (`apps/cli/src/harness/adapters.ts`) has four rows. A row
declares `skillsDir`/`globalSkillsDir`/`legacySkillsDirs` (tool roots, skills at
`<root>/skills/<skill>/SKILL.md`), an optional `commands` surface (`dir`,
`namespacing`, `file`, `extension`, `serializer: markdown | toml`, `frontmatter`
builder, `injectArguments: boolean`), `invocationPrefix: / | @`,
`bodyDialect: canonical | shared | flat`, `rulesPath`, `requiresIdeRestart`,
`detectionPaths`, `setupNote`, `searchAliases`. `render.ts` emits one file per
output path and throws when two rows map one path to different content.
`generate()` (`update.ts`) refuses a `scope: 'home'` file, routes
`frontmatter === null` files to the manifest, and has no per-file catch. Update
detection is a `cospec-propose` sentinel per skills root plus the codex
`rulesPath` tie-break. Init detection is `detectionPaths` existence. The
leftover scan (`init.ts` `leftoverScanFiles`/`isLeftoverCandidate`/
`isOpsxMarkdown`) reads markdown-serializer command dirs and skills roots, and
recognises openspec skills by `metadata.author: openspec` and commands by
`name: OPSX:`.

### The oracle

The pinned binary's own `init --tools <id>` output was captured for every one of
the 40 `AI_TOOLS` ids plus `windsurf`, plus two combinations
(`codex,agents,zed,antigravity` and `all`), each in a fresh git repo in a
throwaway sandbox (`HOME`, `XDG_*`, `CODEX_HOME`, `ZDOTDIR` private;
`EDITOR=true`; global config `profile: custom` with all 12 workflows and
`delivery: both`, because cospec always writes 12 workflows until
`workflow-profiles`). The captures are committed as
`apps/cli/test/fixtures/upstream-init/<id>.json`: argv, exit code, stdout and
stderr (sandbox paths normalised to `<HOME>`/`<PROJECT>`), and for every file
its path, scope (`project`/`home`), byte length, sha256 and **head** — the
adapter's wrapper: the YAML frontmatter block, the Markdown `# name` header plus
description paragraph, or the TOML preamble through `prompt = """`; empty for a
body-only file. Upstream's bodies are deliberately absent: cospec never emits an
upstream `/opsx:*` template, so only paths, wrappers and receipts are oracle
facts. A contract test re-runs the capture against the pinned binary and
compares it to the committed fixture, so a pin bump fails until the fixtures are
re-taken.

Facts from the captures and the dist (`core/config.js`,
`core/command-generation/adapters/*.js`, `utils/command-references.js`,
`core/shared-skill-target.js`, `core/available-tools.js`, `core/migration.js`,
`core/legacy-cleanup.js`):

- Every tool writes 12 skills at `<skillsDir>/skills/openspec-<skill>/SKILL.md`
  (`minimax-code`: `<home>/.minimax/skills/…`, home resolved
  `USERPROFILE ?? HOME ?? os.homedir()`). Skill frontmatter is the same for
  every tool; only the body's workflow references differ, in seven spellings:
  `/opsx:<id>` (namespaced command tools), `/opsx-<id>` and `@opsx-<id>` (flat
  command tools),
  `$openspec-<skill> (Codex) or /openspec-<skill> (other agents)` (codex),
  `/openspec-<skill>` (skills-only tools, `agents`, `zed`, and `devin` although
  it has commands), `/skill:openspec-<skill>` (kimi), and
  `the openspec-<skill> skill` (rovodev).
- 29 tools have a command adapter (30 with `github-copilot`); the other ten are
  skills-only. Every generated command and skill carries the root-guard sentence
  `` `openspec list --json` `` (all 360 command files and every `SKILL.md`
  checked).
- `--tools universal` is refused
  (`Invalid tool(s): universal. Available values: all, none, …` plus
  `Tool not listed? Use --tools agents: …`, exit 1); `--tools windsurf` writes
  exactly what `--tools devin` writes.
- `codex,agents,zed,antigravity` writes one `.agents/skills` tree (codex's
  dual-spelling bodies), Antigravity's `.agents/workflows/opsx-*.md`, a marker
  `.agents/skills/.openspec-target` containing `codex`, and the receipt line
  `Codex, Other / Universal (shared .agents skills), Zed Agent, Antigravity share .agents/skills; writing one tree for codex.`
- A locked tool dir (`.cursor` mode 000, `--tools claude,cursor`) still writes
  Claude's files, prints `Failed: Cursor (EACCES: …)` and
  `Error: OpenSpec setup failed for: Cursor`, and exits 1.
- `hermes` is the only tool with a `setupNote`; upstream prints it as
  `Setup required for Hermes Agent: <note>`. Fourteen ids set
  `requiresIdeRestart` (fifteen with `github-copilot`); upstream prints one
  `Restart your IDE to refresh commands.` line.

### Where the binary contradicts the roadmap row

1. **Search aliases are not `--tools` values.** Row 50 and track T7 say
   `--harness` should accept `agents`'s `searchAliases`. The binary refuses
   `--tools universal` (and every other alias); the aliases feed only the
   interactive picker's search box (`core/init.js:444`). The non-interactive
   counterpart is the fallback hint on an unknown value
   (`universalToolFallbackHint`). cospec ports the hint (decision 11) and does
   not accept aliases as values. `searchAliases` stays row data, asserted equal
   to upstream's.
2. **CoStrict is not `<root>/commands/`.** Track T2 lists `costrict` with
   `<root>/commands/<prefix>-<id>.md`; the adapter writes
   `.cospec/openspec/commands/opsx-<id>.md` under skills root `.cospec`. The row
   keeps the tool's layout: `.cospec/openspec/commands/cospec-<command>.md`.
3. **More frontmatter-less commands than Cline.** Zoo Code (`roocode`) uses the
   same `# <name>` / description / body layout as Cline; Command Code and Kilo
   Code write the bare body with no wrapper at all. Track T9 named Cline only.
4. **Four legacy tool roots, not three.** `LEGACY_TOOL_ROOTS` also moves
   `.codex` to `.agents` after generation. Track T5 named kimi, antigravity and
   devin. The codex entry is ported too (decision 9); it moves OpenSpec's own
   `openspec-*` files, and is the OpenSpec-file counterpart of cospec's existing
   `.codex/skills/cospec-*` migration, which stays.
5. **`.kimi` and `.windsurf` are not `legacySkillsDirs`.** They live only in
   `LEGACY_TOOL_ROOTS`, with `needsConsent`/`timing`, which a `string[]` cannot
   carry. A separate row field mirrors that table (decision 9);
   `legacySkillsDirs` stays equal to upstream's.
6. **Devin's skills use skill references even though it has commands**
   (`getTransformerForTool`'s devin case), and SourceCraft Code Assistant
   (`codeassistant`), listed upstream as a natural-language skill tool, renders
   its skills with its flat command spelling because it is adapter-backed.
7. **`init` also isolates failures.** Row 51 names `update`; the binary's `init`
   isolates a failed tool the same way. Both run through `generate()`.

## Goals / Non-Goals

**Goals:**

- Every id in the pinned `AI_TOOLS` except `github-copilot` is a row whose
  generated paths, wrappers, detection and receipt are derived from the oracle
  with `opsx` respelled `cospec`, proven per row by a contract test against the
  pinned dist and the committed capture.
- Adding a row needs no edit in `apps/cli/src/commands/`. Every shape a row
  cannot express is a dialect, serializer or helper in `harness/`; the commands
  read only table-derived helpers. An invariant test fails on a tool-id literal
  in `commands/` outside the documented Claude-only exceptions
  (`.claude/settings.json` merge, the fresh-repo default).
- Every skill, command and rules file the four existing rows render stays
  byte-identical to `main`.

**Non-Goals:**

- `github-copilot` and its cloud-agent files: the `github-copilot` change. Its
  `LEGACY_SLASH_COMMAND_PATHS` entry (`.github/prompts/openspec-*.prompt.md`)
  lands with its row.
- Workflow profiles and delivery modes (`skills`/`commands`-only): the
  `workflow-profiles` change. Every row here renders upstream's `delivery: both`
  shape with all 12 workflows.
- Root-level `LEGACY_CONFIG_FILES` `OPENSPEC:START/END` blocks: the
  `workflow-profiles` change (roadmap row 61).
- An interactive tool picker. cospec's `init` takes the list on the command
  line; `searchAliases` has no non-interactive meaning (Context, item 1).

## Decisions

1. **Rows append in upstream `AI_TOOLS` order after today's four.** Receipts,
   detection output and doctor's findings follow table order, and
   `harness-receipt-and-doctor-scope` made the first selected row spell the
   receipt hint, so `claude` stays first and `--harness all` keeps
   `/cospec:propose`. Rejected: re-sorting the whole table into upstream order,
   which would put `amazon-q` first and respell the `all` receipt as
   `@cospec-propose`. The contract test asserts the id set equals `AI_TOOLS`
   minus `github-copilot` and that the 35 appended rows follow `AI_TOOLS` order.

2. **Per-row layout, derived from the oracle.** Paths are upstream's with
   `opsx-{id}` → `cospec-{command}` and `opsx/{id}` → `cospec/{command}`; skill
   directories `openspec-<skill>` → `cospec-<skill>`. Frontmatter is upstream's
   key set with `opsx`/`OPSX` respelled `cospec`/`COSPEC`, the title and
   description from cospec's canon workflow, plus cospec's `metadata` provenance
   (`author`, `generatedBy`, `contentHash`). Command dialect: `canonical` for
   namespaced, `flat` for flat. Rows marked † also differ in `skillDialect`.

   | id              | skills root         | commands (dir · file · ext · serializer · frontmatter keys)                                                               | prefix | skill dialect     | args         | restart | detectionPaths                       | legacy roots                                                       | setup note                                                     |
   | --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------- | ------------ | ------- | ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------- |
   | `amazon-q`      | `.amazonq`          | `.amazonq/prompts` · `cospec-{command}` · `.md` · markdown · description                                                  | `@`    | flat              | —            | yes     | `.amazonq`                           | —                                                                  | —                                                              |
   | `antigravity`   | `.agents` (shared)  | `.agents/workflows` · flat · `.md` · markdown · description                                                               | `/`    | flat              | —            | yes     | `.agent`, `.agents/workflows`        | `.agent` (no consent, after generation); legacySkillsDirs `.agent` | —                                                              |
   | `auggie`        | `.augment`          | `.augment/commands` · flat · `.md` · markdown · description, `argument-hint: command arguments`                           | `/`    | flat              | —            | —       | `.augment`                           | —                                                                  | —                                                              |
   | `bob`           | `.bob`              | `.bob/commands` · flat · `.md` · markdown · description, argument-hint                                                    | `/`    | flat              | —            | —       | `.bob`                               | —                                                                  | —                                                              |
   | `cline`         | `.cline`            | `.clinerules/workflows` · flat · `.md` · **markdown-header**                                                              | `/`    | flat              | —            | yes     | `.cline`                             | —                                                                  | —                                                              |
   | `command-code`  | `.commandcode`      | `.commandcode/commands` · flat · `.md` · **plain**                                                                        | `/`    | flat              | `$ARGUMENTS` | —       | `.commandcode`                       | —                                                                  | —                                                              |
   | `codeartsagent` | `.codeartsdoer`     | —                                                                                                                         | `/`    | skill             | —            | —       | `.codeartsdoer`                      | —                                                                  | —                                                              |
   | `devin` †       | `.devin`            | `.devin/workflows` · flat · `.md` · markdown · name, description, category, tags                                          | `/`    | skill             | —            | yes     | `.devin`, `.windsurf`                | `.windsurf` (consent)                                              | —                                                              |
   | `forgecode`     | `.forge`            | —                                                                                                                         | `/`    | skill             | —            | —       | `.forge`                             | —                                                                  | —                                                              |
   | `codebuddy`     | `.codebuddy`        | `.codebuddy/commands` · `cospec/{command}` · `.md` · markdown · name, description, `argument-hint: "[command arguments]"` | `/`    | canonical         | —            | —       | `.codebuddy`                         | —                                                                  | —                                                              |
   | `continue`      | `.continue`         | `.continue/prompts` · flat · `.prompt` · markdown · `name: cospec-<command>`, description, `invokable: true`              | `/`    | flat              | —            | yes     | `.continue`                          | —                                                                  | —                                                              |
   | `costrict`      | `.cospec`           | `.cospec/openspec/commands` · flat · `.md` · markdown · description, argument-hint                                        | `/`    | flat              | —            | yes     | `.cospec`                            | —                                                                  | —                                                              |
   | `crush`         | `.crush`            | `.crush/commands` · namespaced · `.md` · markdown · name, description, category, tags                                     | `/`    | canonical         | —            | —       | `.crush`                             | —                                                                  | —                                                              |
   | `cursor`        | `.cursor`           | `.cursor/commands` · flat · `.md` · markdown · `name: /cospec-<command>`, `id: cospec-<command>`, category, description   | `/`    | flat              | —            | yes     | `.cursor`                            | —                                                                  | —                                                              |
   | `factory`       | `.factory`          | `.factory/commands` · flat · `.md` · markdown · description, argument-hint                                                | `/`    | flat              | —            | —       | `.factory`                           | —                                                                  | —                                                              |
   | `gemini`        | `.gemini`           | `.gemini/commands` · namespaced · `.toml` · toml                                                                          | `/`    | canonical         | —            | —       | `.gemini`                            | —                                                                  | —                                                              |
   | `hermes`        | `.hermes`           | —                                                                                                                         | `/`    | skill             | —            | —       | `.hermes`, `HERMES.md`, `.hermes.md` | —                                                                  | `Setup required for Hermes Agent: ` + upstream's note verbatim |
   | `iflow`         | `.iflow`            | `.iflow/commands` · flat · `.md` · markdown · cursor's keys                                                               | `/`    | flat              | —            | —       | `.iflow`                             | —                                                                  | —                                                              |
   | `junie`         | `.junie`            | `.junie/commands` · flat · `.md` · markdown · description                                                                 | `/`    | flat              | —            | yes     | `.junie`                             | —                                                                  | —                                                              |
   | `kilocode`      | `.kilocode`         | `.kilocode/workflows` · flat · `.md` · **plain**                                                                          | `/`    | flat              | —            | yes     | `.kilocode`                          | —                                                                  | —                                                              |
   | `kimi`          | `.kimi-code`        | —                                                                                                                         | `/`    | skill (`/skill:`) | —            | —       | `.kimi-code`, `.kimi`                | `.kimi` (no consent)                                               | —                                                              |
   | `kiro`          | `.kiro`             | `.kiro/prompts` · flat · `.prompt.md` · markdown · description                                                            | `/`    | flat              | —            | yes     | `.kiro`                              | —                                                                  | —                                                              |
   | `lingma`        | `.lingma`           | `.lingma/commands` · namespaced · `.md` · markdown · name, description, category, tags                                    | `/`    | canonical         | —            | yes     | `.lingma`                            | —                                                                  | —                                                              |
   | `minimax-code`  | `~/.minimax` (home) | —                                                                                                                         | `/`    | skill             | —            | —       | (home sentinel, decision 8)          | —                                                                  | —                                                              |
   | `vibe`          | `.vibe`             | —                                                                                                                         | `/`    | skill             | —            | —       | `.vibe`                              | —                                                                  | —                                                              |
   | `oh-my-pi`      | `.omp`              | `.omp/commands` · flat · `.md` · markdown · description                                                                   | `/`    | flat              | `$@`         | —       | `.omp`                               | —                                                                  | —                                                              |
   | `pi`            | `.pi`               | `.pi/prompts` · flat · `.md` · markdown · description                                                                     | `/`    | flat              | `$@`         | —       | `.pi`                                | —                                                                  | —                                                              |
   | `codeassistant` | `.codeassistant`    | `.codeassistant/commands` · flat · `.md` · markdown · description                                                         | `/`    | flat              | —            | —       | `.codeassistant`                     | —                                                                  | —                                                              |
   | `qoder`         | `.qoder`            | `.qoder/commands` · namespaced · `.md` · markdown · name, description, category, tags                                     | `/`    | canonical         | —            | yes     | `.qoder`                             | —                                                                  | —                                                              |
   | `qwen`          | `.qwen`             | `.qwen/commands` · flat · `.md` · markdown · description                                                                  | `/`    | flat              | —            | —       | `.qwen`                              | —                                                                  | —                                                              |
   | `rovodev`       | `.rovodev`          | —                                                                                                                         | `/`    | prose             | —            | —       | `.rovodev/skills`, `.rovodev`        | —                                                                  | —                                                              |
   | `roocode`       | `.roo`              | `.roo/commands` · flat · `.md` · **markdown-header**                                                                      | `/`    | flat              | —            | yes     | `.roo`                               | —                                                                  | —                                                              |
   | `trae`          | `.trae`             | `.trae/commands` · flat · `.md` · markdown · name, description                                                            | `/`    | flat              | —            | yes     | `.trae`                              | —                                                                  | —                                                              |
   | `zed`           | `.agents` (shared)  | —                                                                                                                         | `/`    | shared            | —            | —       | `.zed`, `.agents/skills`             | —                                                                  | —                                                              |
   | `zcode`         | `.zcode`            | `.zcode/commands` · namespaced · `.md` · markdown · name, description, category, tags                                     | `/`    | canonical         | —            | —       | `.zcode`                             | —                                                                  | —                                                              |

   `detectionPaths` equals upstream's `detectionPaths ?? [skillsDir]`, the set
   upstream's `getAvailableTools` actually checks. `displayName` is upstream's
   `name`. `name` values are `COSPEC: <title>` where upstream writes
   `OPSX: <title>`, and `tags` are cospec's `['cospec', 'workflow']` (the Claude
   row's), not upstream's `['workflow', 'artifacts', 'experimental']`. The
   frontmatter builders are shared functions keyed by key set, not one per tool.
   Rejected: copying upstream's frontmatter verbatim with `opsx` names, which
   would register commands that do not exist.

3. **Codex `detectionPaths` align with upstream, through the arbiter.** The
   codex row's `detectionPaths` becomes `['.agents/skills', '.codex/skills']`.
   Init detection ports `getAvailableTools`: a row is available when one of its
   paths exists; a path ending in `/skills` is not an independent signal, so a
   row available only through such a path is kept only when the shared-root
   arbiter (decision 6) resolves it as the root's writer. That is why
   `harness-adapter-table` deferred it: without the arbiter, upstream's paths
   would select codex on an agents-only repo. The T8 contract test asserts the
   codex row equals upstream's paths.

4. **Skill dialect beside the command dialect.** `BodyDialect` gains `skill`
   (`<skillInvocationPrefix><skill>`, prefix `/` by default, `/skill:` for kimi)
   and `prose` (`the <skill> skill`). A row's `bodyDialect` spells its command
   bodies; optional `skillDialect` (defaulting to `bodyDialect`) spells its
   skill bodies. Only `devin` sets both differently. Like `shared`, both new
   dialects map an id through `skillById` and leave an unknown id verbatim, so
   doctor's dangling-ref check still fires. Doctor's reference pattern comes
   from the row's dialects through a new `adapters.ts` helper
   (`workflowReferencePattern`), so `/skill:cospec-<skill>` and
   `the cospec-<skill> skill` are checked too. `zed` takes `shared`, not
   `skill`: upstream renders zed's and agents's skills identically, and cospec's
   `agents` already renders `shared`, so every skills-native `.agents` writer
   stays interchangeable. Rejected: one dialect per row, which cannot express
   Devin; and deriving the skill spelling from "has commands", which gets Devin
   and SourceCraft wrong (Context item 6).

5. **Two frontmatter-less serializers, manifest-tracked.** `markdown-header`
   writes `# COSPEC: <title>\n\n<description>\n\n<body>` (Cline, Zoo Code);
   `plain` writes the body alone (Command Code, Kilo Code). Like `toml`, their
   files have `frontmatter: null` and `contentHash: null`, so `generate()`
   routes them to `openspec/.cospec-manifest.json`, which provides provenance,
   drift detection and contained removal (`harness-adapter-table` decision 9).
   `isHarnessDocument` and `removeOrphanMarkdown` keep reading only the
   `markdown` serializer; the manifest owns the rest. Rejected: adding YAML
   provenance frontmatter to these files. Cline and Zoo Code read the first
   header as the command title and Kilo Code reads the file as plain Markdown,
   so a frontmatter block would surface as literal text in the tool.

6. **Shared skills roots: one writer, upstream's precedence, a cospec marker.**
   `harness/shared-root.ts` groups selected rows by resolved skills root and,
   for a group of two or more, picks the writer in upstream's
   `resolveSharedSkillWriters` order: the marker (`<root>/.cospec-target`) if it
   names a row of the preferred pool, then cospec's pre-marker evidence, then
   (when the root already holds a cospec skill) `agents`, then `codex`, then the
   first row in the pinned binary's `AI_TOOLS` order (antigravity, codex, zed,
   agents; `SHARED_ROOT_UPSTREAM_ORDER`, held to the pinned dist by a contract
   test), which differs from cospec's table order where `zed` follows `agents`.
   The preferred pool is the skills-native rows (no `commands`) when any is
   selected, else all. cospec's pre-marker evidence replaces upstream's content
   inference: cospec's `shared` bodies always contain both `$cospec-` and
   `/cospec-`, so content cannot tell codex from agents; the codex row's
   `rulesPath` (today's tie-break) or a legacy `.codex/skills/cospec-*` skill
   means codex. `generate()` passes the writer set to `renderHarnessFiles`
   (`skillWriters`), which renders a shared root's skills from its writer only,
   so no two rows ever emit one path; the render-conflict error stays as the
   guard for a caller that bypasses the arbiter. After writing, `generate()`
   writes `<root>/.cospec-target` containing the writer's id and a newline,
   manifest-tracked. `isSharedSkillTargetActive(cwd, id)` (the
   `reconcileSharedSkillTargets` port) answers `update`'s and `doctor`'s
   question "is this row the writer here". `init` ports upstream's owner
   retention (`validateTools`'s `sharedSkillRootOwner`): for each selected row
   but `codex`, a configured row that already owns its shared root (a marker or
   a cospec skill, resolved by the reconcile order) joins the generation set, so
   `init --harness agents` then `init --harness zed,antigravity` keeps `agents`
   the writer, as the binary does, instead of flipping the marker to a row
   selected beside it. The owner is refreshed like any generated row. A
   differential contract test (`shared-root-differential.test.ts`) runs the same
   `init` sequences through the binary and cospec and compares the writer each
   leaves in its marker. cospec never reads or writes upstream's
   `.openspec-target`, which names the owner of OpenSpec's `openspec-*` skills,
   not cospec's; `--remove-opsx` deletes it (decision 12), as it deletes the
   skills it describes. The receipt's shared-root line becomes
   `skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for <writer>)`.
   Rejected: keeping render's path-dedupe as the arbiter by giving `antigravity`
   the `shared` skill dialect. Antigravity alone would then write `$cospec-…`
   Codex spellings for a tool that registers `/cospec-<id>` workflows, and the
   marker the roadmap requires would have nothing to decide.

7. **Detection on `update`/`doctor` from the row.** A row is detected when its
   legacy skills root holds a cospec sentinel skill; or its skills root (project
   or home) holds one and the row is that root's writer
   (`isSharedSkillTargetActive`); or its command surface holds a cospec command
   for the sentinel workflow (a `markdown` command by frontmatter provenance, a
   frontmatter-less one by its manifest entry); or its `rulesPath` exists. The
   codex/agents special case in `detectHarnesses` is replaced by the arbiter.
   Rejected: keeping the rules-file tie-break. With four rows on one root, a
   rules file cannot say which of zed, agents and antigravity was selected.

8. **The home skills root is a managed root.** `skillsRoot()` keeps returning a
   home-relative root for `globalSkillsDir`; `generate()` resolves it with
   upstream's rule (`USERPROFILE ?? HOME ?? os.homedir()`), writes there instead
   of refusing, and removes an orphaned cospec skill there only with frontmatter
   provenance, as for project skills. Skills are self-describing markdown, so no
   home path ever becomes a manifest key. `resolveContainedPath` gains the
   resolved home root as an absolute containment root for home-scoped removals
   only. Init auto-detects `minimax-code` when its home skills root holds a
   cospec- or OpenSpec-authored skill (upstream's check, with cospec's
   provenance), so it is selected in every project on that machine, as
   upstream's is. A `generate()` dry run (`--check`, doctor) reads the home root
   and never writes it.

9. **Legacy tool roots are row data plus one mover.** A row field
   `legacyToolRoots?: { root, needsConsent, timing }[]` mirrors
   `LEGACY_TOOL_ROOTS` (`kimi`, `devin`, `codex`, `antigravity`).
   `legacy-skills.ts` ports `migrateLegacyToolDirs`: OpenSpec-managed skill
   files (`openspec-<skill>/SKILL.md`) and command files (`opsx-*` at the row's
   upstream command path, with the root swapped) move from the legacy root to
   the current one; an identical destination drops the legacy copy; a differing
   one keeps both and reports it; directories are removed only when empty.
   `before-generation` entries run before `generate()`, `after-generation` ones
   after. Consent: `init` with the tool selected moves without asking. `update`
   asks a yes/no question only when stdin and stdout are TTYs, `--json` is not
   set and `--force` is not passed; a "no" leaves `.windsurf` in place and
   reports it; otherwise it moves. Each move is reported in the receipt and the
   `--json` `migration` array. Moved files are OpenSpec's, so the leftover scan
   then reports them at their new location and `--remove-opsx` removes them.
   Rejected: listing `.kimi`/`.windsurf` in `legacySkillsDirs`, which would
   break the T8 equality and cannot carry consent or timing.

10. **Per-file write failures are isolated in `generate()`.** Each write,
    sidecar and removal catches only `EACCES`, `EPERM`, `EROFS`, `ENOTDIR` and
    `EISDIR` (asserted through `test/fixtures/errno.ts`), records
    `{ path, error }` where `error` is `<code>: <syscall> <path>`, and continues
    with the next file; any other error propagates. `GenerateResult` gains
    `failed`. `init` and `update` print a `Failed:` block naming each path,
    carry `failed` in their `--json` documents, skip the manifest entry of a
    failed file so the next run retries it, and exit 1. Rejected: isolating per
    harness as upstream's `failedTools` does. cospec's unit of provenance is the
    file, and a per-file record names the exact path to fix.

11. **Aliases and the unknown-tool hint.**
    `HARNESS_ID_ALIASES = { windsurf: 'devin' }` lives in `adapters.ts`, and
    `parseHarnessArg` resolves through it before validation, as
    `resolveToolIdAlias` does. An unknown value keeps cospec's first error line
    and gains upstream's
    `Tool not listed? Use <spelling> agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`
    with `<spelling>` the flag the user typed. The reachability test's
    `tool-alias` case checks that `HARNESS_ID_ALIASES[id]` equals the pinned
    target and that the target is a harness name, instead of looking the alias
    up in `HARNESS_NAMES`. Rejected: making `windsurf` a row, which would write
    and detect a tool that no longer exists under that name.

12. **Leftover sweep: every row's upstream command location plus
    `LEGACY_SLASH_COMMAND_PATHS`.** `isLeftoverCandidate` accepts, for every row
    whatever its cospec serializer, a file at the row's upstream command path
    pattern (the row's `commands.file` with `cospec` → `opsx`, any of `.md`,
    `.toml`, `.prompt`, `.prompt.md` as the row declares) and every
    `LEGACY_SLASH_COMMAND_PATHS` entry, ported as a row field
    `legacyCommandPaths` (directory entries with `managedFileNames`, file
    patterns including `.opencode/command/` and `.qwen/commands/*.toml`).
    Provenance per shape: an opsx-era file carries the pinned dist's root-guard
    sentence `` `openspec list --json` `` (true for every command and skill
    upstream writes, whatever the wrapper), or the existing skill
    `metadata.author: openspec` / command `name: OPSX:` markers; a pre-opsx file
    carries `<!-- OPENSPEC:START -->`…`<!-- OPENSPEC:END -->`. For a directory
    entry that is upstream's own rule (`isGeneratedLegacyCommand`, re-checked
    per file). For a `files` pattern it is deliberately stricter than the
    binary, which deletes a file matching the pattern by name and never
    re-checks markers: a same-named file without the markers is the user's,
    which is the rationale upstream itself gives for its directory rule, so
    cospec keeps it and does not list it. `leftover-sweep.test.ts` holds both
    sides: the binary removes a marker-less `.cursor/commands/openspec-*.md`,
    cospec leaves it. The one file whose provenance is its path and shape is the
    binary's `.agents/skills/.openspec-target` ownership marker (one tool id):
    it is listed, and removed, once no `openspec-*` skill is left under the
    shared root for it to describe, so a user-authored `openspec-*` skill keeps
    it. A directory entry is removed only once empty. The walk keeps every
    boundary the scan has on `main` when this change rebases.

13. **Codex global prompt cleanup reports through the leftover scan.**
    `$CODEX_HOME/prompts` (trimmed, else `<home>/.codex/prompts`, resolved) is
    read for upstream's twelve allowlisted names (`opsx-<workflow>.md`), and a
    match is listed only when the codex row is selected in this run (its
    replacement skills are being written). Entries outside the project carry
    `scope: "home"` and an absolute `path` in `opsx.found`; text mode lists the
    absolute path. They are deleted only by `--remove-opsx`, after `generate()`
    has written the replacement skills. A selected home-scoped row
    (`minimax-code`) has its home skills root read the same way, with skill
    provenance (`metadata.author: openspec` or the root guard), and its matches
    listed with `scope: "home"`. Rejected: content provenance for the Codex
    prompts, which upstream does not use there: the allowlist and the resolved
    directory are its rule.

14. **Goldens and fixtures.** Each new row gets a render golden under
    `apps/cli/test/unit/__golden__/harness-render/<id>/`: `index.json` with
    every path, kind, workflow, contentHash, byte length and sha256 of the full
    content, plus the full bytes of its `propose` skill and command. The sha256
    pins every file byte for byte; the two full files keep a reviewable diff
    without committing 35 × 24 near-identical bodies. The five existing golden
    directories (`claude`, `codex`, `opencode`, `agents`, `all` = those four)
    stay as they are, with explicit id lists, and are the byte-identity proof.
    The per-row contract test compares the cospec render against
    `upstream-init/<id>.json`: the same path set with `opsx`→`cospec` and
    `openspec-`→`cospec-` respelled, the same scope, the same wrapper rule, and
    a head whose upstream keys are all present (respelled) plus cospec's
    `metadata` where the wrapper is YAML. `setupNote` is asserted to _include_
    upstream's note (`harness-adapter-table` decision 13), not to equal it.

## Operational surface

Nothing changes in how cospec is deployed: no bind address, container, network
call, secret or connection limit is involved. The changed surface is a local CLI
run:

- **Filesystem reach.** `init`/`update` now write, and `doctor`/`--check` read,
  one directory outside the project: the resolved home skills root
  (`<USERPROFILE ?? HOME ?? os.homedir()>/.minimax/skills`), and only when
  `minimax-code` is selected or detected. `--remove-opsx` with `codex` selected
  may delete allowlisted files in `$CODEX_HOME/prompts` (else
  `~/.codex/prompts`). Every test and every sandboxed probe in this change
  points `HOME`, `USERPROFILE`, `XDG_*`, `CODEX_HOME` and `ZDOTDIR` at throwaway
  directories.
- **Interactivity.** `update` asks one yes/no question only on a TTY, without
  `--json` or `--force` (decision 9); `init` never asks.
- **Exit codes.** `init` and `update` add exit 1 for a run with any `failed`
  entry; every other code is unchanged.
- **Binaries.** The `bun run` entry, the npm package and the standalone compiled
  binaries carry the table as bundled TypeScript (no new embedded canon file),
  on every OS and architecture cospec already ships. The wrapped OpenSpec binary
  (pinned 1.13.1, accepted `>=1.0.0 <2.0.0`) is not called by any code path this
  change adds; its `AI_TOOLS`, adapters and `LEGACY_*` tables are imported by
  tests only.

## Integration contract

Each row's contract is the tool's own file format as the pinned adapter declares
it, and cospec owns only the files it writes under it:

- **Ownership.** A tool's directory is the user's and the tool's; cospec owns
  `cospec-*` skill directories, its command files and the manifest-tracked files
  (rules, TOML/header/plain commands, `.agents/skills/.cospec-target`).
  OpenSpec's own `openspec-*`/`opsx-*` files are recognised only by provenance
  (decision 12) and removed only under `--remove-opsx` or a ported legacy move.
- **Shape.** Directory, file template, extension and wrapper keys are asserted
  per row against `upstream-init/<id>.json`, the committed capture of the pinned
  binary's own output, and the capture is re-taken and compared by a contract
  test, so a tool-format change in a new OpenSpec pin fails before it ships.
- **Ids and names.** Tool ids are upstream's `AI_TOOLS` `value`s verbatim (the
  `--harness` value), `displayName` is upstream's `name`, and `windsurf` is an
  alias resolved before validation, never a row. Command ids inside file names
  are cospec's workflow `command` values; skill directories are cospec's `skill`
  values (`canon/workflows/harness.yaml`).
- **Invocation.** How a tool invokes a command or skill is reconciled through
  the row's dialects (decision 4) to the spelling upstream's reference
  transforms produce for that tool, with `opsx` respelled `cospec`.

## Risks / Trade-offs

- [`--harness all` now writes into the home directory] → It does what
  `openspec init --tools all` does, and the docs page that said "no global state
  under your home directory" is corrected in this change. A dry run never writes
  there.
- [The `.agents` marker changes which rows `update` detects on a repo that
  selected several shared-root rows] → Only the writer is detected through the
  shared root, as upstream's `isSharedSkillTargetActive`; a non-writer with its
  own surface (antigravity's workflows, codex's rules file) is still detected by
  that surface. For codex, agents and zed the skills they would write are
  byte-identical, so dropping a non-writer loses no file.
- [Provenance by the root-guard sentence misses an OpenSpec version whose bodies
  lack it] → The existing `name: OPSX:` and `metadata.author: openspec` markers
  still apply; only the pinned version's shapes are asserted, by the contract
  test that plants live-captured upstream files.
- [`.cospec/` is CoStrict's directory, and it becomes a scan and removal root] →
  cospec writes nothing of its own there; removal under it stays manifest- or
  provenance-gated like every root.
- [The update consent prompt is the first interactive question `update` asks] →
  It appears only on a TTY, with neither `--json` nor `--force`, and only when
  `.windsurf` holds OpenSpec-managed content and `devin` is detected; every
  scripted run keeps today's non-interactive behaviour.
- [Two sibling changes edit the same files] → Recorded in blocking-changes
  `## Sequencing`; the byte-identity baseline is re-taken after a rebase, before
  any source edit.
- [Golden size] → Decision 14 keeps new goldens to an index plus two files per
  row; the oracle fixtures are wrapper-only (about 1.1 MB of JSON).
