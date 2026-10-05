# Proposal

## Why

Two user-visible defects on `main` were surfaced while reviewing
`harness-adapter-table` (PR #51). That change was held to byte-identical output,
so it could not fix either, and no later feature change may absorb them
(cospec-roadmap ruling 2026-10-04): each is fixed here, in its own `fix` PR
sequenced directly after #51 and before `tool-matrix` starts.

1. **The init receipt's closing hint is always spelled for Claude Code.**
   `cospec init` ends every receipt with
   `Try: /cospec:propose "feat: <what you want to build>"` and
   `Lightweight change? /cospec:propose "ci: fix release workflow" — 3 short artifacts.`
   whichever harness was selected. `/cospec:propose` exists only in Claude
   Code's namespaced command dir. An OpenCode user who types it gets an unknown
   command; OpenCode registers `/cospec-propose`. A Codex or other
   `.agents/skills` user gets nothing, because that root has no slash commands
   and the skill is invoked as `$cospec-propose` (Codex) or `/cospec-propose`
   (other agents). The receipt's last instruction is wrong for three of the four
   harnesses.
2. **`cospec doctor` checks markdown cospec never wrote.** Doctor's frontmatter
   and reference checks (`stale-harness`, `mixed-versions`, `dangling-ref`) read
   every `.md` file under any top-level dir that holds a row's skills root
   (`.claude/`, `.opencode/`, `.agents/`, `.codex/`), not just the files cospec
   generates. A user's own `.claude/notes.md` that mentions `/cospec:foo` fails
   doctor with a `dangling-ref` ERROR. A nested worktree's checkout under
   `.claude/worktrees/<name>/` is checked as if it were this repo's harness, so
   its older generated files report `stale-harness` and `mixed-versions`, and
   its references are resolved against the wrong tree. Doctor exits non-zero on
   a healthy repo.

## What Changes

- **Receipt hint follows the selected harness.** `init`'s two closing hint lines
  are rendered through the first selected row's body dialect and invocation
  prefix with the same `transformBody` that renders workflow bodies. Claude
  (`canonical`) prints `/cospec:propose`; OpenCode (`flat`, `/`) prints
  `/cospec-propose`; Codex and agents (`shared`) print
  `$cospec-propose (Codex) or /cospec-propose (other agents)`, the spelling the
  shared skills already use. The first selected row is the first id in the
  `--harness` list as typed, or the first detected row in table order. `all` and
  the fresh-repo default both start with `claude`, so their receipts stay
  byte-identical. With `--harness none` no row is selected, and the hint keeps
  today's `/cospec:propose`.
- **Doctor reads only what cospec writes.** `isHarnessDocument`, the predicate
  behind doctor's `stale-harness`, `mixed-versions` and `dangling-ref` checks,
  accepts exactly two shapes:
  - `<skills-root>/<skill>/SKILL.md`: one directory between a row's project
    skills root (or legacy skills root, such as `.codex/skills`) and the file.
  - The table's command paths:
    `<commands.dir>/<commands.file with {command} as one path segment><commands.extension>`,
    for markdown-serializer rows.

  Any other markdown under a harness dir is no longer a harness document: a
  user's notes, a README, or a nested worktree's copy of the repo.

- **opsx leftover detection is unchanged.** Upstream's legacy command paths
  (`.claude/commands/opsx/<id>.md`, `.opencode/commands/opsx-<id>.md`) and every
  other file today's leftover scan reads stay in init's leftover scan only. The
  scan moves into `init.ts`, and doctor's `opsx-leftover` check reads the same
  scan, as the `opsx-migration-detection` spec requires. Provenance still
  decides what is a leftover.

**BREAKING (output):**

- The `cospec init` receipt for `--harness opencode`, `--harness codex` and
  `--harness agents` (and for any list or detection whose first row is one of
  them) ends with the corrected hint lines. The `opencode`, `codex` and `agents`
  receipt goldens change by design. The `claude`, `all`, default and `none`
  goldens do not change.
- `cospec doctor` (text and `--json`) no longer reports `stale-harness`,
  `mixed-versions` or `dangling-ref` findings for markdown outside
  `<skills-root>/<skill>/SKILL.md` and the table's command paths. A repo that
  failed doctor only because of such a file now passes, and its findings and
  `summary` counts shrink. Findings on files cospec writes are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-workflows`: the spec says nothing about where doctor's harness checks
  stop or about how the receipt hint is spelled. That gap is how both defects
  shipped without breaking a requirement. This change adds a requirement for
  each.

## Impact

- `apps/cli/src/harness/adapters.ts`: `isHarnessDocument` narrowed to the two
  shapes, and its docstring rewritten. No longer "every `.md` file under the
  scan roots".
- `apps/cli/src/commands/init.ts`:
  - The receipt's hint lines come from the first selected row through
    `transformBody`.
  - The leftover-scan predicate and walker (today's breadth) live here, shared
    by `findOpsxFiles` and doctor.
- `apps/cli/src/commands/doctor.ts`:
  - `harnessMarkdownFiles` collects the narrowed set.
  - `checkOpsx` reads init's leftover scan instead of the harness set.
- `apps/cli/src/harness/render.ts` (only if needed): the workflow-manifest read
  is shared, so init builds its `skillById` from the same canon manifest instead
  of a second copy.
- Tests:
  - `test/unit/harness/adapters.test.ts`: the `notes/anything.md` assertion
    flips under this ruling.
  - `test/unit/init/doctor.test.ts` and `test/unit/init/doctor-rows.test.ts`:
    new false-positive and positive rows.
  - The receipt unit tests: one per dialect.
  - `test/integration/__golden__/harness-wiring/init-receipts/{opencode,codex,agents}.txt`.
- Docs:
  - `apps/docs/guide/harness-setup.md`: the receipt hint's per-harness spelling.
  - `apps/docs/reference/commands.md`: the `cospec doctor` row's scan boundary
    and BREAKING note.
  - `docs/harness-integration.md`: the two "known defect" passages rewritten.
  - `.agents/shared.md`, then `mise run agents:sync` for
    `CLAUDE.md`/`AGENTS.md`.
- Release notes: communique writes them from the squash commit, so the commit
  body and PR body carry the BREAKING list above.
- This change's own PR number is recorded in its artifacts once the PR is open.
  `harness-adapter-table`'s artifacts refer to this change by slug.

## Surfaces

- [x] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
- [ ] deploy — deploy/runtime/CI-execution topology (infra, Dockerfile, workflow
      runtime, secrets, bind address)
- [ ] integration — a third-party/external contract (SDK, OAuth, schema/id-type
      reconciliation)
- [ ] agent-behavior — prompts, tools, model routing, or agent output shape
