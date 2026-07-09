---
title: Harness setup
description:
  What cospec init writes for Claude Code, Codex, and OpenCode — skills,
  commands, the one permission entry, and how to confirm it loaded.
---

# Harness setup

`cospec init --harness <list>` wires cospec's eleven workflows — `propose`,
`new`, `continue`, `ff`, `apply`, `verify`, `archive`, `bulk-archive`,
`sync-specs`, `explore`, `onboard` — into your agent harness by writing project
files directly. This is cospec's full parity set with opsx 1.5.0: every live
opsx workflow has a cospec-adapted counterpart (opsx `sync` maps to cospec
`sync-specs`), and cospec always emits the complete set to every configured
harness — there's no core/custom profile split to opt into. There is no
marketplace, no plugin package, and no global state under your home directory:
everything lands inside the repo, under version control, and `cospec update`
regenerates it in place. Every generated workflow body calls only `cospec`
commands, never bare `openspec`, so a harness needs exactly one permission entry
to run the whole loop.

## What gets written

::: code-group

```txt [Claude Code]
.claude/commands/cospec/{propose,new,continue,ff,apply,verify,archive,bulk-archive,sync-specs,explore,onboard}.md
.claude/skills/cospec-{propose,new-change,continue-change,ff-change,apply-change,verify-change,archive-change,bulk-archive-change,sync-specs,explore,onboard}/SKILL.md
.claude/settings.json   # Bash(cospec *) merged into permissions.allow
```

```txt [Codex]
.codex/skills/cospec-{same eleven}/SKILL.md
.codex/rules/cospec.rules   # pre-approves read-only + gate cospec calls
```

```txt [OpenCode]
.opencode/commands/cospec-{same eleven}.md   # full workflow bodies
.opencode/skills/cospec-{same eleven}/SKILL.md
```

:::

Slash command syntax is adapted per harness — `/cospec:propose` in Claude Code,
`/cospec-propose` in OpenCode. Codex has no project-level slash commands, so its
skills are invoked by description. OpenCode's command bodies are self-contained
(they work even when `.claude/` is absent), whereas Claude Code's commands point
at the paired skill.

For Claude Code specifically, init reads `.claude/settings.json` (creating `{}`
if it doesn't exist yet) and additively merges `Bash(cospec *)` into
`permissions.allow`. Nothing else in the file is touched, and nothing is
removed. If the file doesn't parse as JSON, cospec prints the snippet to add by
hand instead of guessing at your settings.

::: tip Managed files, not hand-edited ones Everything above is a _managed
file_: cospec tracks it by content hash and regenerates it on `cospec update`.
If you've hand-edited one, cospec writes its version alongside as
`<file>.cospec-new` rather than overwriting your changes. See
[Configuration](/reference/configuration) for the full managed-file protocol.
:::

## Restart or reload per harness

Agent harnesses cache their command and skill lists at different points in their
lifecycle, so pick up newly generated files with:

- **Claude Code** — restart the session. `/cospec:*` commands are read at
  startup.
- **Codex** — start a new session; skills are loaded per session.
- **OpenCode** — reload the project.

cospec ships no hooks, so there's no `[features] hooks` configuration to add
anywhere.

## Smoke checks

Confirm each harness actually picked up the generated files before relying on
it:

1. **Claude Code** — after restarting, `/cospec:propose` appears in the command
   list, and `Bash(cospec *)` is present in `.claude/settings.json`.
2. **Codex** — start a session and confirm the `cospec-*` skills are listed; a
   read-only call like `cospec status` should run without an approval prompt,
   while `cospec archive` still prompts (that's intentional — see below).
3. **OpenCode** — after reloading, `/cospec-propose` runs and drives the
   proposal loop even with `.claude/` absent, since OpenCode's bodies are full
   rather than pointers to a skill file.
4. **`/cospec:verify`** — the dress-rehearsal command users specifically expect
   coming from opsx exists in every harness's command/skill list; run it against
   an in-flight change and confirm it walks the verification ledger and names
   the two hard archive gates before handing off to `archive`.

All enforcement lives in the `cospec` CLI itself, not in the harness layer, so a
partially loaded skill can't bypass a gate — worst case, an agent has to be told
to run the right command by hand. Codex's `cospec.rules` deliberately leaves
`cospec archive` outside the pre-approved set, since it mutates
`openspec/changes/` on disk — `bulk-archive` and `onboard` call the same
`cospec archive` command under the hood, so Codex prompts once per change
archived, not just once per workflow invocation.

## Coexisting with OpenSpec's own files

If a project previously ran plain `openspec init`, cospec's `init` detects
OpenSpec's own generated files (frontmatter `author: openspec`) and lists them
with a warning rather than silently leaving two competing command sets in place;
pass `--remove-opsx` (or confirm interactively) to clean them up. Files you
authored yourself are never touched. See
[How it relates to OpenSpec](/concepts/how-it-relates-to-openspec) for the
version pin this wrapping relies on.
