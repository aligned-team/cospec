# Design

## Context

### Structure before

A tool's layout is declared in five places that agree only by hand:

| Fact                                                                 | Where it lives today                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| The set of tools, and its order                                      | `adapters.ts` `HarnessName` union + `HARNESS_NAMES`                                        |
| Skills dir, commands dir, filename, rules file, legacy dirs, dialect | `canon/workflows/harness.yaml` `harnesses:` block, read by `render.ts` as `HarnessSurface` |
| Command frontmatter shape                                            | `render.ts`: `harness === 'claude' ? buildClaude… : buildOpencode…`                        |
| OpenCode `$ARGUMENTS` injection                                      | `render.ts`: `harness === 'opencode' && w.takesArguments`                                  |
| Init detection paths                                                 | `init.ts` `DETECT_PATHS`                                                                   |
| Receipt line per tool                                                | `init.ts` `RESTART_LINES`                                                                  |
| `--harness` value set and error text                                 | `init.ts` `parseHarnessArg`, `VALID_HARNESS_MSG`                                           |
| Update/doctor detection                                              | `update.ts` `SKILL_BASE`, `LEGACY_SKILL_BASE`, `HARNESS_MARKER`, `SENTINEL_SKILL`          |
| Removal containment roots                                            | `update.ts` `MANAGED_REMOVAL_ROOTS`, derived from the three maps above                     |
| Scan roots for leftovers, drift, sidecars                            | `init.ts` and `doctor.ts`: `for (const h of HARNESS_NAMES) walk(\`.${h}\`)`                |
| Dangling-reference resolution                                        | `doctor.ts` second copies of `SKILL_BASE` and `COMMAND_LOC`                                |

The pinned OpenSpec dist declares the same facts per tool in two places:
`dist/core/config.js` `AI_TOOLS` (40 ids: `skillsDir` as a tool root with skills
at `<skillsDir>/skills/<name>/SKILL.md`, `legacySkillsDirs`, `globalSkillsDir`
resolved under `USERPROFILE`/`HOME`/`os.homedir()`, `detectionPaths`,
`searchAliases`, `setupNote`, `requiresIdeRestart`) and
`dist/core/command-generation/adapters/*.js` (a file path per command id,
`invocationPrefix`, and a `formatFile` per tool, including Gemini's TOML with
its basic and multiline-basic string escaping, Continue's `.prompt`, Kiro's
`.prompt.md`, Amazon Q's `@` prefix and Cline's commands root
`.clinerules/workflows` beside skills under `.cline`).

The later tool-target changes add rows only: `tool-matrix` owns rows, the
shared-root arbiter, legacy moves and the `update`/`doctor`/`init` behaviour it
needs, but no track of it owns `render.ts`. So every rendering shape its rows
need has to exist, tested, when this change lands.

### Structure after

```
adapters.ts   HARNESS_TABLE: readonly HarnessAdapter[]   ← the one declaration of tool layout
              HarnessName  = (typeof HARNESS_TABLE)[number]['id']
              HARNESS_NAMES, isHarnessName, adapterFor(), scan/removal-root helpers
                 │
render.ts     renderHarnessFiles({ harnesses, adapters? = HARNESS_TABLE, … })
              reads rows; serializer + extension per row; no id branches
                 │
init.ts       --harness from HARNESS_NAMES; detection from row.detectionPaths;
update.ts     receipt from row.setupNote (+ requiresIdeRestart line);
doctor.ts     skill/command/legacy/marker/scan roots from rows
harness.yaml  workflows: only (workflow identity stays canon)
```

Row shape (field names follow `AI_TOOLS` wherever upstream has the field, with
upstream's meaning):

```ts
interface HarnessAdapter {
  id: string // --harness value; today's four ids
  displayName: string // AI_TOOLS `name`
  skillsDir?: string // tool root: skills at <skillsDir>/skills/<skill>/SKILL.md
  globalSkillsDir?: string // home-relative root: <home>/<globalSkillsDir>/skills/…
  legacySkillsDirs?: string[] // roots: <legacy>/skills/<skill>/SKILL.md
  commands?: {
    dir: string // independent of skillsDir
    namespacing: 'namespaced' | 'flat'
    file: string // 'cospec/{command}' | 'cospec-{command}'
    extension: '.md' | '.prompt' | '.prompt.md' | '.toml'
    serializer: 'markdown' | 'toml'
    frontmatter?: CommandFrontmatterBuilder // markdown only
    injectArguments?: boolean // OpenCode's $ARGUMENTS paragraph
  }
  invocationPrefix: '/' | '@'
  bodyDialect: 'canonical' | 'shared' | 'flat'
  rulesPath?: string // codex: .codex/rules/cospec.rules
  requiresIdeRestart: boolean
  detectionPaths: string[]
  setupNote?: string
  searchAliases?: string[]
}
```

The four rows, in today's order:

| id         | skillsDir   | legacySkillsDirs | commands                                                                                      | dialect     | rulesPath                   | detectionPaths       |
| ---------- | ----------- | ---------------- | --------------------------------------------------------------------------------------------- | ----------- | --------------------------- | -------------------- |
| `claude`   | `.claude`   | —                | `.claude/commands`, namespaced, `cospec/{command}`, `.md`, claude frontmatter                 | `canonical` | —                           | `['.claude']`        |
| `codex`    | `.agents`   | `['.codex']`     | —                                                                                             | `shared`    | `.codex/rules/cospec.rules` | `['.codex']`         |
| `opencode` | `.opencode` | —                | `.opencode/commands`, flat, `cospec-{command}`, `.md`, minimal frontmatter, `injectArguments` | `flat`      | —                           | `['.opencode']`      |
| `agents`   | `.agents`   | —                | —                                                                                             | `shared`    | —                           | `['.agents/skills']` |

All four have `invocationPrefix: '/'` and `requiresIdeRestart: false`, and each
`setupNote` is today's `RESTART_LINES` string for that id, verbatim.

### Migration steps

1. Commit golden files of the unmodified render (each tool alone, all four
   together) and a characterization of the wiring (receipt lines, `--harness`
   error text, both detection systems, removal containment, doctor findings on
   fixture trees).
2. Add the table beside the existing structures (additive; nothing reads it yet
   except the compatibility exports and a test asserting the table derives
   exactly the paths the `harnesses:` block declares).
3. Switch `render.ts` to the table, delete `HarnessSurface`, the `harnesses:`
   block and the `opencode` dialect name; the golden files still match.
4. After `unknown-option-contract`, `upstream-spellings` and
   `passthrough-json-and-doctor` merge: rebase, re-take the wiring
   characterization on the rebased tree, then move `init`, `update` and `doctor`
   onto the table; the characterization still matches.

## Goals / Non-Goals

**Goals:**

- One typed declaration of every tool's layout, which the later tool rows extend
  without touching `render.ts` or any command's detection code.
- `render.ts` able to emit every shape the pinned adapters use, each shape
  exercised by a unit test on a fixture row.
- Zero change to any byte cospec writes or prints, proven against a baseline
  committed before the first source edit.

**Non-Goals:**

- Any row beyond the four, and any change to the four rows' observable values:
  `tool-matrix` and `github-copilot` add rows and align detection.
- Reading `searchAliases` or `TOOL_ID_ALIASES` in `--harness`: `tool-matrix`.
- Writing to a home-directory skills root: `tool-matrix` (its `update.ts` track
  adds the home root to the managed roots).
- Replacing the codex/agents rules-file tie-break with N-way arbitration:
  `tool-matrix`.
- Moving init's Claude-only behaviour into the table. `init` merges
  `Bash(cospec *)` into `.claude/settings.json` only when `claude` is selected,
  and selects `claude` on a fresh repo where no row is detected. Both are
  deliberate Claude-only behaviour, not tool layout, and stay in `init.ts`. So
  does the receipt's closing `Try: /cospec:propose …` hint, which every
  selection prints in the canonical spelling; respelling it per selected row
  would change the receipt.

## Decisions

1. **The table is a typed TypeScript array in `adapters.ts`, and `HarnessName`
   is derived from it.** Rejected: keeping tool layout in `harness.yaml`. YAML
   cannot hold the frontmatter builders, is untyped at the import site, and the
   `tool-matrix` contract test compares rows directly against the imported
   pinned `AI_TOOLS`. Also rejected: one module per tool as upstream does. The
   later change splits its work by disjoint rows of one file, and a single array
   keeps the order that receipts and detection depend on visible in one place.

2. **The `harnesses:` block leaves `harness.yaml`.** Rejected: keeping it and
   asserting it matches the table. That leaves two sources of one fact. The
   `workflows:` block stays in canon, since workflow identity is canon content
   and the later profile and canon-parity changes edit that block, not this one.

3. **`HarnessName`, `HARNESS_NAMES` and `isHarnessName` stay exported from
   `adapters.ts` and re-exported from `render.ts`, derived from the table.**
   This lets `init.ts`, `update.ts` and `doctor.ts` compile and behave unchanged
   through steps 2 and 3, so the wiring track can wait for the three changes
   that edit those files. Rejected: switching callers in the same commit as the
   table. That puts this change's diff in the files those three changes are
   rewriting. Integration note: `HARNESS_NAMES` stays exported from
   `adapters.ts` under that name, as a readonly array of harness ids with
   today's values in today's order. Another change's reachability test imports
   it, so its name and shape are frozen; this change derives it from the table
   and never renames, reshapes or reorders it.

4. **Fields that share an `AI_TOOLS` name keep upstream's meaning.** `skillsDir`
   is the tool root (`.claude`, not `.claude/skills/{skill}`), and
   `legacySkillsDirs` are roots (`.codex`, not `.codex/skills/{skill}`). The
   `{skill}` path is derived as `<root>/skills/<skill>/SKILL.md`, which gives
   today's paths exactly. Rejected: keeping cospec's template strings. Every
   later row would then be a translation of its upstream entry, and the per-tool
   contract test would need a translation layer that could itself drift.

5. **The four rows keep today's detection values where upstream's differ.**
   Upstream's codex `detectionPaths` is `['.agents/skills', '.codex/skills']`.
   Using it would select codex on an agents-only repo, which is a behaviour
   change. So codex keeps `['.codex']`, and aligning it is `tool-matrix`'s work.
   Data that changes no behaviour does come from upstream: `displayName`, and
   the `agents` row's `searchAliases`, which nothing reads until `tool-matrix`.

6. **Both detection systems stay, fed from different fields.** Init's
   path-existence check reads `detectionPaths`. Update's and doctor's
   sentinel-skill check reads the skills root derived from `skillsDir` plus
   `legacySkillsDirs`. The codex/agents tie-break keeps its existing marker, now
   taken from the row's `rulesPath` rather than a separate `HARNESS_MARKER`
   literal. Rejected: merging the two systems. They answer different questions
   ("is this tool present?" versus "did cospec write here?"), and merging them
   would change what `update` regenerates.

7. **Command files are `<commands.dir>/<commands.file><extension>`, with
   namespacing declared beside the filename template.** A table-invariant unit
   test asserts every row agrees: `namespaced` iff the template is
   `cospec/{command}`, `flat` iff it is `cospec-{command}`. Rejected: deriving
   namespacing from the filename as upstream's `getInvocationStyleForPath` does.
   The body dialect and the invocation both read namespacing, and a declared
   field with an invariant test fails loudly, where a derivation fails silently.

8. **`bodyDialect` stays explicit per row. The `opencode` dialect becomes
   `flat`, which respells `/cospec:<id>` as `<invocationPrefix>cospec-<id>`.**
   With OpenCode's `/` this is byte-identical to today, and Amazon Q's `@` needs
   no new dialect. Rejected: deriving the dialect from namespacing and prefix.
   Skills-only rows (`codex`, `agents`) have neither, and the shared root's
   respelling is its own rule. Also rejected: keeping the name `opencode`,
   because every flat-named tool added later would carry another tool's name.

9. **Serializers are `markdown` and `toml`. A TOML file carries no frontmatter
   and is manifest-tracked like the Codex rules file.** `markdown` is today's
   `---\n<yaml>---\n<bodySection>`. `toml` is upstream Gemini's
   `description = "…"` / `prompt = """…"""` layout, with its two escaping
   functions ported. Its provenance lives in `openspec/.cospec-manifest.json`,
   so `RenderedFile.frontmatter` and `contentHash` are `null`, and `generate()`
   routes on `frontmatter === null` instead of `kind === 'rules'`. For the four
   rows that is the same routing. Rejected: adding `author`/`contentHash` keys
   to the TOML. A tool's command parser may reject unknown keys, and the
   manifest path already provides provenance, drift detection and contained
   removal. `update`'s orphan sweep, which removes an unmodified cospec command
   a run no longer emits, matches each command dir's entries against the
   `extension` of the markdown-serializer rows that render into it, never a
   literal `.md`, and leaves a TOML row's dir to the manifest. Doctor's
   frontmatter and reference scan and both opsx leftover scans read files the
   same way (`isHarnessDocument`): each markdown row's `commands.extension`
   under its `commands.dir`, plus every file with the skill file's extension
   under a top-level dir that holds a row's skills or legacy skills root, not
   only the skill files. For the four rows that is every `.md` file under the
   scan roots, as before: a user's markdown under `.claude/` (a note, a nested
   worktree's copy) is read too, and a row whose skills root sits under
   `.github` would read every `.md` file there.

10. **Command frontmatter is a builder function on the row.** Rejected: an enum
    switched in `render.ts`. Each later tool's frontmatter keys (for example
    `invokable`, `argument-hint`) would then need a `render.ts` edit, and the
    change adding those tools owns no `render.ts` track.

11. **A home-scoped skills root renders with `scope: 'home'` and a home-relative
    path. `generate()` refuses such a file with an internal error until the home
    root is a managed root.** Every file the four rows render has
    `scope: 'project'`. Rejected: silently joining a home-relative path onto the
    repo, which would write outside the tool's real location.

12. **Scan roots come from the table in two passes: each row's primary root in
    table order, then any remaining roots.** A row's primary root is the top
    segment of its commands dir, else its rules file, else its skills root. For
    the four rows this derives `['.claude', '.codex', '.opencode', '.agents']`,
    today's `.${id}` walk order, and a unit test pins that. Doctor attributes a
    file to the row with a surface (project or legacy skills root, commands dir,
    rules dir) that is the longest prefix of it, so a row whose commands and
    skills live under different roots owns both trees, and a commands dir under
    another row's primary root (Antigravity's `.agents/workflows`) stays its own
    row's. A surface two rows share goes to the row whose primary root also
    prefixes the file, then to the earlier row, which keeps `.agents/skills`
    with `agents` over `codex`; a file on no surface goes to the first row whose
    primary root prefixes it. For the four rows that is today's attribution. Its
    dangling-ref check matches `/cospec:<id>`, `/cospec-<id>` and the owning
    row's `invocationPrefix` spelling (`@cospec-<id>`). Rejected: a single
    first-occurrence pass, which yields `.claude, .agents, .codex, .opencode`
    and reorders doctor's findings. Rejected: sorting findings, which changes
    today's order.

13. **`setupNote` carries today's receipt lines verbatim, and upstream's IDE
    restart line is driven by `requiresIdeRestart`.** The receipt prints each
    selected row's `setupNote` in selection order. After them it prints
    upstream's single `Restart your IDE to refresh commands.` (or `skills.`)
    when any selected row sets the flag, with commands winning as in upstream's
    `resolveIdeRestartSurface`. None of the four rows sets it. cospec's
    `setupNote` is a superset of upstream's: a row whose upstream entry has a
    `setupNote` must carry that text verbatim, and a cospec-only note on a row
    upstream leaves bare is a cospec addition.

14. **Byte-identity is proven with committed raw golden files, not bun
    snapshots.** The test compares `Buffer`s and the exact path set. It writes
    only under an explicit environment variable, which tasks 1.1 and 1.2 use
    once. The proof is `git diff --exit-code <task 1.1 commit> HEAD` over the
    render golden directory. Rejected: `toMatchSnapshot`. It stores escaped
    strings, `--update-snapshots` rewrites them in place, and the existing
    content snapshot deliberately omits `agents`.

15. **`RenderOptions.adapters` is the test seam.** The render-conflict case
    injects two rows that share an output root under different dialects,
    replacing today's regex edit of a copied `harness.yaml`. Fixture rows for
    TOML, `.prompt`, `.prompt.md`, a split commands root, `@` and home scope go
    through the same seam. None of them enters `HARNESS_TABLE`.

## Risks / Trade-offs

- [A regenerated golden file hides an output change] → The golden writer runs
  only under its environment variable. The acceptance probe is a `git diff`
  against the task 1.1 commit, and the existing
  `apps/cli/test/unit/harness/__snapshots__/` files must also show no diff from
  `main`.
- [Scan-root or detection order drifts, reordering receipts or doctor findings]
  → Decision 12's derivation is pinned by a unit test, and the wiring
  characterization compares full receipt and findings text.
- [The three gating changes legitimately change receipts, `--json` documents or
  doctor output, so the task 1.2 wiring characterization stops matching after
  the rebase] → Task 5.2 re-takes that characterization on the rebased,
  unmodified tree. Its commit touches only golden files, and task 5.2 records
  that `apps/cli/src` is unchanged against `main` at that commit. The render
  golden files from task 1.1 are not re-taken.
- [A shape the later rows need is missing from `render.ts`, and the change that
  adds them owns no `render.ts` track] → Each shape in the pinned adapters
  directory is covered by a fixture-row test here. One gap is known: Cline's
  commands are a Markdown header with no YAML frontmatter, so cospec's
  provenance frontmatter on those files is `tool-matrix`'s call, made by its
  per-tool contract test.
- [Later rows need `render.ts` work this change does not do] → `tool-matrix`
  gets its own `render.ts` track for Cline's commands and for skill dialects
  whose root is not `.agents`. Aligning codex `detectionPaths` with upstream's
  (decision 5) happens in that change too. Its `setupNote` assertion is
  "includes upstream's note", per decision 13's superset rule, not equality.
- [The compiled binary embeds canon, and the `harnesses:` block leaves an
  embedded file] → The table is ordinary bundled TypeScript.
  `mise run test:pack` and a built-binary `init --harness all` run cover the
  compiled path.
- [`legacy-skills.ts` keeps its own `LEGACY_CODEX_SKILL_ROOT` constant, which
  `tool-matrix` owns] → A unit assertion ties that constant to the codex row's
  derived legacy skills root.

## Seam ownership

| Shared state                                                    | Owner after the move                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Tool layout, order, notes, detection data                       | `HARNESS_TABLE` in `harness/adapters.ts`; every consumer reads it and none keeps a copy                      |
| Workflow identity (id, command, skill, title, `takesArguments`) | `canon/workflows/harness.yaml` `workflows:` block, unchanged                                                 |
| Output-path dedupe on the shared `.agents/skills` root          | `render.ts` `emit()`. Rows that share an output root must share a dialect, or rendering throws               |
| codex/agents tie-break                                          | `update.ts` `detectHarnesses`, marker taken from the codex row's `rulesPath` (until `tool-matrix`'s arbiter) |
| Removal containment roots                                       | `update.ts`, derived from the table; containment check unchanged                                             |
| Manifest (`openspec/.cospec-manifest.json`)                     | `update.ts` `generate()`, now keyed on `frontmatter === null`; tracks the rules file and any TOML command    |
| Legacy `.codex/skills` migration                                | `harness/legacy-skills.ts`, unchanged                                                                        |
| openspec's own shared skills root (`OPSX_SHARED_SKILL_ROOT`)    | `init.ts`: upstream's layout, not a cospec row, so both opsx leftover scans walk it whatever rows exist      |
| Doctor's `WORKFLOW_SKILL` map                                   | `doctor.ts`, unchanged: it mirrors workflow identity, not tool layout                                        |
