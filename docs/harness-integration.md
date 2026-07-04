# Harness integration

cospec generates agent files by **direct project-file injection** — the same
model OpenSpec uses. No marketplaces, no plugin packages, no global state
(`~/.codex/prompts`, `CODEX_HOME`, `~/.claude`, and shell completions are all
out of scope). A Claude marketplace plugin could be layered later without
changing this contract.

## What gets written

Six workflows — `propose`, `continue`, `apply`, `archive`, `sync-specs`,
`explore` — single-sourced in `canon/workflows/*.md` and rendered per harness.

```
Claude Code:
  .claude/commands/cospec/{propose,continue,apply,archive,sync-specs,explore}.md   # /cospec:propose …
  .claude/skills/cospec-{propose,continue-change,apply-change,archive-change,sync-specs,explore}/SKILL.md
  .claude/settings.json                        # additive permissions merge

Codex (project-level only):
  .codex/skills/cospec-{same 6}/SKILL.md
  .codex/rules/cospec.rules                    # pre-approves read-only + gate cospec calls

OpenCode:
  .opencode/commands/cospec-{six}.md           # /cospec-propose … — FULL bodies, work with .claude absent
  .opencode/skills/cospec-{same 6}/SKILL.md
```

Slash syntax is substituted per harness (`/cospec:x` ↔ `/cospec-x`). Every body
calls **only** `cospec` commands — never bare `openspec` — so one permission
entry covers the whole loop.

## What each workflow does

- **propose** — parse `<type>: <desc>` or ask via the eleven-type table; run
  `cospec new`; loop `cospec status --json` → `cospec instructions <artifact>` →
  write the artifact, until every `apply.requires` artifact is done. Each
  artifact in the status JSON carries `ready` (its `requires` are all done, so
  it can be authored next) alongside `done` and `required`, so the loop can pick
  what to write without re-deriving the dependency graph.
- **continue** — resume the propose loop for a partially-built change.
- **apply** — run `cospec apply <c> --json` and obey the exit code (0 work the
  tasks, 2 stop and relay blockers, 3 confirm then `--allow-soft`). Never
  re-derive the gate from files.
- **archive** — run `cospec archive <c>`, relay the summary; on exit 1 relay the
  error verbatim and **never** hand-`mv` the directory.
- **sync-specs** — an honest body: spec sync is performed and verified by
  `cospec archive` as one coupled step. To preview, run `cospec validate <c>`
  and read the delta files. Mid-flight merging without archive is not supported.
- **explore** — thinking-mode exploration; may create artifacts, never
  implementation code.

## Provenance & the managed-file protocol

Every generated file carries provenance frontmatter:

```yaml
---
name: cospec-apply-change
description: …
metadata:
  author: cospec
  generatedBy: 'cospec@0.1.0'
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
  `generatedBy: "1.3.x"` + `author: openspec`) are never generated and never
  required. Pre-existing ones are listed with a warning at init and removed with
  `--remove-opsx` (or interactive confirm; `--yes` = yes). User-authored files
  (no `generatedBy`) are never touched. `doctor` warns while both command sets
  coexist, because two propose commands confuse agents.
- **Restart lines** — init ends with a per-harness note: restart Claude Code /
  reload the OpenCode project / Codex picks up skills per session. cospec ships
  no hooks, so no `[features] hooks` config is needed.

## Per-harness smoke checklist

Codex and OpenCode project-level skill loading is inferred from real repos, not
vendor docs. All enforcement lives in the CLI, so a half-loaded skill still
cannot bypass a gate — but confirm loading manually after `init`:

1. **Claude Code** — restart; `/cospec:propose` appears in the command list;
   `Bash(cospec *)` is in `.claude/settings.json`.
2. **Codex** — start a session; the `cospec-*` skills are listed; a read-only
   `cospec status` runs without an approval prompt (`archive` still prompts).
3. **OpenCode** — reload; `/cospec-propose` runs and drives the loop even with
   `.claude/` absent (OpenCode bodies are full, not pointers).
