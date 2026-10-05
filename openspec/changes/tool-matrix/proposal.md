# Proposal

## Why

cospec generates project files for 4 of the 40 tool ids the pinned OpenSpec
1.13.1 binary exposes in `AI_TOOLS` (`claude`, `codex`, `opencode`, `agents`).
Someone who swaps `openspec` for `cospec` and runs `cospec init --tools cursor`
(or `gemini`, `cline`, `kiro`, …) is refused with `invalid --tools`, so the swap
regresses for every user of the other 36 tools. The reachability test carries 35
`tool` entries and the `windsurf` `tool-alias` as pending for this change;
`github-copilot` belongs to the next change, `github-copilot`.

`harness-adapter-table` (#51) made a tool one `HARNESS_TABLE` row, and
`harness-receipt-and-doctor-scope` (#63) made the receipt hint and doctor's scan
derive from the row. Rows alone cannot express everything the pinned adapters
do: Cline's and Zoo Code's Markdown-header commands, Command Code's and Kilo
Code's frontmatter-less commands, five skill-reference spellings, two argument
placeholders, a home-directory skills root, N tools sharing `.agents/skills`,
four legacy tool roots, Codex's global prompt cleanup and a per-tool write
failure. This change adds each missing shape once, as a table field, a
`render.ts`/`adapters.ts` dialect or a table-derived helper, then adds the 35
rows so that a tool is a row and nothing in `commands/` branches on a tool id.

## What Changes

- **35 new rows in `HARNESS_TABLE`**, appended after today's four in upstream
  `AI_TOOLS` order: `amazon-q`, `antigravity`, `auggie`, `bob`, `cline`,
  `command-code`, `codeartsagent`, `devin`, `forgecode`, `codebuddy`,
  `continue`, `costrict`, `crush`, `cursor`, `factory`, `gemini`, `hermes`,
  `iflow`, `junie`, `kilocode`, `kimi`, `kiro`, `lingma`, `minimax-code`,
  `vibe`, `oh-my-pi`, `pi`, `codeassistant`, `qoder`, `qwen`, `rovodev`,
  `roocode`, `trae`, `zed`, `zcode`. Each writes cospec's own canon bodies
  (never an upstream `/opsx:*` template) at the paths the pinned binary's
  `init --tools <id>` writes, with `opsx` respelled `cospec`: skills at
  `<skillsDir>/skills/cospec-<skill>/SKILL.md` (or `~/.minimax/skills` for
  `minimax-code`), commands at the adapter's directory, file name, extension and
  wrapper. Every one of the 40 ids except `github-copilot` becomes a valid
  `--harness`/`--tools` value. `windsurf` resolves to `devin`, as upstream's
  `TOOL_ID_ALIASES` does.
- **New rendering shapes (`render.ts`, `adapters.ts`).** Two command serializers
  (`markdown-header`, `plain`) whose files carry no frontmatter and are
  manifest-tracked like a TOML command. Two skill-reference dialects (`skill`:
  `/cospec-<skill>` or Kimi's `/skill:cospec-<skill>`; `prose`: "the
  cospec-<skill> skill"), and a per-row skill dialect beside the command dialect
  (Devin's skills use the skill spelling while its workflows are flat). A
  per-row argument placeholder (`$ARGUMENTS` or Pi's `$@`). Frontmatter builders
  for every upstream command wrapper.
- **Shared `.agents/skills` arbitration.** `codex`, `agents`, `zed` and
  `antigravity` all write skills to `.agents/skills`. One writer per shared
  skills root is chosen with upstream's precedence (marker, then cospec's
  pre-marker evidence, then a skills-native row, then table order), and
  `generate()` writes a literal `.agents/skills/.cospec-target` marker naming
  it. `update`, `doctor` and `update --check` read the same arbiter.
- **Legacy tool roots.** Upstream's `LEGACY_TOOL_ROOTS` moves of
  OpenSpec-managed content are ported: `.kimi`→`.kimi-code` and
  `.agent`→`.agents` with no consent, `.codex`→`.agents` after generation, and
  `.windsurf`→`.devin` under upstream's consent policy (`init` with the tool
  selected moves without asking; `update` asks only on an interactive terminal
  without `--force`). Upstream's cleanup of OpenSpec-written Codex global
  prompts (`$CODEX_HOME/prompts`, else `~/.codex/prompts`, allowlisted
  `opsx-*.md` names, only after the replacement skills are written) is ported.
  Both report through the existing leftover report and removal flags.
- **Leftover sweep for every tool.** The opsx leftover scan behind
  `init --remove-opsx` and doctor's `opsx-leftover` reads each row's upstream
  command location (any extension: `.md`, `.toml`, `.prompt`, `.prompt.md`) and
  upstream's `LEGACY_SLASH_COMMAND_PATHS` (pre-opsx `openspec-*` files and
  directory-scoped `managedFileNames`), still gated on provenance.
- **Per-file write failures.** `generate()` isolates a write failure (`EACCES`,
  `EPERM`, `EROFS`, `ENOTDIR`, `EISDIR`) to the file, keeps writing every other
  file and harness, reports `failed: {path, error}[]` in the `--json` document
  and the receipt, and exits 1, as the pinned binary's `init` does for a failed
  tool.
- **Home skills root.** The resolved home skills root (`USERPROFILE`, else
  `HOME`, else `os.homedir()`) becomes a managed root, so `minimax-code` writes,
  detects and provenance-gates removal there the way repo rows do.
- **Unknown tool hint.** An unknown `--harness`/`--tools` value also prints
  upstream's fallback hint, spelled for the flag typed:
  `Tool not listed? Use --tools agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`
- **Docs**: `apps/docs/guide/harness-setup.md` (the target table that owns the
  per-tool facts, and its "no global state under your home directory" sentence),
  `apps/docs/reference/commands.md` (`--harness` values, `failed`, exit codes,
  `update` consent), `docs/harness-integration.md`, and `.agents/shared.md` +
  `mise run agents:sync`.

**BREAKING (output and detection):**

- `cospec init --harness all` (`--tools all`) selects 39 tools instead of 4: it
  writes 35 more tool directories, plus `~/.minimax/skills/` under the home
  directory. The receipt's `Harness:` line, the setup notes and the IDE restart
  line grow accordingly. The `all` receipt's hint stays `/cospec:propose`
  because `claude` is still the first row.
- `init` auto-detection and `update`'s harness detection now cover every row. A
  repo holding, say, `.cursor/` or `.gemini/` auto-selects that tool on a bare
  `cospec init`; `update` regenerates every row it finds cospec files for.
- Codex's `detectionPaths` become upstream's
  `['.agents/skills', '.codex/skills']`, arbitrated like upstream's
  `available-tools.js` (a `/skills` path is not an independent signal). A repo
  whose only Codex evidence is a bare `.codex/` directory (no cospec skills, no
  rules file) no longer auto-selects `codex`.
- `codex`+`agents` (and now `zed`/`antigravity`) init and update additionally
  write `.agents/skills/.cospec-target`. Every skill, command and rules file the
  four existing rows render stays byte-identical to `main`.
- The receipt's shared-root line for any `.agents` row changes from
  `skills for codex/agents share the .agents/skills root (identical files)` to
  `skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for <writer>)`,
  so the `codex` and `agents` receipt goldens change in that line.
- `cospec update` and `cospec init` exit 1, with every other file written, when
  a harness file cannot be written; previously the first `EACCES` aborted the
  whole run with an uncaught error.
- An unknown `--harness`/`--tools` value's error gains a second line (the
  fallback hint above).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-workflows`: the shared `.agents/skills` requirement is restated for N
  rows with an arbiter and a cospec ownership marker; requirements added for the
  tool matrix (every pinned id but `github-copilot` selectable, upstream paths
  with `opsx`→`cospec`), skill-reference dialects, frontmatter-less command
  serializers, argument placeholders, the home skills root, legacy tool roots,
  per-file write failures and the unknown-tool hint.
- `opsx-migration-detection`: requirements added for the leftover sweep over
  every row's upstream command location and `LEGACY_SLASH_COMMAND_PATHS`, the
  provenance each upstream shape is recognised by, and the Codex global prompt
  cleanup.

## Impact

- `apps/cli/src/harness/adapters.ts`: 35 rows; `BodyDialect` gains `skill` and
  `prose`; row fields `skillDialect`, `skillInvocationPrefix`,
  `legacyToolRoots`; `CommandSurface.serializer` gains `markdown-header` and
  `plain`; `injectArguments` becomes a placeholder value; `HARNESS_ID_ALIASES`;
  frontmatter builders; receipt-invocation helper for the `prose` dialect.
- `apps/cli/src/harness/render.ts`: the two serializers, the skill dialect, the
  `$@` placeholder, a `skillWriters` option that renders a shared root's skills
  from its arbitrated writer only.
- `apps/cli/src/harness/shared-root.ts` (new): the arbiter, marker read/write,
  `isSharedSkillTargetActive`.
- `apps/cli/src/harness/legacy-skills.ts`: legacy tool-root moves and the Codex
  global prompt cleanup.
- `apps/cli/src/commands/{init,update,doctor}.ts`: generic, table-derived wiring
  only (aliases, arbiter, failed entries, home root, leftover sweep). No branch
  on a tool id is added.
- `apps/cli/src/core/managed-files.ts`: home-root containment for removal.
- Tests: `apps/cli/test/contract/harness-matrix.test.ts` (new),
  `apps/cli/test/fixtures/upstream-init/*.json` (oracle captures, committed by
  this planning commit), new per-row render goldens, reachability alias path,
  `parity-pending.yaml` entries removed.
- Docs: `apps/docs/guide/harness-setup.md`, `apps/docs/reference/commands.md`,
  `docs/harness-integration.md`, `.agents/shared.md` (synced to `CLAUDE.md` and
  `AGENTS.md`).
- No dependency, schema or wrapped-binary call changes. The pinned `AI_TOOLS`,
  adapters and `LEGACY_*` tables are imported in tests only.

## Surfaces

- [x] interactive — `cospec init`/`update` receipts, `--harness` values,
      `update`'s `.windsurf` consent question, `doctor` findings
- [ ] deploy
- [x] integration — each tool's own file contract (directory, file name,
      extension, frontmatter keys, invocation syntax) as the pinned adapters
      declare it
- [x] agent-behavior — the skill and command files 35 more agents load, and how
      their bodies spell workflow references
