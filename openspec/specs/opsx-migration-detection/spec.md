# opsx-migration-detection Specification

## Purpose

Covers cospec's detection and removal of leftover vanilla-OpenSpec artifacts
from a repo that migrated to cospec, so `cospec doctor` and
`cospec init --remove-opsx` find and clean up files openspec wrote — including
under the shared `.agents/skills/` root it has used since 1.8.0 — while never
touching a file that merely lives in a scanned directory without matching
openspec's own authored shape.

## Requirements

### Requirement: Leftover scan covers the shared agents skills root

cospec SHALL scan `.agents/skills/` for leftover vanilla-openspec artifacts, in
addition to the `.claude`, `.codex`, and `.opencode` harness directories,
because OpenSpec has written its shared skills there since 1.8.0. The scan
behind `cospec init --remove-opsx` and `cospec doctor`'s `opsx-leftover` finding
is the same scan and gains the root together. `.agents/` SHALL be scanned only:
cospec SHALL NOT generate into it, and adding it here SHALL NOT make it a
harness target.

#### Scenario: Doctor sees an opsx skill under .agents

- **WHEN** `cospec doctor` runs in a repo containing
  `.agents/skills/openspec-propose/SKILL.md` written by vanilla openspec
- **THEN** the `opsx-leftover` finding names that file

#### Scenario: Remove-opsx deletes it and prunes the directory

- **WHEN** `cospec init --remove-opsx` runs in that repo
- **THEN** the file is deleted and the emptied `.agents/skills/openspec-propose`
  directory is pruned

#### Scenario: .agents is not a generation target

- **WHEN** `cospec init` renders harnesses
- **THEN** nothing is written under `.agents/` and the rendered harness set is
  unchanged

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
