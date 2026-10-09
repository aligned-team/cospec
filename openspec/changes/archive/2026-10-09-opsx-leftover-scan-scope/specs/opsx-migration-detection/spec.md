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
