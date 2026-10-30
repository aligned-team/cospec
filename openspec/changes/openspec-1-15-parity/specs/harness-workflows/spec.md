# Spec Delta

## ADDED Requirements

### Requirement: OpenSpec 1.15.0 tool targets

`HARNESS_TABLE` SHALL carry a row for every tool id the 1.15.0 binary exposes,
adding `codestudio`, `dsh`, `gigacode`, `atomcode`, `gsd`, `amp`, `easycode`,
`veai`, `grok`, and `warp`, each at upstream's skills and commands paths, with
cospec's skill and command names. Skills-only tools SHALL get no command files.

#### Scenario: Init a new target

- **WHEN** a user runs `cospec init --tools warp,dsh`
- **THEN** `.warp/skills/cospec-*/SKILL.md` and `.dsh/skills/cospec-*/SKILL.md`
  are written and no command files are written for either

#### Scenario: AtomCode argument frontmatter

- **WHEN** cospec renders AtomCode commands
- **THEN** a workflow that reads invocation input declares `args: optional` and
  receives `$ARGUMENTS`, and one that does not declares `args: none`

### Requirement: Kilo Code commands move to .kilo/command

Kilo Code commands SHALL be written to `.kilo/command/`. Init, update, and
legacy cleanup SHALL remove cospec- and OpenSpec-generated files under
`.kilocode/workflows/`, matched by known file names only, and leave every other
file there.

#### Scenario: User file survives

- **WHEN** `.kilocode/workflows/` holds a generated file and `my-notes.md`
- **THEN** after `cospec update` the generated file is gone, `my-notes.md`
  remains, and commands exist under `.kilo/command/`

### Requirement: Update dry run

`cospec update --dry-run` SHALL write nothing and report what an update would
do. `--json` SHALL emit upstream's document (`changes[]` of
`{path, action, tool}`, `notes`, `failures`, and `status` on an early failure,
which exits nonzero), with cospec's `row` and `reason` added to each change. The
existing `update --check` drift gate SHALL keep its own exit-1-on-drift
semantics.

#### Scenario: Nothing written

- **WHEN** a user runs `cospec update --dry-run --json` on a stale tree
- **THEN** `changes[]` lists the pending writes and `git status` shows no
  modification

#### Scenario: Early failure

- **WHEN** the dry run cannot resolve a project root
- **THEN** the document carries `status` and `failures` and the exit code is
  nonzero

#### Scenario: Check and dry run differ

- **WHEN** a stale tree is run through `--check` and then `--dry-run`
- **THEN** `--check` exits 1 and `--dry-run` exits 0, and neither writes

### Requirement: Legacy marker removal keeps line endings

Removing a legacy OpenSpec marker block from `CLAUDE.md`, `AGENTS.md`, or an rc
file SHALL rewrite the file with its dominant line ending, including the
separator left by the blank-line collapse, so a CRLF file stays CRLF.

#### Scenario: CRLF CLAUDE.md

- **WHEN** `cospec init` removes a legacy OpenSpec block from a CRLF `CLAUDE.md`
- **THEN** every line ending in the result is CRLF

### Requirement: Canon ports through OpenSpec 1.15.0

The canon workflow bodies SHALL carry the 1.13.2–1.15.0 upstream passages, each
recorded with its upstream template and pin, adapted to route through cospec:
verify, explore, update, specs, continue, tasks, ff, onboard, archive, and
proposal guidance.

#### Scenario: Port ledger

- **WHEN** the port ledger test runs
- **THEN** every ported passage names its upstream template and pin 1.15.0, and
  no generated body names bare `openspec`

#### Scenario: Removed requirement verified against baseline

- **WHEN** `/cospec:verify` checks a REMOVED requirement whose baseline cannot
  be recovered
- **THEN** that entry is reported as not verified rather than passing
