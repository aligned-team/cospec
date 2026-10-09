# opsx-migration-detection Specification

## Purpose

Covers cospec's detection and removal of leftover vanilla-OpenSpec artifacts
from a repo that migrated to cospec, so `cospec doctor` and
`cospec init --remove-opsx` find and clean up files openspec wrote — including
under the shared `.agents/skills/` root it has used since 1.8.0 — while never
touching a file that merely lives in a scanned directory without matching
openspec's own authored shape.

## Requirements

### Requirement: Removal is shape-gated

Leftover removal SHALL continue to be decided by the file's own shape — the
openspec-authored frontmatter markers the detector already matches — and never
by directory membership alone. A file under a scanned root that does not match
those markers SHALL be left in place, whether it was authored by cospec, by
another tool, or by hand.

#### Scenario: A third-party skill under .agents survives

- **WHEN** `.agents/skills/` contains a skill that is not openspec-authored and
  `cospec init --remove-opsx` runs
- **THEN** that file is untouched and is not reported as an `opsx-leftover`

#### Scenario: A cospec-authored file is never removed

- **WHEN** a scanned root contains a file cospec itself generated
- **THEN** the leftover scan does not report it and removal does not delete it

### Requirement: Leftover scan shares the agents skills root

cospec SHALL scan `.agents/skills/` for leftover vanilla-openspec artifacts, in
addition to the `.claude`, `.codex`, and `.opencode` harness directories,
because OpenSpec has written its shared skills there since 1.8.0. The scan
behind `cospec init --remove-opsx` and `cospec doctor`'s `opsx-leftover` finding
is the same scan and covers the root together.

`.agents/skills/` is now also a cospec generation target: cospec's own
`cospec-*` skills and openspec's `openspec-*` leftovers coexist in that one
root. Removal SHALL therefore stay decided by a file's authored shape and SHALL
never touch a file cospec generated. Because the `agents` harness directory
strictly contains the shared skills root, the two walk ranges overlap; the scan
SHALL deduplicate by path so a leftover under `.agents/skills/` is reported
exactly once by `cospec doctor` and counted exactly once in
`cospec init --json`'s `opsx.found`.

This requirement replaces "Leftover scan covers the shared agents skills root",
whose claim that cospec never generates into `.agents/` this change falsifies.
Its two surviving scenarios are carried over verbatim below.

#### Scenario: Doctor sees an opsx skill under .agents

- **WHEN** `cospec doctor` runs in a repo containing
  `.agents/skills/openspec-propose/SKILL.md` written by vanilla openspec
- **THEN** the `opsx-leftover` finding names that file

#### Scenario: Remove-opsx deletes it and prunes the directory

- **WHEN** `cospec init --remove-opsx` runs in that repo
- **THEN** the file is deleted and the emptied `.agents/skills/openspec-propose`
  directory is pruned

#### Scenario: cospec and openspec skills coexist in the shared root

- **WHEN** `.agents/skills/` holds both cospec's generated `cospec-*` skills and
  a leftover `openspec-*` skill, and `cospec init --remove-opsx` runs
- **THEN** only the openspec-authored leftover is removed and every `cospec-*`
  skill is left in place

#### Scenario: An overlapping walk reports a leftover once

- **WHEN** `cospec doctor --json` and `cospec init --json` run in a repo with
  one leftover under `.agents/skills/`
- **THEN** each reports that file exactly once, despite `.agents` and
  `.agents/skills` both being walked

### Requirement: Leftover scan does not cross a nested worktree boundary

The opsx leftover scan (behind `cospec init --remove-opsx`, `init --json`'s
`opsx.found`, and `cospec doctor`'s `opsx-leftover` finding) SHALL NOT descend
into a nested git working tree distinct from the project's own — a directory
whose own `.git` entry exists, whether a worktree checkout (`.git` as a file) or
an embedded clone (`.git` as a directory). A file inside such a directory SHALL
NOT be listed in `opsx.found`, SHALL NOT produce an `opsx-leftover` finding, and
SHALL NOT be removed by `--remove-opsx`, even when it would otherwise match the
scan's shape. Only the scan's walk boundary is affected; its acceptance of a
file inside the project's own tree is unchanged.

#### Scenario: A nested worktree's own leftover is left for its own scan

- **WHEN** `cospec init --remove-opsx` runs in a repo that holds a nested git
  worktree checkout under `.claude/worktrees/<name>/`, whose own
  `.claude/commands/opsx/<id>.md` is a real openspec-authored command leftover
- **THEN** that file is not listed in `opsx.found`, `cospec doctor` reports no
  `opsx-leftover` finding for it, and `--remove-opsx` does not delete it

#### Scenario: A file outside any nested worktree is still found

- **WHEN** the same repo also holds an openspec-authored leftover directly under
  its own `.claude/`, not inside `.claude/worktrees/`
- **THEN** that file is still listed in `opsx.found` and removed by
  `--remove-opsx`

### Requirement: Leftover scan never follows a symlinked scan root outside the project

The opsx leftover scan SHALL NOT read or remove a file that resolves (symlinks
followed) outside the project's own directory tree. Before reading a scan root's
directory — any `scanRoots` entry (`.claude`, `.agents`, …) or the explicit
shared `.agents/skills` walk — the scan SHALL resolve that path and skip it
unless the resolved path stays inside the project's own resolved directory;
`--remove-opsx` SHALL re-check the same containment immediately before deleting
each file or pruning each now-empty directory. A symlink that resolves back
inside the project is unaffected and is still walked normally.

#### Scenario: A symlinked `.claude` outside the project is never read or removed

- **WHEN** a project's `.claude` is a symlink to a directory outside the project
  (a shared dotfiles directory, or another project's checkout) holding a real
  openspec-authored command leftover, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, produces no `opsx-leftover`
  finding, is not removed, and still exists afterward

#### Scenario: A symlinked `.agents/skills` outside the project is never read or removed

- **WHEN** a project's `.agents` is a real directory but `.agents/skills` within
  it is a symlink to a directory outside the project holding a real
  openspec-authored skill leftover, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, is not removed, and still
  exists afterward

#### Scenario: A scan root that is, or resolves into, a nested checkout is never read or removed

- **WHEN** a scan root (`.claude`, `.agents`, `.agents/skills`, `openspec`) is
  itself an embedded clone (holds its own `.git`), sits inside one, or is a
  symlink resolving into a nested worktree checkout inside the project, holding
  a real openspec-authored leftover, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, is not removed, and still
  exists afterward; `--remove-opsx` re-checks the same nested-checkout test on
  the path and its resolved target immediately before each delete

### Requirement: Doctor's other scan-root walks share the same boundary

`cospec doctor`'s `stale-sidecar` check and its read of cospec-written harness
files (behind `stale-harness`, `mixed-versions` and `dangling-ref`) SHALL
descend the scan roots with the same boundary as the opsx leftover scan: never
into a nested git working tree (a scan root that is, sits in, or resolves into
one included), and never out of the project through a scan root (or `openspec/`)
that resolves outside it.

#### Scenario: A nested worktree's sidecar is not reported

- **WHEN** a repo holds a nested git worktree checkout under
  `.claude/worktrees/<name>/` containing a `.cospec-new` sidecar, and
  `cospec doctor` runs in the outer project
- **THEN** no `stale-sidecar` finding names a path inside that worktree, while a
  `.cospec-new` sidecar under the project's own `.claude/` is still reported

#### Scenario: A symlinked `.claude` outside the project is not walked

- **WHEN** a project's `.claude` is a symlink to a directory outside the project
  holding a `.cospec-new` sidecar or a cospec-stamped harness file, and
  `cospec doctor` runs
- **THEN** no `stale-sidecar` or harness-file finding is produced for it

### Requirement: OpenCode command leftovers are detected by their own shape

The pinned OpenCode command adapter writes `.opencode/commands/opsx-<id>.md`
with frontmatter carrying `description` only — no `name`, no `metadata` — so
neither of the scan's existing provenance markers (skill
`metadata.author: openspec`, command `name: "OPSX: …"`) can ever match it. The
leftover scan SHALL also treat a file as an openspec-authored leftover when all
of the following hold: its path matches `.opencode/commands/opsx-<id>.md` where
`<id>` is one of the 12 workflow ids the pinned dist's command-generation module
ever writes (`propose`, `explore`, `new`, `continue`, `apply`, `update`, `ff`,
`sync`, `archive`, `bulk-archive`, `verify`, `onboard`); its frontmatter has no
key but `description`; and its body contains both the pinned dist's
`PROJECT_ROOT_GUARD` template's literal lead sentence,
`**Project check:** These steps expect a project that already uses OpenSpec.`,
and the literal, backtick-quoted `` `openspec list --json` `` command reference
every opsx workflow body carries. This detection SHALL NOT fire on path shape,
frontmatter shape, or the bare command reference alone — an id outside the 12,
or a body missing the guard's lead sentence, is never enough — so a hand-written
file at a lookalike path, including one whose own prose happens to mention or
invoke the same command, is never matched.

#### Scenario: A real OpenCode opsx leftover is detected and removed

- **WHEN** `.opencode/commands/opsx-propose.md` carries only a `description` key
  in its frontmatter and a body containing the `PROJECT_ROOT_GUARD` lead
  sentence and `` `openspec list --json` ``, and `cospec init --remove-opsx`
  runs
- **THEN** `init --json`'s `opsx.found` lists that file, `cospec doctor` reports
  an `opsx-leftover` finding for it, and `--remove-opsx` deletes it

#### Scenario: A user's own file at the same path shape survives

- **WHEN** `.opencode/commands/opsx-notes.md` carries only a `description` key
  in its frontmatter but a body of the user's own prose, with no
  `` `openspec list --json` `` reference, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, produces no `opsx-leftover`
  finding, and is not removed

#### Scenario: A user's own file at an id the pinned dist never generates survives

- **WHEN** `.opencode/commands/opsx-status.md` carries only a `description` key
  in its frontmatter and a body that invokes or documents
  `` `openspec list --json` `` for the user's own purposes, and
  `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, produces no `opsx-leftover`
  finding, and is not removed, because `status` is not one of the 12 ids the
  pinned dist ever generates

#### Scenario: A real-id user file with only the bare command reference survives

- **WHEN** `.opencode/commands/opsx-propose.md` carries only a `description` key
  in its frontmatter and a body that quotes `` `openspec list --json` `` without
  the `PROJECT_ROOT_GUARD` lead sentence, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, produces no `opsx-leftover`
  finding, and is not removed

### Requirement: Leftovers are found for every tool

The leftover scan behind `cospec init --remove-opsx`, `cospec init --json`'s
`opsx.found` and `cospec doctor`'s `opsx-leftover` finding SHALL read, for every
harness row, the location the pinned OpenSpec binary writes that tool's commands
to (its `opsx-<id>` or `opsx/<id>` files, with whatever extension that tool
uses: `.md`, `.toml`, `.prompt` or `.prompt.md`) and that tool's project skills
root; for a selected harness whose skills root is home-relative it SHALL also
read that home skills root, listing each match with its absolute path and
`scope: "home"`; and it SHALL read every location in the binary's
`LEGACY_SLASH_COMMAND_PATHS` that belongs to a harness row, including
directory-scoped entries and their `managedFileNames`. A file SHALL be a
leftover only when its content proves OpenSpec wrote it: an opsx-era file
carries the pinned binary's root-guard reference to `` `openspec list --json` ``
or the existing skill and command markers, and a pre-opsx file carries the
`<!-- OPENSPEC:START -->`/`<!-- OPENSPEC:END -->` markers (for a file-pattern
entry this is stricter than the pinned binary, which removes a file that matches
by name; a same-named file without the markers is the user's). The one exception
is the binary's shared-root ownership marker `.agents/skills/.openspec-target`:
a file at exactly that path holding one tool id SHALL be a leftover once no
`openspec-*` skill that is not itself a leftover remains under `.agents/skills`.
A directory-scoped legacy folder SHALL be removed only once it is empty.

#### Scenario: a Gemini TOML leftover is found and removed

- **WHEN** the pinned binary's own `init --tools gemini` output is in the repo
  and `cospec init --harness gemini --remove-opsx` runs
- **THEN** every `.gemini/commands/opsx/<id>.toml` and
  `.gemini/skills/openspec-*/SKILL.md` it wrote is removed, and every cospec
  file is left in place

#### Scenario: every tool's own upstream output is found

- **WHEN** the pinned binary's `init --tools <id>` output for any harness row is
  in the repo and `cospec doctor` runs
- **THEN** every file that output wrote under the tool's directories is named by
  an `opsx-leftover` finding

#### Scenario: a pre-opsx Cursor command is found

- **WHEN** `.cursor/commands/openspec-proposal.md` carries the OpenSpec markers
- **THEN** it is reported as a leftover, and a
  `.cursor/commands/openspec-notes.md` without the markers is not

#### Scenario: the shared-root ownership marker goes with its skills

- **WHEN** `.agents/skills/.openspec-target` names `codex`, the root holds
  OpenSpec's `openspec-propose/SKILL.md`, and
  `cospec init --harness codex --remove-opsx` runs
- **THEN** the marker is listed in `opsx.found` and removed with the skill, and
  `.agents/skills/.cospec-target` is untouched

#### Scenario: a skill of the user's own keeps the marker

- **WHEN** the same marker sits beside a user-authored
  `.agents/skills/openspec-mine/SKILL.md` that carries no OpenSpec provenance
- **THEN** the marker is not listed and not removed

#### Scenario: a legacy command folder keeps the user's file

- **WHEN** `.claude/commands/openspec/` holds OpenSpec's `proposal.md`,
  `apply.md` and `archive.md` plus the user's `mine.md`, and
  `cospec init --remove-opsx` runs
- **THEN** only the three OpenSpec files are removed and the folder stays

### Requirement: OpenSpec-written Codex global prompts are cleaned up

When the `codex` harness is selected, the leftover scan SHALL read the Codex
global prompts directory (`$CODEX_HOME/prompts` when `CODEX_HOME` is set and
non-empty, else `<home>/.codex/prompts`) for the twelve file names the pinned
binary allowlists (`opsx-<workflow>.md`), SHALL list each match with its
absolute path and `scope: "home"`, and SHALL delete a match only under
`--remove-opsx`, after the replacement Codex skills have been written in the
same run. Any other file in that directory SHALL be left alone.

#### Scenario: CODEX_HOME is honoured

- **WHEN** `CODEX_HOME` points at a temp directory whose `prompts/` holds
  `opsx-apply.md` and `my-prompt.md`, and
  `cospec init --harness codex --remove-opsx` runs
- **THEN** `opsx-apply.md` is removed after
  `.agents/skills/cospec-apply-change/SKILL.md` exists, `my-prompt.md` stays,
  and nothing under the real home directory is read or touched

#### Scenario: codex not selected leaves global prompts alone

- **WHEN** the same prompts directory exists and
  `cospec init --harness claude --remove-opsx` runs
- **THEN** no global prompt is listed or removed
