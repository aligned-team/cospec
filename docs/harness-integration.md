# Harness integration

cospec generates agent files by **direct project-file injection** — the same
model OpenSpec uses. No marketplaces, no plugin packages. Files land in the
repo, with one deliberate home-directory root: `minimax-code` reads its skills
only from `~/.minimax/skills`, so cospec writes them there. Global prompts
(`~/.codex/prompts`), `CODEX_HOME` and `~/.claude` stay out of scope. Shell
completion is not a harness file: `cospec completion install` writes one
outside the repo only when asked (see `apps/docs/guide/installation.md`). A
Claude marketplace plugin could be layered later without changing this contract.

## What gets written

Twelve workflows — `propose`, `new`, `continue`, `ff`, `apply`, `verify`,
`archive`, `bulk-archive`, `sync-specs`, `explore`, `onboard`, `update` —
single-sourced in `canon/workflows/*.md` and rendered per harness. This is
cospec's full opsx 1.13.1 parity set: every live opsx workflow (`propose`,
`new`, `explore`, `continue`, `apply`, `ff`, `sync`, `archive`, `bulk-archive`,
`verify`, `onboard`, `update`) has a cospec-adapted counterpart — `sync` maps to
`sync-specs` (see below). cospec has no core/custom profile split: it always
emits the full twelve to every configured harness.

The exact per-harness file tree each `cospec init` writes, the slash-syntax
substitution, the restart/reload notes, and the smoke-test checklist are owned
by the site: [Harness setup](https://cospec.aligned.team/guide/harness-setup).
This page covers what each generated workflow body actually does and the canon
internals behind it — content the site intentionally keeps at a higher level.

Workflow bodies are single-sourced from `canon/workflows/*.md`; the manifest
`canon/workflows/harness.yaml` carries only their identity (`id`, `command`,
`skill`, `title`, `takesArguments`). _Where_ a body lands is declared once, per
tool, as a row of `HARNESS_TABLE` in `apps/cli/src/harness/adapters.ts`, and
nothing else keeps a copy of a layout fact. A row declares:

- **Skills.** `skillsDir` (project) or `globalSkillsDir` (home-relative, used
  only when there is no `skillsDir`), the skills root; `legacySkillsDirs`, the
  older skills roots that detection and the leftover scan read.
- **Commands.** `commands` (`dir`, `namespacing`, `file` template with
  `{command}`, `extension`, `serializer`, an optional `frontmatter` builder and
  `injectArguments`, the placeholder `$ARGUMENTS` or `$@`).
- **Spelling.** `invocationPrefix` (`/` or `@`), `bodyDialect` (what its command
  bodies say), `skillDialect` (what its skill bodies say, when different), and
  `skillInvocationPrefix` (`/skill:` for Kimi).
- **Install state.** `rulesPath` (Codex's prefix-rule allowlist),
  `requiresIdeRestart`, `detectionPaths`, `setupNote`, `searchAliases`.
- **Migration.** `legacyToolRoots` (`root`, `needsConsent`, `timing`,
  `consentNotice`), `legacyCommandPaths` and `legacyGlobalPrompts`, which the
  leftover scan reads.

Dialects (`BodyDialect`): `canonical` writes `/cospec:<id>`, `flat` writes
`/cospec-<id>`, `shared` writes `$cospec-<id>` in Codex and `/cospec-<id>`
elsewhere, `skill` names the skill with `skillInvocationPrefix`, and `prose`
asks the tool by skill name. Serializers (`CommandSerializer`): `markdown`
carries YAML provenance frontmatter; `toml` (Gemini), `markdown-header` (Cline,
Zoo Code) and `plain` (Command Code, Kilo Code) carry none, so they are tracked
in `openspec/.cospec-manifest.json` like `.cospec-target` and the Codex rules
file.

`init` (the `--harness` value list and its aliases, detection paths, leftover
scan roots, setup notes, the receipt line naming the rows that share one skills
root), `update` (skills, legacy and rules roots for detection, the removal roots
manifest keys are contained to, and the command extensions its orphan sweep
matches), and `doctor` (scan roots, the files its frontmatter and reference
checks read, the row a file belongs to, and the invocation prefix its references
are spelled with) all read the table. A new tool is a new row. Anything a row
cannot express is a `harness/` dialect, serializer or helper, never a branch in
`commands/`; `harness-matrix.test.ts` compares each production row's render with
the pinned oracle. A shape no production row uses yet is exercised by a unit
test through a fixture row passed via `RenderOptions.adapters`.

The opsx leftover scan (`isLeftoverCandidate` and `leftoverScanFiles` in
`commands/init.ts`, which doctor's `opsx-leftover` check reads too) is wider
than doctor's harness-file read, because upstream's own command paths
(`.claude/commands/opsx/<id>.md`, `.opencode/commands/opsx-<id>.md`) are not
cospec's and provenance, never the path, decides what is a leftover. It reads
every `.md` file under each top-level dir that holds a row's skills or legacy
skills root, each row's files with its command extension under its commands dir
(the `.toml`, `.prompt` and `.prompt.md` ones included), every path a row's
`legacyCommandPaths` names (so each tool's legacy slash-command locations,
directory-scoped names such as `.claude/commands/openspec/` among them), and the
shared `.agents/skills` root. Every project scan descends with one bounded
walker, `walkProjectFiles` in `harness/scan-walk.ts`, which doctor's
harness-file read and its `stale-sidecar` check use too, so none can drift from
its two boundaries. First, a directory holding its own `.git` entry (a
`git worktree add` checkout, where `.git` is a file, or an embedded clone, where
it is a directory) is never descended into; the same holds for a scan root that
holds its own `.git`, sits inside a directory that does, or is a symlink
resolving into one, and `--remove-opsx` re-checks that test on the path and its
resolved target immediately before every delete. Second, a scan root is never
read if it resolves (symlinks followed) outside the project, checked by realpath
containment so a multi-segment root (`.agents/skills`) is caught whichever
segment is the link, while a symlink resolving back inside the project is
harmless; removal re-checks the containment too. A directory the walk cannot
list for a permission or path-type errno is handed to the walker's
`onUnreadable` callback: `init` reports it under `Failed:` (and exits 1) rather
than hiding it, and without a callback the error propagates. After the files go,
a `legacyCommandPaths` directory entry's folder is removed once nothing is left
in it, never recursively, and never when it is a link or leaves the project.

Two behaviours sit outside the table on purpose. Init merges cospec's permission
into `.claude/settings.json` only when `claude` is selected, and selects
`claude` on a fresh repo where nothing is detected. The receipt's closing hint
is not Claude-only: `receiptHintLines` passes its lines through the first
selected row's body dialect and invocation prefix with `transformBody`, so it
reads `/cospec:propose` for Claude, `/cospec-propose` for OpenCode, and
`$cospec-propose (Codex) or /cospec-propose (other agents)` for the shared
roots. A `prose` row gets the ask-by-name form.

Shared skills roots are arbitrated in `harness/shared-root.ts`: a group of
selected rows that resolve to one root gets exactly one writer, chosen by
upstream's precedence, and `generate()` writes a marker,
`<root>/.cospec-target`, naming it. Detection on `update` and `doctor` reads the
same arbiter. The home skills root (`globalSkillsDir`) is a managed root:
`generate()` writes it under `USERPROFILE`, `HOME` or the OS home directory,
prunes only cospec-authored orphans there, and never records a home path as a
manifest key. A `generate()` dry run (`--check`, doctor) reads the home root and
never writes it.

Legacy roots move by row data plus one mover in `harness/legacy-skills.ts`,
ported from upstream's `migrateLegacyToolDirs`: OpenSpec-managed files move from
each `legacyToolRoots` entry to the row's current root, `before-generation`
entries first and `after-generation` ones after cospec's replacement exists.
Consent comes from `needsConsent`, not from the row's name. `init` moves a
selected tool's root without asking, because selecting it is the consent;
`update` asks only on an interactive terminal without `--json` or `--force`, and
a "no" leaves the root and reports it. A cospec-authored skill in a legacy root
follows the managed-file rule: it is removed only while its body still matches
its stamped `contentHash`.

Failures are isolated per file. `generate()` catches only the errno codes
`EACCES`, `EPERM`, `EROFS`, `ENOTDIR` and `EISDIR` on a write, sidecar or
removal, records `{ path, error }` (`error` is `<code>: <syscall> <path>`),
skips that file's manifest entry so the next run retries it, and continues; init
and update print a `Failed:` block and exit 1. Any other error propagates. Tool
ids may be retired: `HARNESS_ID_ALIASES` in `adapters.ts` maps `windsurf` to
`devin` before the `--harness` list is checked.

The oracle the rows are checked against is the pinned binary's own output, not
cospec's. `apps/cli/test/fixtures/upstream-init/<id>.json` records each
`init --tools <id>` run (the argv, global config, exit code, stdout, stderr and
every file's path, length, sha256 and wrapper head, with sandbox paths respelled
`<HOME>` or `<PROJECT>`). `test/contract/support/upstream-init-capture.ts` takes
those captures in a private sandbox, and `upstream-init-fixtures.test.ts`
re-takes every capture to prove the committed files match the pin. After a pin
bump, re-take them with
`COSPEC_FIXTURE_WRITE=1 bun test test/contract/upstream-init-fixtures.test.ts`
and run `mise run format:fix`.

## What each workflow does

- **propose** — parse `<type>: <desc>` or ask via the eleven-type table; run
  `cospec new`; loop `cospec status --json` → `cospec instructions <artifact>` →
  write the artifact, until every `apply.requires` artifact is done. Each
  artifact in the status JSON carries `ready` (its `requires` are all done, so
  it can be authored next) alongside `done` and `required`, so the loop can pick
  what to write without re-deriving the dependency graph. A change with no
  artifacts yet carries `artifacts: []`, and its `next` names the first one to
  write.
- **new** — scaffold-only entry point: pick the type, run
  `cospec new <type> <slug>`, print the typed artifact plan and the first
  artifact's instructions, then **stop** without authoring anything. Hands off
  to `ff` (author everything in one pass) or `continue` (author one artifact at
  a time).
- **continue** — resume the propose loop for a partially-built change.
- **ff** — fast-forward: run the propose author-cycle on an already-scaffolded
  change until every `apply.requires` artifact is done, then
  `cospec validate <c> --strict` and hand off to `apply`. Never re-scaffolds and
  never adds an artifact the type's plan forbids.
- **apply** — run `cospec apply <c> --json` and obey the exit code (0 work the
  tasks, 2 stop and relay blockers, 3 confirm then `--allow-soft`). Never
  re-derive the gate from files.
- **verify** — the archive dress rehearsal: `cospec validate <c> --strict`, then
  walk `verification.md` recording an observed result after `->` for every row
  (`[x]` done, or `[~] defer: <reason>` — no bare `[ ]` may remain), confirm
  every `tasks.md` box is checked, and name the two hard archive gates
  (`archive/verification-incomplete`, `archive/scenario-preservation` — no
  `--force`) before handing off to `archive`.
- **archive** — run `cospec archive <c>`, relay the summary; on exit 1 relay the
  error verbatim and **never** hand-`mv` the directory.
- **bulk-archive** — archive a batch: `cospec list --json`, order
  providers-before-consumers (read each change's `blocking-changes.md`, else
  creation order), then loop `cospec archive <c>` — each call runs its own
  per-change validation, hard gates, filesystem-verified move, and blocker
  fan-out. A failure is reported and the loop continues; it is never fatal to
  the batch. Never hand-`mkdir`/`mv`, and never `--force` a spec collision —
  edit the later delta instead.
- **sync-specs** — merges a change's delta specs into the main specs without
  archiving it: preview with `cospec validate <c>` and the delta files, then run
  `cospec sync-specs <c>`, which runs the binary's own archive merge on a
  scratch copy, so a later `cospec archive` is a no-op merge with both hard
  gates still run. Maps to opsx's `sync` workflow — see the name-mapping note
  below.
- **explore** — thinking-mode exploration; may create artifacts, never
  implementation code.
- **onboard** — guided first real change, EXPLAIN→DO→SHOW→PAUSE: steers to a
  light type (`chore`/`docs`) on a small task, then walks `new` → author →
  `apply` → implement → `cospec archive` — the real CLI archive path, never a
  divergent manual move. Exits gracefully if the user stops.
- **update** — revise an already-scaffolded change's **existing** artifacts and
  keep them coherent with one another; never creates an artifact that doesn't
  exist yet (hands off to `continue` for that) and never edits code (hands off
  to `apply` for that). Built entirely from `cospec status`,
  `cospec instructions`, and `cospec validate` — there is no
  `cospec update <slug>` CLI command backing it (the unrelated `cospec update`
  subcommand regenerates this repo's own managed harness/schema files and has
  nothing to do with a change's artifacts).

### Name mapping

- `/opsx:sync` maps to `/cospec:sync-specs` — same job (merge the delta specs
  into the main specs without archiving), kept under its existing cospec name
  rather than renamed to avoid churning tests, docs, and muscle memory for zero
  gain.
- `/opsx:update` maps to `/cospec:update` — see **update** above.
- opsx's `feedback` workflow has no cospec workflow counterpart; not part of
  parity. (Wrapping `openspec feedback` itself as a disciplined passthrough CLI
  surface, alongside `config` and `completion`, is a follow-up — see
  `proposal.md`'s non-goals.)

## Provenance & the managed-file protocol

Every generated file carries provenance frontmatter:

```yaml
---
name: cospec-apply-change
description: …
metadata:
  author: cospec
  generatedBy: 'cospec@<version>'
  contentHash: 'sha256:<hash of the body below the frontmatter>'
---
```

`contentHash` covers only the body, so a version bump alone changes one
frontmatter line. `cospec update` re-composes every managed file and reports a
per-file outcome:

```
writeManaged(path, newBody):
  not exists                          → CREATED (write frontmatter + body)
  author ≠ cospec or no contentHash   → PRESERVED_FOREIGN (write path.cospec-new)
  sha256(body) == contentHash:        # unmodified managed file
    body == newBody and version match → UNCHANGED (byte no-op)
    else                              → UPDATED (rewrite)
  else:                               # user modified a managed file
    --force                           → FORCED (rewrite)
    else                              → PRESERVED_MODIFIED (write path.cospec-new)
```

Schema files (YAML, no frontmatter) use hashes in
`openspec/.cospec-manifest.json` with the same outcomes. All writes are atomic
(tmp + rename). Files the current version no longer emits are deleted only when
unmodified, else preserved and reported. **Idempotence is a tested property**: a
second consecutive `init`/`update` returns UNCHANGED for every file and leaves
`git status` clean.

### Reconciling `.cospec-new`

When you have hand-edited a managed file and `update` wants to change it, cospec
writes its version to `<file>.cospec-new` rather than clobbering yours. Diff the
two, fold in what you want, delete the `.cospec-new`. `cospec doctor` nags about
stale `.cospec-new` files. If you meant to discard your edits,
`cospec update --force` overwrites (it prints a diff summary first).

## Claude settings merge

If `claude` is in the harness set, init reads `.claude/settings.json` (creating
`{}` if absent). If it parses, cospec additively merges `Bash(cospec *)` into
`permissions.allow` — no other keys touched, nothing removed — and reports the
merged entry. If it does not parse, cospec prints the snippet and skips.

## Coexistence with OpenSpec's own files

- **opsx files** — OpenSpec's own generated files (frontmatter
  `generatedBy: "1.3.x"` + `author: openspec` for a skill; `name: "OPSX: …"` for
  most tools' command files) are never generated and never required.
  Pre-existing ones are listed with a warning at init and removed with
  `--remove-opsx` (or interactive confirm; `--yes` = yes). User-authored files
  (no `generatedBy`, no `name: "OPSX: …"`) are never touched. `doctor` warns
  while both command sets coexist, because two propose commands confuse agents.
  OpenCode's command adapter writes frontmatter with only `description` — no
  `name`, no `metadata` — so neither marker above ever matches its own
  `.opencode/commands/opsx-<id>.md` leftovers. Those are detected instead by the
  combination of the adapter's exact path restricted to one of the 12 workflow
  ids the pinned dist ever generates (`propose`, `explore`, `new`, `continue`,
  `apply`, `update`, `ff`, `sync`, `archive`, `bulk-archive`, `verify`,
  `onboard`), a frontmatter with no key but `description`, and the pinned dist's
  `PROJECT_ROOT_GUARD` template's literal lead sentence
  (`**Project check:** These steps expect a project that already uses OpenSpec.`)
  plus its backtick-quoted `` `openspec list --json` `` command reference —
  never on path shape, frontmatter shape, or the bare command reference alone,
  so a hand-written file at the same path with its own prose body, an id the
  pinned dist never generates, or a body that merely quotes the same command for
  its own reasons, is left untouched. Under `.opencode/commands/` that shape is
  the only test; elsewhere a command's root guard (`openspec list --json`) or,
  at a path a row's `legacyCommandPaths` names, the pre-opsx
  `<!-- OPENSPEC:START -->` / `<!-- OPENSPEC:END -->` pair is the proof. The
  leftover scan also walks `.agents/skills/` (`OPSX_SHARED_SKILL_ROOT`)
  whichever rows the table carries: openspec 1.8.0+ writes its Codex (and
  1.7.0's `agents`, 1.10's `zed`, 1.11's `antigravity`) skills to that shared
  root instead of under a per-harness `.<tool>/` dir, so an install done with
  any of those targets leaves no trace under the three `.<harness>` dirs cospec
  otherwise scans. cospec now writes its own skills to that same root (targets
  `codex`, `agents`, `zed` and `antigravity`), so the two toolchains' output
  coexists there: cospec owns only its `cospec-*` dirs, and `--remove-opsx`
  still removes only openspec-authored files. The superset walk of `.agents/`
  and the subset walk of `.agents/skills/` are deduped, so a leftover is
  reported once. The one non-frontmatter file it lists is the binary's ownership
  marker `.agents/skills/.openspec-target` (a file holding one tool id), and
  only once no `openspec-*` skill is left under the root for it to describe, so
  a skill you wrote under that name keeps it. A pre-opsx command at a
  file-pattern legacy path (`.cursor/commands/openspec-*.md`) is a leftover only
  when it carries the `<!-- OPENSPEC:START -->`/`<!-- OPENSPEC:END -->` markers:
  the binary's own cleanup removes such a file by name, and cospec deliberately
  does not, because a same-named file without the markers is yours.
- **Shared `.agents/skills` root** — four rows write to it: `codex`, `agents`,
  `zed` and `antigravity`. Their skill paths coincide, but Antigravity spells
  its skill bodies `/cospec-<skill>` (`flat`) while `codex`, `agents` and `zed`
  use the `shared` dialect, so the tree holds one set of bytes from one writer.
  `harness/shared-root.ts` picks the writer in upstream's
  `resolveSharedSkillWriters` order: the row named by the marker
  `.agents/skills/.cospec-target` when it is selected; cospec's pre-marker
  evidence (a `.codex/rules/cospec.rules` file or a legacy
  `.codex/skills/cospec-*` skill means `codex`); an existing cospec skill means
  `agents`; then `codex`, then the first selected row in the pinned OpenSpec's
  tool order (antigravity, codex, zed, agents). `init` also keeps a configured
  owner of the root in the run when it selects only rows beside it (as the
  binary does), so `init --harness agents` followed by
  `init --harness zed,antigravity` leaves `agents` the writer. Rows with no
  commands form the preferred pool when any is selected. `generate()` passes the
  writer set to the renderer, so no two rows emit one path; the render-conflict
  error remains as the guard for a caller that bypasses the arbiter. The marker
  is manifest-tracked, and cospec never reads or writes upstream's
  `.openspec-target`, which names the owner of OpenSpec's own `openspec-*`
  skills. Detection on `init`, `update` and `doctor` asks the same question, is
  this row the writer here (`isSharedSkillTargetActive`), so a row detected only
  through the shared tree is kept only when it is the writer. Because the codex
  row's `detectionPaths` now match upstream's (`.agents/skills` and
  `.codex/skills`), an agents-only repo is not mis-detected as Codex.
  Auto-detection still keys on `.agents/skills`, not a bare `.agents/`, so a
  repo with only `AGENTS.md` there is not a harness.
- **Legacy tool roots** — earlier releases wrote some files outside the current
  roots: `.codex/skills` (Codex), `.kimi` (Kimi Code), `.windsurf` (Devin) and
  `.agent` (Antigravity). Each row's `legacyToolRoots` names its legacy roots,
  with `needsConsent` and `timing`. `legacy-skills.ts` moves OpenSpec's files
  from them and cospec's own legacy Codex skills follow the managed-file rule: a
  copy whose body still hashes to its stamped `contentHash` is removed once the
  replacement exists under `.agents/skills`, and a hand-edited copy is left in
  place and reported until `--force`. Empty directories are pruned with `rmdir`,
  never `rm -r`, and `.codex/` itself is never removed (the rules file lives
  there). While a legacy file or a pending move remains, `doctor` reports a
  `legacy-layout` warning and `cospec update --check` exits `1`. The site's
  [Harness setup](https://cospec.aligned.team/guide/harness-setup#legacy-tool-roots)
  page lists each root and its consent rule.
- **Setup notes** — init ends by printing each selected row's `setupNote` in
  selection order (restart Claude Code, reload the OpenCode project, start a new
  Codex or agents session for `.agents/skills`, and so on). After those, it
  prints upstream's single `Restart your IDE to refresh commands.` (or
  `skills.`) line whenever any selected row's `requiresIdeRestart` is set;
  `update` prints the same line after a write when a detected harness's row sets
  it. `ideRestartLine` prefers the commands wording whenever a flagged row has
  commands. cospec ships no hooks, so no `[features] hooks` config is needed.

## Per-harness smoke checklist

Codex and OpenCode project-level skill loading is inferred from real repos, not
vendor docs — that inference is why this note exists here rather than only on
the site. All enforcement lives in the CLI, so a half-loaded skill still cannot
bypass a gate. The actual checklist to run after `init` is owned by the site:
[Harness setup](https://cospec.aligned.team/guide/harness-setup#smoke-checks).
