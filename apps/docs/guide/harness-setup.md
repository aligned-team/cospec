---
title: Harness setup
description:
  What cospec init writes for Claude Code, Codex, OpenCode, and the shared
  .agents root — skills, commands, the one permission entry, and how to confirm
  it loaded.
---

# Harness setup

`cospec init --harness <list>` wires cospec's twelve workflows — `propose`,
`new`, `continue`, `ff`, `apply`, `verify`, `archive`, `bulk-archive`,
`sync-specs`, `explore`, `onboard`, `update` — into your agent harness by
writing project files directly. This is cospec's full parity set with opsx
1.11.0: every live opsx workflow has a cospec-adapted counterpart (opsx `sync`
maps to cospec `sync-specs`, opsx `update` to cospec `update`), and cospec
always emits the complete set to every configured harness — there's no
core/custom profile split to opt into. There is no marketplace, no plugin
package, and no global state under your home directory: everything lands inside
the repo, under version control, and `cospec update` regenerates it in place.
Every generated workflow body calls only `cospec` commands, never bare
`openspec`, so a harness needs exactly one permission entry to run the whole
loop.

## What gets written

::: code-group

```txt [Claude Code]
.claude/commands/cospec/{propose,new,continue,ff,apply,verify,archive,bulk-archive,sync-specs,explore,onboard,update}.md
.claude/skills/cospec-{propose,new-change,continue-change,ff-change,apply-change,verify-change,archive-change,bulk-archive-change,sync-specs,explore,onboard,update-change}/SKILL.md
.claude/settings.json   # Bash(cospec *) merged into permissions.allow
```

```txt [Codex]
.agents/skills/cospec-{same twelve}/SKILL.md   # the shared root, below
.codex/rules/cospec.rules   # pre-approves read-only + gate cospec calls
```

```txt [agents]
.agents/skills/cospec-{same twelve}/SKILL.md
```

```txt [OpenCode]
.opencode/commands/cospec-{same twelve}.md   # full workflow bodies
.opencode/skills/cospec-{same twelve}/SKILL.md
```

:::

Slash command syntax is adapted per harness — `/cospec:propose` in Claude Code,
`/cospec-propose` in OpenCode. The shared `.agents/skills` root emits no command
files at all, so bodies written there name the **skill** (`$cospec-propose` in
Codex, `/cospec-propose` in other AGENTS.md-aware assistants) rather than a
slash command that would not resolve. Skill names and workflow ids are not
interchangeable — only four of the twelve spell the same (`/cospec:apply`
becomes `$cospec-apply-change`). OpenCode's command bodies are self-contained
(they work even when `.claude/` is absent), whereas Claude Code's commands point
at the paired skill. For a workflow that reads a positional argument (a type +
description, or a change slug), OpenCode's **command** body additionally gets a
`$ARGUMENTS` placeholder inserted before its first section — OpenCode only
forwards a slash command's typed arguments through an explicit placeholder,
unlike Claude Code and Codex, which bind the argument implicitly. The paired
**skill** body never gets this placeholder, so the two rendered bodies
legitimately differ for the same workflow on OpenCode.

## The shared `.agents/skills` root

`.agents/skills` is the vendor-neutral skills root read by Codex, Zed,
Antigravity and other AGENTS.md-aware assistants. cospec writes its skills there
for two targets — `codex` and `agents` — and they are **byte-identical**,
contentHash included: selecting both writes each file exactly once, and there is
no per-tool ownership marker to reconcile. The only difference between the two
is that `codex` additionally emits `.codex/rules/cospec.rules`. Pick `agents`
alone when you want the skills without Codex's approval rules.

Auto-detection keys on `.agents/skills`, not a bare `.agents/` directory, so a
repo that only keeps an `AGENTS.md` or notes under `.agents/` is not treated as
a harness.

::: warning Moved from `.codex/skills/` Earlier versions of cospec wrote Codex's
skills to `.codex/skills/`. `cospec update` migrates them: a legacy file whose
body still hashes to its own stamped `contentHash` is removed once the
replacement exists under `.agents/skills`, and a file you hand-edited is **left
in place**, reported, and only discarded with `--force`. Until the legacy
directory is clear, `cospec doctor` reports a `legacy-layout` warning and
`cospec update --check` exits `1`, so CI drift gates catch it. `.codex/` itself
is never removed — the rules file still lives there. :::

::: tip Coexisting with OpenSpec's own `.agents/skills/` A project previously
initialized with `openspec` **1.7.0+** (its vendor-neutral `agents` target, or
1.8.0's Codex output, 1.10's `zed`, or 1.11's `antigravity`) may already have
`openspec-*` skills in this root. The two coexist: cospec owns only its
`cospec-*` directories, and `cospec init --remove-opsx` still removes only
openspec-authored files (frontmatter `author: openspec`). :::

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
- **Codex** — start a new session; skills are loaded per session from
  `.agents/skills`, invoked as `$cospec-<skill>`.
- **OpenCode** — reload the project.
- **agents** — however the assistant reading `.agents/skills` reloads; cospec
  generates no slash commands for this target.

cospec ships no hooks, so there's no `[features] hooks` configuration to add
anywhere.

## Smoke checks

Confirm each harness actually picked up the generated files before relying on
it:

1. **Claude Code** — after restarting, `/cospec:propose` appears in the command
   list, and `Bash(cospec *)` is present in `.claude/settings.json`.
2. **Codex** — start a session and confirm the `cospec-*` skills from
   `.agents/skills` are listed; a read-only call like `cospec status` should run
   without an approval prompt, while `cospec archive` still prompts (that's
   intentional — see below).
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
