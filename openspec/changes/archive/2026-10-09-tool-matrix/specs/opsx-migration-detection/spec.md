# Spec Delta

## ADDED Requirements

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
