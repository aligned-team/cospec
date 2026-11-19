# Spec Delta

## MODIFIED Requirements

### Requirement: Leftover scan shares the agents skills root

cospec SHALL scan `.agents/skills/` for leftover vanilla-openspec artifacts,
alongside the `.claude`, `.codex`, and `.opencode` harness directories, since
OpenSpec writes its shared skills there from 1.8.0; `cospec init --remove-opsx`
and `cospec doctor`'s `opsx-leftover` finding share that scan. As cospec's own
`cospec-*` skills also live there, removal SHALL stay decided by a file's
authored shape and SHALL never touch a file cospec generated.

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

#### Scenario: The overlapping agents walk is deduplicated by path

- **WHEN** the `agents` harness directory walk and the shared `.agents/skills/`
  walk both reach the same leftover
- **THEN** the scan deduplicates by path, so `cospec doctor` reports it once and
  `cospec init --json`'s `opsx.found` counts it once

### Requirement: Leftover scan does not cross a nested worktree boundary

The opsx leftover scan (behind `cospec init --remove-opsx`, `init --json`'s
`opsx.found`, and `cospec doctor`'s `opsx-leftover` finding) SHALL NOT descend
into a nested git working tree distinct from the project's own: a directory with
its own `.git` entry, file (worktree) or directory (embedded clone). A file
inside one SHALL NOT be listed, reported, or removed, whatever its shape. Only
the walk boundary is affected; accepting a file in the project's own tree is
unchanged.

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

The opsx leftover scan SHALL NOT read or remove a file that resolves, symlinks
followed, outside the project's own tree. Before reading a scan root (any
`scanRoots` entry such as `.claude` or `.agents`, or the shared `.agents/skills`
walk) it SHALL resolve it and skip it unless it stays inside the project's
resolved directory; `--remove-opsx` SHALL re-check containment just before each
delete or prune. A symlink resolving inside the project is walked normally.

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

### Requirement: OpenCode command leftovers are detected by their own shape

The leftover scan SHALL also treat as openspec-authored a file at
`.opencode/commands/opsx-<id>.md`, `<id>` one of the 12 workflow ids the pinned
dist writes, whose frontmatter has only `description` and whose body holds both
the pinned `PROJECT_ROOT_GUARD` lead sentence
`**Project check:** These steps expect a project that already uses OpenSpec.`
and the backtick-quoted `` `openspec list --json` ``. Path shape, frontmatter
shape, or the command reference alone SHALL never suffice.

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

#### Scenario: The twelve ids are the pinned dist's

- **WHEN** the OpenCode command shape is checked
- **THEN** `<id>` must be one of `propose`, `explore`, `new`, `continue`,
  `apply`, `update`, `ff`, `sync`, `archive`, `bulk-archive`, `verify`,
  `onboard`, because the pinned adapter writes `description`-only frontmatter
  that neither the skill `metadata.author: openspec` nor the command
  `name: "OPSX: …"` marker can match

### Requirement: Leftovers are found for every tool

The leftover scan SHALL read, per harness row, where the pinned binary writes
that tool's commands (`opsx-<id>` or `opsx/<id>`, with its `.md`, `.toml`,
`.prompt` or `.prompt.md` extension), its project skills root, and its
`LEGACY_SLASH_COMMAND_PATHS` entries, directory-scoped ones and their
`managedFileNames` included. A file SHALL be a leftover only when its content
proves OpenSpec wrote it. A legacy folder SHALL be removed only once empty.

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

#### Scenario: A selected home-relative skills root is scanned

- **WHEN** a selected harness's skills root is home-relative
- **THEN** that home skills root is also read and each match is listed with its
  absolute path and `scope: "home"`

#### Scenario: Content markers prove authorship

- **WHEN** a candidate file is examined
- **THEN** an opsx-era file is a leftover only when it carries the pinned
  root-guard reference to `` `openspec list --json` `` or the existing skill and
  command markers, and a pre-opsx file only with the
  `<!-- OPENSPEC:START -->`/`<!-- OPENSPEC:END -->` markers, a same-named file
  without them being the user's, stricter than the binary's by-name removal

#### Scenario: The shared-root ownership marker is the one exception

- **WHEN** `.agents/skills/.openspec-target` holds one tool id
- **THEN** it is a leftover once no non-leftover `openspec-*` skill remains
  under `.agents/skills`

### Requirement: OpenSpec-written Codex global prompts are cleaned up

With the `codex` harness selected, the leftover scan SHALL read the Codex global
prompts directory (`$CODEX_HOME/prompts` when `CODEX_HOME` is non-empty, else
`<home>/.codex/prompts`) for the twelve names the pinned binary allowlists
(`opsx-<workflow>.md`), list each match with its absolute path and
`scope: "home"`, and delete a match only under `--remove-opsx`, after the
replacement Codex skills are written in the same run. Any other file there SHALL
be left alone.

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

### Requirement: Root-level legacy config files are swept for OpenSpec blocks

The leftover scan SHALL also read the eight root files in the pinned
`LEGACY_CONFIG_FILES` (`CLAUDE.md`, `CLINE.md`, `CODEBUDDY.md`, `COSTRICT.md`,
`QODER.md`, `IFLOW.md`, `AGENTS.md`, `QWEN.md`), reporting one holding both
`<!-- OPENSPEC:START -->` and `<!-- OPENSPEC:END -->`. With `--remove-opsx` or
`--yes` it SHALL remove the block as the binary's `removeMarkerBlock` does,
never deleting the file, keeping other content byte-for-byte. Without consent
they SHALL only be listed.

#### Scenario: A block is stripped and the rest kept

- **WHEN** `AGENTS.md` holds `keep me`, a blank line and an OpenSpec block, and
  `cospec init --remove-opsx` runs
- **THEN** `AGENTS.md` is `keep me` and one newline, and the receipt says
  `Removed OpenSpec markers from AGENTS.md`

#### Scenario: A file that is only the block is kept, empty

- **WHEN** `CLAUDE.md` holds nothing but an OpenSpec block and
  `cospec init --remove-opsx` runs
- **THEN** `CLAUDE.md` still exists and is zero bytes, matching what
  `openspec init --force` leaves

#### Scenario: Without consent nothing changes

- **WHEN** `cospec init` runs without `--remove-opsx` or `--yes` over a root
  file carrying a block
- **THEN** the file is byte-identical, the receipt lists it, and `cospec doctor`
  reports an `opsx-leftover` WARNING naming it

#### Scenario: An inline mention is not a block

- **WHEN** a root file mentions the start marker inside a sentence, and the end
  marker on a line of its own
- **THEN** removal changes nothing, as the pinned binary's does

#### Scenario: CRLF files keep their line endings

- **WHEN** a root file with `\r\n` line endings carries a block and removal runs
- **THEN** the remaining lines end in `\r\n`

#### Scenario: Block removal follows removeMarkerBlock

- **WHEN** a block is removed
- **THEN** only a marker alone on its line counts, the lines from the start
  marker's through the end marker's are removed, runs of three or more line
  breaks become two, trailing whitespace is trimmed, the line-ending style is
  kept, and a file holding only the block is written empty
