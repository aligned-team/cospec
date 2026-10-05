# Design

## Context

**Receipt hint.** `printReceipt` in `apps/cli/src/commands/init.ts` pushes the
two closing lines as string literals spelled for Claude
(`Try: /cospec:propose …`, `Lightweight change? /cospec:propose …`). Every other
per-harness line in the receipt comes from the table: setup notes, the IDE
restart line, and the shared-root line. These two lines were never moved onto
it. The table already says how a row spells a workflow reference: `bodyDialect`
plus `invocationPrefix`, applied by `transformBody` in `harness/adapters.ts`.
The fix is to use that, not to add a second spelling table.

**Doctor scope.** `isHarnessDocument` in `harness/adapters.ts` accepts any
`SKILL_EXTENSION` (`.md`) file whose top segment matches a row's project or
legacy skills root. It also accepts any file with the row's extension under a
markdown row's `commands.dir`. The top-segment test is what pulls in
`.claude/notes.md` and `.claude/worktrees/<wt>/**`. One predicate feeds three
readers:

1. Doctor's `stale-harness`/`mixed-versions` (`checkStaleness`).
2. Doctor's `dangling-ref` (`checkDanglingRefs`). Both read
   `harnessMarkdownFiles`.
3. The opsx leftover scan, shared by `findOpsxFiles` (init) and `checkOpsx`
   (doctor), which also iterates `harnessMarkdownFiles`.

Readers 1 and 2 should only check files cospec writes. Reader 3 has to find
files _openspec_ wrote: its legacy command paths, such as
`.claude/commands/opsx/<id>.md` and `.opencode/commands/opsx-<id>.md` in the
pinned 1.13.1 dist's `core/command-generation/adapters/{claude,opencode}.js`. A
cospec command template does not match those paths. Reader 3 is gated on
provenance (frontmatter), never on path, so its breadth produces no false
findings on user files.

## Goals / Non-Goals

**Goals:**

- The receipt's hint is spelled the way the first selected row invokes a
  workflow. Receipts whose first row is `claude`, including `all` and the
  default, are byte-identical to `main`, and so is `none`.
- Doctor's frontmatter and reference checks read exactly
  `<skills-root>/<skill>/SKILL.md` (project and legacy skills roots) and the
  table's markdown command paths.
- The opsx leftover scan, and therefore `init --remove-opsx`, `init --json`'s
  `opsx.found` and doctor's `opsx-leftover`, finds exactly what it finds today.

**Non-Goals:**

- Changing what the leftover scan reads. The ruling keeps upstream's legacy
  command paths in init's leftover scan, and this change narrows only the
  harness-document predicate.

## Decisions

1. **The hint goes through `transformBody`.** A new exported helper
   `receiptHintLines(harnesses, table = HARNESS_TABLE)` in `init.ts` builds the
   two lines in canonical spelling and returns them unchanged when `harnesses`
   is empty. Otherwise it passes them through
   `transformBody(line, row.bodyDialect, skillById, row.invocationPrefix)` for
   `row = adapterFor(harnesses[0], table)`. The rendered strings:
   - `claude` (canonical):
     `Try: /cospec:propose "feat: <what you want to build>"`, unchanged.
   - `opencode` (flat, `/`):
     `Try: /cospec-propose "feat: <what you want to build>"`.
   - `codex`, `agents` (shared):
     `Try: $cospec-propose (Codex) or /cospec-propose (other agents) "feat: <what you want to build>"`.

   The `Lightweight change?` line follows the same pattern. The ruling's
   shorthand for codex/agents is `$cospec-propose`. The shared dialect renders
   that token together with its other-agents alternative, as every shared skill
   body does. Shortening it would need a second spelling rule for one receipt
   line, so this change does not.

   _Alternative rejected:_ a per-row `receiptHint` table field. It would repeat
   what `bodyDialect` + `invocationPrefix` already declare, and it could drift
   from the bodies.

2. **`skillById` comes from the canon manifest render.ts reads.** `render.ts`
   parses `canon/workflows/harness.yaml` inline to build `skillById`. The parse
   moves into a small exported loader that both `render.ts` and `init.ts` call,
   so init does not hard-code `propose → cospec-propose`. Doctor keeps its own
   `WORKFLOW_SKILL` map, which this change does not touch.
3. **"First selected row" is `harnesses[0]` in the order `selectHarnesses`
   returns.** An explicit `--harness`/`--tools` list keeps the order typed
   (`opencode,claude` gives OpenCode's spelling). `all`, detection and the
   fresh-repo default are in table order, so `claude` comes first whenever it is
   selected through them.
4. **`isHarnessDocument` matches shapes, not known ids.** A path is a harness
   document when either:
   - It equals `<root>/<segment>/SKILL.md`, where `<root>` is a row's project
     skills root or a legacy skills root, `<segment>` is one non-empty path
     segment, and the match is a prefix match on `<root>/`, not on the top
     segment.
   - For a markdown-serializer row, it matches `<commands.dir>/` +
     `commands.file` with `{command}` as one non-empty path segment +
     `commands.extension` (regex-escaped).

   Shape over the twelve known ids keeps doctor's `dangling-ref` firing on a
   cospec-shaped file that references an unknown workflow, such as the doctor
   golden's `.claude/commands/cospec/opsx-and-dangling.md`. That golden does not
   change. Legacy skills roots stay in: cospec wrote `.codex/skills`, and its
   staleness and references stay checked while `legacy-layout` asks the user to
   migrate. TOML rows' commands stay out, as before (DESIGN decision 9). Only
   acceptance narrows; the walk does not. `harnessMarkdownFiles` still descends
   every scan root, nested worktrees included, and no directory is pruned.

5. **The leftover scan moves to `init.ts`.** The current breadth becomes init's
   own predicate, `isLeftoverCandidate`, and a walker
   `leftoverScanFiles(cwd, table)` returns `{ relpath, text }`. `findOpsxFiles`
   (init) and `checkOpsx` (doctor) both read it, so the
   `opsx-migration-detection` requirement "the scan behind
   `cospec init --remove-opsx` and `cospec doctor`'s `opsx-leftover` finding is
   the same scan" still holds. The predicate covers:
   - `.md` under a skills or legacy skills top dir.
   - Row-extension files under a markdown row's `commands.dir`.
   - `.agents/skills`.

   Upstream's legacy command paths are reachable only through this predicate.
   `harnessMarkdownFiles` drops its extra `OPSX_SHARED_SKILL_ROOT` walk, because
   the `agents` row's skills root already yields
   `.agents/skills/<skill>/SKILL.md` under decision 4.

6. **Release notes are commit history, with no BREAKING footer.** communique
   (`.github/workflows/release.yml`, `communique.toml`) writes release notes
   from commits. cog.toml turns `!` or a `BREAKING CHANGE:` footer into a major
   bump. Prior BREAKING changes (#54, #59) carried their list in the proposal,
   the docs and the PR body, in prose. This change follows that: the fix
   commit's body and the PR body relay the proposal's BREAKING list, with no `!`
   and no footer.

## Operational surface

Nothing changes in how cospec deploys or runs. The fix touches only strings
printed by a local `cospec init` and the set of files a local `cospec doctor`
reads. There is no bind address, container, network call or secret. The
`bun run` entry, the npm package and the standalone compiled binaries behave the
same. The wrapped OpenSpec binary (pinned 1.13.1, accepted `>=1.0.0 <2.0.0`) is
not called by either code path changed here.

## Risks / Trade-offs

- [A user relied on doctor to lint their own notes under `.claude/`] → That was
  never a documented check. The `commands.md` doctor row now states the
  boundary, and the BREAKING list names it.
- [A future row's skills root contains a non-skill `SKILL.md` deeper down] →
  Decision 4 accepts only one segment between root and file, so deeper
  `SKILL.md` files are ignored by design.
- [Legacy skills root shared with a nested worktree path] → Matching is a prefix
  match on the full root (`.codex/skills/`), so
  `.claude/worktrees/<wt>/.codex/skills/...` is never mistaken for it.
- [Leftover scan keeps reading nested worktrees] → It reads them only for opsx
  provenance, which the ruling leaves as is. A user-authored file there is never
  matched, because provenance decides. An openspec-authored leftover inside a
  nested worktree's checkout is still listed and, with `--remove-opsx`, removed,
  the same as on `main`. That is outside the ruled scope of this change and has
  been raised with cospec-roadmap for a ruling.
