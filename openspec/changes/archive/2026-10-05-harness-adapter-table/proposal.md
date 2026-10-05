# Proposal

## Why

The harness layer is a closed four-member union (`HarnessName` in
`apps/cli/src/harness/adapters.ts`), and each tool's shape is spread over five
places that must agree by hand: the `harnesses:` block of
`canon/workflows/harness.yaml`, `harness === 'claude'` /
`harness === 'opencode'` branches in `render.ts`, `DETECT_PATHS` and
`RESTART_LINES` in `init.ts`, `SKILL_BASE` / `LEGACY_SKILL_BASE` /
`HARNESS_MARKER` in `update.ts`, and a second `SKILL_BASE` / `COMMAND_LOC` copy
in `doctor.ts`. None of them can express the per-tool shapes the pinned OpenSpec
dist declares in `dist/core/config.js` `AI_TOOLS` and
`dist/core/command-generation/adapters/*`: a commands root independent of the
skills root, filename templates, the `.prompt`, `.prompt.md` and `.toml`
extensions, the TOML serializer, the `@` invocation prefix, IDE-restart flags,
detection paths, legacy directories, a home-directory skills root, or a per-tool
setup note. Every later tool target (`tool-matrix`, `github-copilot`) is a row
on a table that does not exist yet, so this restructuring has to land first, and
it has to land without moving a single output byte so that the tool rows that
follow are the only thing that changes what cospec writes.

There is also no per-tool setup-note mechanism: `RESTART_LINES` carries one
fixed restart string per member of the union, so a tool whose setup needs a
manual step (upstream's `setupNote`) has nowhere to put it.

## What Changes

- `apps/cli/src/harness/adapters.ts`: the closed union becomes a per-tool table.
  Each row carries `id`, `displayName`, `skillsDir`, an optional `commandsDir`
  independent of `skillsDir`, an optional `globalSkillsDir`, a command filename
  template, an `extension`, a serializer (`markdown` or `toml`), an invocation
  prefix and namespacing, `bodyDialect`, `requiresIdeRestart`, `detectionPaths`,
  `legacySkillsDirs`, `setupNote` and `searchAliases`, plus the per-row facts
  today's code hard-codes by name (command frontmatter shape, the OpenCode
  `$ARGUMENTS` injection, the Codex rules file). Today's four tools become four
  rows, in today's order: `claude`, `codex`, `opencode`, `agents`.
  `HarnessName`, `HARNESS_NAMES` and `isHarnessName` stay exported, derived from
  the table.
- `apps/cli/src/harness/render.ts`: reads the table instead of the `harnesses:`
  manifest block and the name branches. The serializer is pluggable and the
  extension is per row. Every shape the pinned adapters use (split commands
  root, flat or namespaced filenames, `.md`/`.prompt`/`.prompt.md`/`.toml`,
  TOML, a home-directory skills root) is renderable and unit-tested through
  fixture rows; no production row uses a shape the four tools do not use today.
- `apps/cli/src/canon/workflows/harness.yaml`: the `harnesses:` block is
  removed, so the table is the only source of tool layout. The `workflows:`
  block is untouched.
- `apps/cli/src/commands/{init,update,doctor}.ts` (after
  `unknown-option-contract`, `upstream-spellings` and
  `passthrough-json-and-doctor` merge): `--harness` is parsed from the table,
  detection reads each row's detection and skills fields, the scan and removal
  roots are derived from the table, and the init receipt prints each selected
  row's `setupNote`. Today's `RESTART_LINES` strings become the four rows'
  `setupNote` values verbatim. The init and update receipts also gain the
  consumer of `requiresIdeRestart` (upstream's single "Restart your IDE to
  refresh commands|skills." line); none of the four rows sets the flag, so it
  prints nothing today.
- `apps/cli/test/unit/harness-render.test.ts` plus committed golden files:
  full-content snapshots of claude, codex, opencode and agents, each alone and
  all four together, taken on the unmodified code before any source edit and
  compared byte for byte after.
- `docs/harness-integration.md`: describes the table as the one place a tool's
  layout is declared, and the setup-note mechanism behind the receipt lines.

### Invariants (observable behavior that must not change)

- Every file `renderHarnessFiles` emits for claude, codex, opencode and agents —
  each alone and all four together — is byte-identical: path, content,
  `contentHash`, `kind`, and the harness a shared file is attributed to.
- `mise run generate:check` shows zero diff on this repository's own managed
  tree.
- `HARNESS_NAMES` order stays `claude, codex, opencode, agents`, so receipt
  lines, detection output and the `--harness` error text keep their order.
- The init receipt is byte-identical for every harness selection, including the
  per-harness lines that today come from `RESTART_LINES`.
- The `--harness` value set (`claude`, `codex`, `opencode`, `agents`, `all`,
  `none`, comma lists) and the invalid-value message are unchanged.
- `detectHarnesses` (update and doctor) and init's detection return the same
  harnesses in the same order on every fixture tree, including the codex/agents
  tie-break on the rules file.
- The set of directories a manifest-tracked file may be removed from stays
  `openspec`, `.claude`, `.agents`, `.opencode` and `.codex`; a manifest key
  outside it is still ignored.
- Doctor's findings (drift, legacy layout, staleness, dangling references, stale
  sidecars, leftover opsx files) are the same findings in the same order.
- `--json` documents of `init`, `update` and `doctor` are unchanged.

### Non-goals

- Adding any tool beyond the four, the `windsurf` id alias, `searchAliases` as
  `--harness` values, N-way arbitration of the shared `.agents` root, the legacy
  tool-root moves, the Codex global prompt cleanup, per-file write-failure
  isolation, home-directory skill writes, and aligning the four rows'
  `detectionPaths` with upstream's: all `tool-matrix`.
- The `github-copilot` target and its cloud-agent files: `github-copilot`.
- `init --tools`: `upstream-spellings`.
- Workflow profiles and delivery modes, which filter per tool on top of this
  table: `workflow-profiles`.

## Capabilities

### New Capabilities

None. No requirement is added, modified, removed or renamed.

### Modified Capabilities

None.

## Impact

- Source: `apps/cli/src/harness/adapters.ts`, `apps/cli/src/harness/render.ts`,
  `apps/cli/src/canon/workflows/harness.yaml` (the `harnesses:` block only),
  `apps/cli/src/commands/init.ts`, `apps/cli/src/commands/update.ts`,
  `apps/cli/src/commands/doctor.ts`.
- Tests: `apps/cli/test/unit/harness-render.test.ts` and its golden files (new);
  `apps/cli/test/unit/harness/{adapters,render}.test.ts` follow the moved
  internals (the render-conflict case injects a conflicting row through a
  table-override option instead of editing `harness.yaml`).
- Internal API: `RenderOptions` gains a table override for tests; `RenderedFile`
  gains the output scope (project or home). `HarnessName`, `HARNESS_NAMES`,
  `isHarnessName`, `renderHarnessFiles` and `generate` keep their signatures for
  every caller.
- Docs: `docs/harness-integration.md`. No `apps/docs` page changes, because no
  user-facing behavior changes.
- No dependency, schema, rule id, exit code or generated file changes.

## Surfaces

<!-- None checked: every rendered file, receipt line, error message and JSON document is byte-identical by the invariants above, so no surface changes observably. -->

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
