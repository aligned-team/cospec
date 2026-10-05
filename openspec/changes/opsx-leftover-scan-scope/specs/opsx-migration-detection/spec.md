# Spec Delta

## ADDED Requirements

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

### Requirement: OpenCode command leftovers are detected by their own shape

The pinned OpenCode command adapter writes `.opencode/commands/opsx-<id>.md`
with frontmatter carrying `description` only — no `name`, no `metadata` — so
neither of the scan's existing provenance markers (skill
`metadata.author: openspec`, command `name: "OPSX: …"`) can ever match it. The
leftover scan SHALL also treat a file as an openspec-authored leftover when all
of the following hold: its path matches `.opencode/commands/opsx-<id>.md` with
one path segment for `<id>`; its frontmatter has no key but `description`; and
its body contains the literal, backtick-quoted `` `openspec list --json` ``
command reference every opsx workflow body carries. This detection SHALL NOT
fire on path or frontmatter shape alone — the body's literal command reference
is required, so a hand-written file at the same path with its own prose body is
never matched.

#### Scenario: A real OpenCode opsx leftover is detected and removed

- **WHEN** `.opencode/commands/opsx-propose.md` carries only a `description` key
  in its frontmatter and a body containing `` `openspec list --json` ``, and
  `cospec init --remove-opsx` runs
- **THEN** `init --json`'s `opsx.found` lists that file, `cospec doctor` reports
  an `opsx-leftover` finding for it, and `--remove-opsx` deletes it

#### Scenario: A user's own file at the same path shape survives

- **WHEN** `.opencode/commands/opsx-notes.md` carries only a `description` key
  in its frontmatter but a body of the user's own prose, with no
  `` `openspec list --json` `` reference, and `cospec init --remove-opsx` runs
- **THEN** that file is not listed in `opsx.found`, produces no `opsx-leftover`
  finding, and is not removed
