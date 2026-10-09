# Design

## Context

Every fact below was read from the pinned `@fission-ai/openspec` 1.13.1 dist
under `apps/cli/node_modules/@fission-ai/openspec/dist/` (paths in this document
are relative to it) or probed by running the pinned binary under a sandboxed
`HOME`/`XDG_*`/`CODEX_HOME`/`USERPROFILE`/`ZDOTDIR` below
`/var/folders/tn/_13rsr_n2r10v3s97ms94_xw0000gn/T/claude-501/`. Where the binary
and the roadmap disagree, the binary wins and the entry says so.

**What cospec does today.**

- `renderHarnessFiles` (`harness/render.ts`) emits all twelve workflows per
  selected row. `generate()` (`commands/update.ts`) writes them and removes any
  cospec-managed skill or command file it no longer emits
  (`removeOrphanMarkdown`), so a smaller emitted set would delete files.
- `detectHarnesses` (`update.ts`) decides which harnesses `update` regenerates
  from a sentinel: the `cospec-propose` skill, "the sentinel skill every harness
  always emits". A narrowed set can omit it, and `delivery: commands` omits
  every skill.
- `checkGlobalProfile` (`doctor.ts:737`) reads `profile`/`workflows` from
  `$XDG_CONFIG_HOME` or `~/.config` and reports them as inert. `root.ts`
  (`readDefaultStore`) reads the same file but finds its path through
  `openspec config path`, the binary's own discovery.
- `init`'s refusals are text-only even under `--json`:
  `cospec init --harness bogus --json` prints one
  `cospec: invalid --harness 'bogus'; …` line and exits 1 (probed). The new
  refusals follow that path.

**What the binary does** (the contract this change ports):

- `core/profiles.js`:
  `CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'update', 'sync', 'archive']`;
  `ALL_WORKFLOWS` is the twelve. `getProfileWorkflows` returns the core six for
  any profile but `'custom'`; for `'custom'` it returns the `workflows` list,
  and when the list holds `archive` or `bulk-archive` without `sync` it splices
  `sync` in immediately before the first of them
  (`workflows.slice(0, i), 'sync', workflows.slice(i)`), not at the end.
- `core/global-config.js`:
  `DEFAULT_CONFIG = {featureFlags: {}, profile: 'core', delivery: 'both'}`,
  merged under whatever the file holds. The binary itself tells the two apart:
  `commands/config.js:339-342` prints `profile: <v> (explicit)` when
  `rawConfig.profile !== undefined` and `(default)` otherwise, and the same for
  `delivery`.
- `core/command-surface.js`: `resolveCommandSurfaceCapability` is
  `adapter-backed` for a tool with a command adapter, `skills-invocable` for
  `codex` alone, else `none`. `shouldGenerateSkillsForTool` is
  `delivery !== 'commands' || capability === 'skills-invocable'`;
  `shouldGenerateCommandsForTool` is
  `delivery !== 'skills' && capability === 'adapter-backed'`;
  `shouldRemoveSkillsForTool` is
  `delivery === 'commands' && capability !== 'skills-invocable'`;
  `shouldReconcileCommandFilesForTool` is
  `delivery === 'skills' && capability === 'adapter-backed'`.
- `utils/command-references.js` `getTransformerForTool`: under
  `delivery === 'skills'`, or for any tool that is not adapter-backed, the
  bodies are spelled with skill references, not command references.
- `core/templates/optional-workflow.js`: the conditional grammar (D6).
- `core/init.js`: `--profile` validation, `--language` handling (D8).
- `core/legacy-cleanup.js`: the root-level config-file sweep (D9).
- `core/update.js`: removes deselected workflows. cospec does not (D4).
- `core/migration.js` `migrateIfNeeded`: on `init`/`update` of an existing repo,
  when the global config has no `profile` key and workflows are installed, it
  **writes** `profile: custom` plus the detected workflows into the global
  config (probed: `Migrated: custom profile with 6 workflows`). cospec does not
  port it (D2).

## Goals / Non-Goals

**Goals:**

- A profile and a delivery mode chosen the way the binary chooses them take
  effect in `init` and `update`, and every generated body stays free of dead
  workflow references under any of them.
- With nothing explicitly set, every byte cospec writes today is unchanged.
- One reader of the global config's three keys, one implementation of the
  conditional grammar, one place that decides which surface a workflow lands on.

**Non-Goals:**

- Writing the global config. `cospec config profile|set` stay passthroughs; this
  change only reads.
- An interactive profile picker. cospec's `init` takes everything on the command
  line, as `tool-matrix` already records.
- `getOnboardingCommands` and `formatOptionalWorkflowsNote`: upstream's receipt
  prose that advertises the workflows a profile left out. The receipt gains one
  factual line instead (D8).
- Workflow prose parity (`canon-workflow-parity`, R13). T3 only wraps existing
  references; no sentence is rewritten beyond each reference's fallback.

## Decisions

### D1. Tracks, files, order

Tracks follow the roadmap's table, and each opens with its tests (`test.failing`
rows, flipped by the task that implements them).

| Track | Files                                                                     | New files                                             |
| ----- | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| T1    | `canon/workflows/harness.yaml` (`core: true` on six)                      |                                                       |
| T2    | `harness/render.ts` (`workflows`, `delivery` options, resolution, checks) | `harness/optional-workflow.ts`, `harness/delivery.ts` |
| T3    | `canon/workflows/*.md` (wrap every cross-workflow reference)              |                                                       |
| T4    | `commands/init.ts`, `core/command-table.ts`                               | `core/global-profile.ts`, `harness/workflow-set.ts`   |
| T5    | `commands/update.ts`                                                      |                                                       |
| T6    | `commands/doctor.ts`                                                      |                                                       |
| T7    | `test/contract/profiles.test.ts` and the reachability/command-table edits |                                                       |

The three new `harness/` files keep this change's edits to `adapters.ts` at
zero: `tool-matrix` rewrites that file's rows, and a capability function in a
file of its own cannot conflict with them. `render.ts` and `init.ts`/`update.ts`
do conflict, which D13 names.

### D2. A profile applies only when explicit; one reader reads it

`core/global-profile.ts` exports `readGlobalProfile(cwd)`, returning
`{ profile?, workflows?, delivery? }` with **a key present only when the file
holds it**. It finds the file the way `root.ts` does, by running
`openspec config path` (so XDG, APPDATA and `OPENSPEC_*` discovery stays the
binary's), parses the JSON, and treats a missing file, an unreadable one,
invalid JSON and a non-object root as "nothing set". It never warns about
invalid JSON: `readDefaultStore` already prints the binary's own line once per
path, and a second printer would double it.

- **Explicit means present.** `raw.profile !== undefined`, the binary's own
  test. The roadmap's phrase "a `profile` key actually present in the
  machine-global config file" and `config list`'s `(explicit)` annotation agree.
  A `profile` of any value other than `'custom'` selects core, as
  `getProfileWorkflows` does.
- **`--profile` overrides the key.** A flag value must be `core` or `custom`;
  `workflows` still comes from the file (`init.js:664-668`).
- **`delivery`** is explicit the same way. `'skills'` and `'commands'` select
  those; any other present value acts as `both`, because every predicate above
  is written as `delivery !== 'x'`. Unset is `both`, which is what cospec has
  always written, so no default of the binary's needs to be "not counted" for
  delivery to stay unchanged.
- **`workflows`** is read only when the profile is `custom`. A value that is not
  an array reads as an empty list (the binary would throw on a non-array); ids
  outside the twelve are dropped, as `update.js:87` filters with
  `ALL_WORKFLOWS.includes`.
- **Id spelling.** The file and `getProfileWorkflows` use upstream ids, so
  `sync` means cospec's `sync-specs`. The translation is the workflow alias
  `canon/parity/aliases.yaml` already declares; both spellings are accepted in
  `workflows`.
- **`migrateIfNeeded` is not ported.** Porting it would write `profile: custom`
  into the global file as a side effect of running cospec, which would make
  "explicit" true on exactly the machines this design exists to leave alone.
  Rejected alternative: port it so `cospec init` and `openspec init` leave the
  same global state. It stays out because cospec never writes that file.

`doctor.ts` stops computing its own path (`$XDG_CONFIG_HOME` or `~/.config`
only, no APPDATA, no `config path`) and calls the shared reader. `init.run` and
`update.run` become `async`, as `doctor.run` already is, because the path comes
from a spawn.

### D3. The workflow set

`harness/workflow-set.ts` exports
`profileWorkflows(profile, workflows, manifest)`: `core` returns the manifest
entries marked `core: true` (T1; the six named in the proposal), `custom`
returns the translated, filtered list with `sync-specs` spliced before the first
`archive`/`bulk-archive`, in `getProfileWorkflows`'s position. An explicit
`custom` with no `workflows` key is the empty set, as the binary's is (`custom`
with nothing selected installs nothing); the receipt says so (D8). Marking
`core` in `harness.yaml` rather than listing ids in code keeps one declaration
of the set, readable by doctor and the docs.

Rejected alternative: treat an explicit `custom` with no list as "all twelve".
The binary installs nothing, and a user who wrote `profile: custom` chose a
list.

### D4. `update` never removes an installed workflow

The roadmap's policy is a cospec choice, not a fact about the binary: the binary
removes deselected workflows (`core/update.js:203,230`, the
`(deselected workflows)` lines). The roadmap wins, and the docs say cospec
differs.

`generate()` computes, for each selected row, the effective set: the profile's
workflows plus every workflow whose skill or command file for that row is
already on disk and cospec-managed (a markdown file with `author: cospec` and a
`contentHash`, the same test `removeMarkdown` uses; a frontmatter-less command
is installed when the previous manifest tracks its path). It renders that set. A
repo with twelve installed and `profile: core` therefore re-renders twelve, and
removes nothing. The union is per row, so a harness added later gets the
profile's set while an older one keeps its own. `codex` and `agents` share
`.agents/skills`, read the same paths and compute the same set.

`init` runs the same engine, so `cospec init --profile core` in a fresh repo
installs exactly six (nothing installed), and in a twelve-workflow repo
re-renders twelve. Rejected alternative: make `init` authoritative so
`--profile core` trims an existing repo. `init` is documented as idempotent and
additive, and nothing in the roadmap asks it to delete.

A workflow added to the profile later is written by the next `update`. Nothing
removes one except a delivery switch (D5) or the user.

**Harness detection must stop relying on one skill.** `detectHarnesses` today
needs the `cospec-propose` skill. A `custom` profile without `propose`, or
`delivery: commands`, leaves none, and `update` would report no harness and
never regenerate. Evidence becomes: any cospec-managed workflow skill under the
row's skills root (any `skill:` in the manifest), or any cospec-managed command
file at one of the row's command paths. The legacy-root and `rulesPath` rules
that disambiguate `codex` from `agents` are unchanged.

### D5. Delivery

`harness/delivery.ts` exports the four predicates above as functions of a
`HarnessAdapter` and a delivery value, with the capability derived from the row:
a row with a `commands` surface is `adapter-backed`; `codex` is
`skills-invocable`; any other row is `none`. This restates `command-surface.js`
over cospec's rows, and the equivalent is a table-invariant test, so a row that
`tool-matrix` adds is classified without editing this file.

- **Render.** `renderHarnessFiles` takes `delivery`. It skips skill files where
  `shouldGenerateSkills` is false and command files where
  `shouldGenerateCommands` is false.
- **Skill spelling.** Under `delivery: skills`, an `adapter-backed` row's skill
  bodies are spelled with skill references, the port of
  `getTransformerForTool`'s first branch
  (`delivery === 'skills' || capability !== 'adapter-backed'` →
  `getSkillReferenceTransformer(toolId)`). That transformer is per tool, not the
  Codex one: the default is `/<skill>` (`/cospec-apply-change` here), `codex`
  alone is `$<skill> (Codex) or /<skill> (other agents)`
  (`transformToCodexCompatibleSkillReferences`, which is cospec's `shared`
  dialect), `kimi` is `/skill:<skill>`, and the natural-language tools
  (`rovodev`, `codeassistant`) get `the <skill> skill`. cospec's three dialects
  have no plain `/<skill>` spelling, and applying `shared` to a Claude
  skills-only install would tell a Claude user about Codex. So
  `harness/delivery.ts` also exports `skillReferenceSpelling(row)`: the row's
  own dialect when it is already `shared` (the `.agents` root, which stays
  dual-spelled), the natural-language or `/skill:` spelling when `tool-matrix`
  gives a row one (D13), and otherwise the default `<invocationPrefix><skill>`.
  `transformBody` takes it as one more case rather than a fourth dialect name,
  so a row adds no `render.ts` edit. With `both` or `commands` a body keeps the
  row's dialect. Without this, a Claude skill under `skills` delivery would say
  `/cospec:apply` and name a command file that no longer exists, which doctor
  would flag.
- **The other surface is removed.** A delivery switch removes the cospec-managed
  files of the surface no longer generated: skills under `commands`, commands
  under `skills`. `removeOrphanMarkdown` derives its sweep directories from the
  _rows_ (skills roots, command dirs and extensions) rather than from the
  rendered files, which today is why a surface that renders nothing is never
  swept. The workflow stays installed (D4's scan reads both surfaces), so
  switching back restores it.
- **Shared roots.** Skills at a root are generated when any selected row sharing
  it generates them, and removed only when none does. `codex`
  (`skills-invocable`) and `agents` (`none`) share `.agents/skills`; with both
  selected under `commands`, the files stay. `tool-matrix`'s shared-root arbiter
  decides ownership of a root across rows (D13); this rule sits on top of it.
- **A row that gets nothing.** Under `commands`, a `none` row writes and keeps
  nothing. The receipt prints the binary's line (`init.js:1027-1030`), spelled
  `cospec`:
  `No skills or commands were generated for <names>: delivery is set to 'commands' but it supports only skills. Run 'cospec config set delivery both' to generate skills.`
  (`they support` for several).

### D6. The conditional grammar, ported verbatim

`harness/optional-workflow.ts` is a line-for-line port of
`core/templates/optional-workflow.js` and is checked against it by a
differential test that imports the pinned module in tests only. The patterns:

```
OPEN              [[opsx:if-workflow            (then an id, then ]])
ELSE              [[opsx:else]]
END               [[opsx:end]]
WHOLE_LINE        /^([ \t]*)\[\[opsx:if-workflow ([a-z-]+)\]\]([^\n]*?)\[\[opsx:else\]\]([^\n]*?)\[\[opsx:end\]\][ \t]*\r?\n/gm
CONDITIONAL       /\[\[opsx:if-workflow ([a-z-]+)\]\]([\s\S]*?)\[\[opsx:else\]\]([\s\S]*?)\[\[opsx:end\]\]/g
RESIDUAL          /\[\[opsx:(if-workflow|else|end)/
MARKER            /\[\[opsx:(?:if-workflow [a-z-]+|else|end)\]\]/g
MARKER_LIKE       /\[\[opsx:/
```

`resolveOptionalWorkflows(text, installed)` runs `assertConditionalsWellFormed`
before any branch is chosen (so a truncated block in the unselected branch fails
for every profile), resolves whole-line conditionals first (an empty branch
takes its line with it, so a dropped table row or bullet leaves no blank line),
then inline ones, then asserts nothing is left. The failures, quoted from the
dist and ported byte for byte (`<…>` marks the interpolated part):

- An unrecognised marker:
  `Malformed optional-workflow conditional: unrecognized marker at '<first 40 characters of the remaining line>'. Markers are [[opsx:if-workflow <id>]], [[opsx:else]] and [[opsx:end]].`
- Markers out of order, an incomplete block or a nested one:
  `Malformed optional-workflow conditional: markers are out of order or a block is incomplete. Each block needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form, and blocks cannot nest.`
- A marker left after resolution:
  `<reason>: '<marker>' is unresolved. Optional-workflow blocks are resolved by getSkillTemplates()/ getCommandTemplates() against the installed workflow set, and each needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form.`
  with `<reason>` `Malformed optional-workflow conditional` from the resolver,
  and at each write point
  `Skill '<name>' was generated without resolving its optional-workflow blocks`
  /
  `Command '<id>' was generated without resolving its optional-workflow blocks`
  (`skill-generation.js:112`, `generator.js:24`). The two functions the message
  names have no cospec counterpart; the text is kept verbatim because the
  roadmap and the binary's own contract say verbatim, and the differential test
  compares against it.

**Where it runs.** In `renderHarnessFiles`, on the raw canon body, before
`{{TYPE_TABLE}}` injection and before `transformBody`, which is upstream's order
("runs before the command-reference transformers") and keeps the `shared`
dialect from ever seeing a dropped branch. The write-point assertion runs in
`renderHarnessFiles` on every emitted body (skill and command) and again in
`generate()` over the rendered set, so a body that skipped resolution throws
before anything is written.

**Ids.** A marker names a cospec workflow id (`sync-specs` fits `[a-z-]+`). An
id outside the manifest resolves to the else branch, as the binary's
`installedWorkflows.has` does for an unknown id; a canon unit test (D7) keeps
that from ever being authored.

### D7. Canon wrapping

Every `/cospec:<id>` in a workflow body, not only an obvious handoff, becomes a
conditional: `archive.md` says "`/cospec:apply` it next", and under
`custom: [archive]` that is as dead as a handoff. Each is written as
`[[opsx:if-workflow <id>]]`/cospec:<id>`[[opsx:else]]<fallback>[[opsx:end]]`, on
one line wherever the reference sits in a table row or bullet, so an empty
fallback removes the line. The fallback is the raw gated command:

| Workflow                  | Fallback when not installed                                         |
| ------------------------- | ------------------------------------------------------------------- |
| `propose`, `new`          | `cospec new <type> <slug>`                                          |
| `continue`, `ff`          | `cospec instructions <artifact> --change <slug>` per ready artifact |
| `update`                  | edit the artifact, then `cospec validate <slug> --strict`           |
| `apply`                   | `cospec apply <slug>`                                               |
| `verify`                  | `cospec validate <slug> --strict`                                   |
| `archive`, `bulk-archive` | `cospec archive <slug>`                                             |
| `sync-specs`              | `cospec sync-specs <slug>`                                          |
| `explore`, `onboard`      | the line is dropped (no CLI counterpart)                            |

Both branches read correctly alone: the generated file holds one and no trace of
the other. The init receipt's two hint lines (`Try: /cospec:propose …`) resolve
the same way against the row's set, falling back to
`Try: cospec new feat <slug>`.

**The default render does not move.** With all twelve installed, every
conditional resolves to its first branch, which is today's text, so the rendered
bytes (and every `contentHash`) are identical and `mise run generate:check`
shows no drift in this repo's own managed files. A golden test renders the
twelve bodies for each shipped row with the full set and compares them with the
committed output. That is also why `agent-behavior` is left unchecked: no prompt
changes for any user who sets nothing, and a narrowed install's text is
deterministic template output that an exact-render assertion covers; an eval
would score nothing the assertion does not.

A canon unit test fails on any `/cospec:<id>` outside a conditional branch, any
marker id outside the manifest, and any fallback naming `/cospec:`.

### D8. `init`

Order, with the first failure stopping before any write (the binary resolves
`--profile` ahead of tool setup and `--language` ahead of the scaffold):

1. `--profile <v>`: not `core` or `custom` →
   `cospec: Invalid profile "<v>". Available profiles: core, custom`, exit 1.
2. `--language <v>` normalisation, in the binary's order, each
   `cospec: <message>` and exit 1: empty after trim →
   `The --language option requires a non-empty value.`; a control, bidi-control
   or `U+200B/2028/2029/FEFF` character (`/\p{Cc}|\p{Bidi_Control}|[​  ﻿]/u`) →
   `The --language option must be a single line without control or invisible formatting characters.`;
   the directive over 50 KB (`MAX_CONTEXT_SIZE`) →
   `The --language option is too long for OpenSpec's 50KB project context limit.`
3. `--language` against the target: when neither `openspec/config.yaml` nor
   `config.yml` exists, the destination must be a writable project path, else
   `Cannot create openspec/config.yaml for --language: the destination is not writable.`
   (or `…: <reason>` for an escaping path). When one exists, its `context` must
   contain the directive: `existingContext?.includes(directive)`, so a config
   with no `context` at all also refuses, with
   `--language does not overwrite an existing OpenSpec config. Add the language instruction to its context field instead.`
   Probed: `init --language English` over a config that holds Portuguese exits 1
   with that line; the same value that is already present exits 0.

The directive is **three** lines, not the roadmap's two (probed, and
`formatLanguageContext`): `Language: <lang>`,
`All artifacts must be written in <lang>.`,
`Keep OpenSpec structural headings and SHALL/MUST keywords in English.` It
becomes `context: |` in the new `config.yaml`, which cospec writes only when
absent. cospec adds the `context:` block to its own template in place of the
commented `# context:` example.

**`config.yaml` examples.** `CONFIG_YAML` gains commented `operations:`,
`store:` and `references:` blocks. `operations:` is the binary's own example
(`config-prompts.js serializeConfig`): `apply` and `archive` each with a
`guidance` list. The binary ships no `store:` or `references:` example, so those
two are cospec-authored from `project-config.js`: `store:` a single store id
string; `references:` a list of ids or `{id, remote}` maps. They stay commented;
a test parses the template with the binary's reader and asserts no warning.

**Receipt and JSON.** When a profile or delivery is explicit, the receipt gains
one line, `Workflows: 6 of 12 (profile core, set by --profile)` or
`…by the global config`, and `init --json`/`update --json` gain `profile`
(`null`, or `{name, source: 'flag'|'config', workflows}`) and `delivery`
(`both|skills|commands`). Both are additive; no existing key changes and nothing
prints when nothing is set. An explicit `custom` that selects no workflow says
so on the line.

### D9. Root-level legacy blocks (row 61)

`LEGACY_CONFIG_FILES` is `CLAUDE.md`, `CLINE.md`, `CODEBUDDY.md`, `COSTRICT.md`,
`QODER.md`, `IFLOW.md`, `AGENTS.md`, `QWEN.md`, copied from
`core/legacy-cleanup.js` and checked against the pinned export by a test. The
pass reuses the opsx leftover scan's report and consent: `init --remove-opsx` or
`--yes` removes, otherwise the files are listed (`opsx.found`, doctor's
`opsx-leftover`).

- **Detection** is the binary's `hasOpenSpecMarkers`: the file contains both
  `<!-- OPENSPEC:START -->` and `<!-- OPENSPEC:END -->`, anywhere.
- **Removal** is the binary's `removeMarkerBlock`, ported with
  `isMarkerOnOwnLine`/`findMarkerIndex`: only a marker alone on its line counts,
  an inline mention is ignored, the whole start-to-end line range goes, runs of
  three or more newlines collapse to two, trailing whitespace is trimmed and the
  file's `\r\n` or `\n` style is kept.
- **The file is never deleted.** The roadmap says a file is deleted "only when
  nothing but the markers remains". The binary does not:
  `cleanupLegacyArtifacts` comments
  `Remove marker blocks from config files (NEVER delete config files)` and
  `Always write the file, even if empty`, and the probe left `CLAUDE.md` at 0
  bytes and `AGENTS.md` as `keep me\n`. The binary wins: a file with nothing
  else is written empty. A detected file whose markers are only inline is
  reported and left byte-identical, a mismatch the binary shares (it counts it
  modified).
- The line the binary prints, `Removed OpenSpec markers from <file>`, is the
  receipt's wording for each.

### D10. `doctor`

`checkGlobalProfile` is replaced, under the same check id
`openspec-global-profile` (a public JSON id; renaming it would break scripts),
by a check that reads D2's reader and reports at INFO: the explicit profile and
its workflows (or `custom` with its list), the explicit delivery, and for each
selected row any installed cospec workflow outside the profile (naming them;
INFO, because `update` never removes them and a WARNING with no way to clear it
would be noise). With nothing explicit it reports nothing. The remedy points to
`cospec config profile` and to deleting the named files by hand.

The dangling-reference check keeps its skill-or-command-exists logic, which is
what proves a resolved handoff: a narrowed install's bodies name only installed
workflows, so it passes, and a body naming an absent one still fails. It also
fails, as an ERROR, on a residual `[[opsx:` marker in any cospec-written file.

### D11. Reachability and the command table

The table rows for `init --profile` and `init --language` change from
`pending('workflow-profiles')` to handled, and their two entries leave
`parity-pending.yaml`. The tests that use those two as fixtures
(`reachability.test.ts` negative cases, `command-table.test.ts` rows at 77, 328,
329, 370, 371) are retargeted to a synthetic row, since after this change the
real list is empty. The reachability test gains the assertion that the list is
empty; `KNOWN_OWNERS` drops `workflow-profiles` only if nothing names it.

### D12. Docs

Each fact is updated on the page that owns it, in this change:
`harness-setup.md` (the "no core/custom profile split" sentence and the "no
global state" sentence's neighbours), `configuration.md` (`profile`,
`workflows`, `delivery`, `context`, and the note at `:296` that these keys are
inert), `commands.md` (the `init` row's flags, the `doctor` row, the
explicit-only rule), `how-it-relates-to-openspec.md` (the loader now renders an
empty pending list), `docs/harness-integration.md:17` and
`docs/architecture.md`. `shared.md` states the explicit-only rule, the
never-removes policy and where the one reader lives.

### D13. Dependencies this change is built on

`tool-matrix` (R9), `github-copilot` (R10) and `completion-install` (R11) have
merged and are archived. This change was authored against `main` at v0.9.0 and
the implement stage rebased onto them.

- **From `tool-matrix`:** every `AI_TOOLS` id as a `HARNESS_TABLE` row (more
  rows with and without `commands`, flat and TOML commands, `needsConsent`
  legacy roots), the shared-skills-root arbiter (`isSharedSkillTargetActive`),
  and the T9 dialects in `render.ts` (Cline-style headers, non-`.agents` skill
  roots). Its contract captures run the binary with a global config of
  `profile: custom` listing all twelve and `delivery: both`; those render all
  twelve here too, which is how the two changes agree. **Touch points:**
  `render.ts` (the new options sit beside its dialect hooks), `delivery.ts`'s
  capability derivation (re-run over the full row set, with the invariant test),
  D4's installed detection over the new roots, and D5's shared-root rule over
  the arbiter.
- **From `github-copilot`:** the `github-copilot` row (prompt commands at
  `.github/prompts/*.prompt.md`, skills at `.github/skills`), `init`'s
  `--copilot-cloud`/`--no-copilot-cloud` flags and the
  `githubCopilot.cloudAgent` preference, and the cloud-agent files. **Touch
  points:** `init.ts` `run` (flags, receipt lines, JSON keys) and `update.ts`
  `run`/`generate()`. The cloud-agent files are not workflows, so no profile or
  delivery rule applies to them and they are never removed here.

At rebase time the implementer re-reads both changes' `design.md` and the merged
code, re-runs the T7 matrix over the full rows, and records in `tasks.md` what
moved.

## Operational surface

The interactive surface is `cospec init`'s flags, receipt and `--json`,
`cospec update`'s receipt and `--json`, `cospec doctor`'s findings, and the
generated workflow bodies.

- Two flags become accepted (`--profile`, `--language`). Two commands gain one
  async spawn each (`openspec config path`), already made by `root.ts` on the
  same calls.
- `init`/`update` read the global config file once per run; nothing is written
  to it.
- No bind address, container, secret or connection limit. The wrapped binary is
  still resolved by path inside the accepted range. Contract rows spawn it as
  the suite does, under Bun with the product env and a sandboxed
  `HOME`/`XDG_CONFIG_HOME` holding the `config.json` under test.

## Integration contract

The external contract is OpenSpec's machine-global `config.json` and the pinned
dist's exports, read and never written.

- **Keys:** `profile` (`core`/`custom`), `workflows` (upstream ids), `delivery`
  (`both`/`skills`/`commands`). Anything else in the file is ignored.
- **Path:** whatever `openspec config path` prints; no `XDG_CONFIG_HOME`
  arithmetic in cospec.
- **Oracle:** `core/profiles.js`, `core/templates/optional-workflow.js` and
  `core/legacy-cleanup.js` are imported in tests only, never at runtime, as the
  reachability test imports `AI_TOOLS`. A pin bump that changes the grammar, the
  eight legacy files or the core set fails the differential rows.
- **Id reconciliation:** upstream `sync` is cospec `sync-specs`; the mapping is
  the workflow alias already in `aliases.yaml`.

## Risks / Trade-offs

- [A canon reference left unwrapped dangles under a narrowed profile] → the D7
  unit test fails on any bare `/cospec:<id>`; the T7 matrix runs doctor over
  `core`, `custom: [archive]` and delivery `skills`/`commands` installs.
- [Per-row unions make bodies differ between harnesses in one repo] → each body
  is correct for its own row's files, and doctor's check is per row; the
  alternative, one repo-wide set, would install workflows the profile excludes
  on a harness added later.
- [Widening harness detection changes which repos `update` regenerates] → it
  only adds evidence (any cospec-managed skill or command file) to a rule that
  required one specific skill; a test covers `custom` without `propose` and
  `commands`-only delivery, and the existing `codex`/`agents` disambiguation
  cases still pass.
- [The roadmap says "delete", the binary writes empty] → the binary wins and is
  recorded in D9, the proposal and the spec; a contract row compares the two
  results byte for byte.
- [`init`/`update` becoming async] → both already run behind an async dispatch
  (`doctor` does); unit callers of `run` in tests are updated in T4/T5.
- [R9/R10 land first and move `render.ts`, `init.ts`, `update.ts`] → D13 names
  the touch points and the rebase re-runs the matrix; no decision above depends
  on a row either change adds.
