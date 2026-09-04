## ADDED Requirements

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

## REMOVED Requirements

- `### Requirement: Leftover scan covers the shared agents skills root`
