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

### Requirement: Continue commands open with the already-active preamble

Each Continue command file (`.continue/prompts/cospec-<command>.prompt`) SHALL
open its body, right after the frontmatter, with the paragraph the pinned
binary's Continue adapter writes:
`This workflow prompt is already active. Follow its instructions directly. Do not call a tool named after this workflow.`
The row declares it as its commands' `preamble` in `HARNESS_TABLE`, the renderer
prepends it to command bodies only, and skill bodies SHALL never carry it.

#### Scenario: Continue's command carries the preamble

- **WHEN** the harness files are rendered for `['continue']`
- **THEN** the first body paragraph of `.continue/prompts/cospec-propose.prompt`
  is the preamble, and `.continue/skills/cospec-propose/SKILL.md` does not
  contain it

## MODIFIED Requirements

### Requirement: Shared .agents/skills harness root

cospec SHALL render skills for every harness whose skills root is `.agents`
(`codex`, `agents`, `amp`, `antigravity`, `gsd`, `zed`) into
`.agents/skills/cospec-<skill>/SKILL.md`, written by exactly one chosen harness
per run, writing the marker `.agents/skills/.cospec-target` (the chosen id and a
newline) with that root, tracked in the manifest. It SHALL NOT read or write
`.agents/skills/.openspec-target`. Writer choice, rendering, respelling and
detection are stated as scenarios.

#### Scenario: codex and agents render identical shared files

- **WHEN** the harness files are rendered for `['codex']` and for `['agents']`
  separately
- **THEN** every `.agents/skills/cospec-*/SKILL.md` is byte-identical between
  the two renders, `contentHash` included

#### Scenario: selecting both harnesses writes each file once

- **WHEN** the harness files are rendered for `['codex', 'agents']`
- **THEN** exactly twelve shared skill files and one `.codex/rules/cospec.rules`
  are emitted, with no duplicate output path

#### Scenario: selecting four shared-root harnesses writes each file once

- **WHEN** `cospec init --harness codex,agents,zed,antigravity` runs in a fresh
  repo
- **THEN** exactly twelve `.agents/skills/cospec-*/SKILL.md` files, one
  `.codex/rules/cospec.rules`, twelve `.agents/workflows/cospec-*.md` files and
  one `.agents/skills/.cospec-target` containing `codex` are written, with no
  output path written twice

#### Scenario: the marker keeps the writer across runs

- **WHEN** `.agents/skills/.cospec-target` names `agents` and
  `cospec init --harness agents,zed` runs
- **THEN** the shared skills are rendered for `agents`, the marker still names
  `agents`, and `cospec update` afterwards detects `agents` and not `zed`

#### Scenario: a configured owner stays the writer beside a new selection

- **WHEN** `.agents/skills/.cospec-target` names `agents`, `agents` is
  configured, and `cospec init --harness zed,antigravity` runs
- **THEN** the shared skills are rendered for `agents`, the marker still names
  `agents`, and the receipt line reads `(one tree, written for agents)`

#### Scenario: a fresh root with agents and zed is written for zed

- **WHEN** `cospec init --harness agents,zed` runs in a fresh repo
- **THEN** the marker names `zed`, as the pinned binary's marker does

#### Scenario: Antigravity alone writes flat skill references

- **WHEN** `cospec init --harness antigravity` runs in a fresh repo
- **THEN** the `.agents/skills/cospec-*/SKILL.md` bodies spell workflow
  references `/cospec-<id>`, matching its `.agents/workflows/cospec-<id>.md`
  files, and the marker names `antigravity`

#### Scenario: a shared-root conflict is a hard error

- **WHEN** two harnesses that write the same output path are configured with
  different body dialects and rendered without a chosen writer
- **THEN** rendering throws naming both harnesses and the conflicting path,
  instead of emitting the file twice

#### Scenario: shared bodies use the skill spelling

- **WHEN** a rendered `.agents/skills/cospec-*/SKILL.md` body written for
  `codex`, `agents`, `amp` or `zed` is read
- **THEN** its workflow references read
  `$cospec-<skill> (Codex) or /cospec-<skill> (other agents)`, no bare
  `/cospec-<workflow-id>` reference survives, and `cospec doctor` reports no
  `dangling-ref` for them

#### Scenario: agents is detected by its skills dir

- **WHEN** `cospec init` runs with no `--harness` in a repo that has an
  `.agents/` directory holding no skills
- **THEN** the `agents` target is not auto-selected, and a repo whose
  `.agents/skills/cospec-propose/SKILL.md` exists does auto-select it

#### Scenario: a bare .codex directory no longer selects codex

- **WHEN** `cospec init` runs with no `--harness` in a repo whose only
  harness-looking directory is `.codex/` holding a user's `config.toml`
- **THEN** `codex` is not auto-selected

#### Scenario: the writer is chosen in a fixed order

- **WHEN** cospec chooses the writer of the `.agents/skills` root
- **THEN** it takes, in order: the harness the `.cospec-target` marker names
  when it is among the preferred selected harnesses; `codex` when
  `.codex/rules/cospec.rules` or a legacy `.codex/skills/cospec-*/SKILL.md`
  exists; `agents` when the root already holds a cospec skill; `codex`; then the
  first selected harness in the pinned binary's tool order (`amp`,
  `antigravity`, `codex`, `gsd`, `zed`, `agents`) — where the preferred
  harnesses are the selected ones with no slash-command surface when any is
  selected, otherwise all selected ones

#### Scenario: each harness emits its own extra surface

- **WHEN** shared-root harnesses are rendered
- **THEN** `codex`, `agents`, `amp` and `zed` render byte-identical shared
  skills, `contentHash` included, through the shared dialect; `antigravity`
  renders through its flat dialect and `gsd` through its prose dialect when it
  is the chosen writer; `agents`, `amp`, `gsd` and `zed` emit skills only;
  `codex` also emits `.codex/rules/cospec.rules`; `antigravity` also emits
  `.agents/workflows/` whichever harness writes the skills; and no output path
  is written twice in one run

#### Scenario: unknown ids in the shared dialect stay verbatim

- **WHEN** a shared-dialect body references a `/cospec:<id>` cospec does not
  know
- **THEN** the reference is left verbatim so `cospec doctor`'s dangling-ref
  check fires, while known ids are respelled with the skill directory name,
  never the workflow id, and the `canonical` and `flat` dialects are unchanged

#### Scenario: detection paths follow the pinned binary

- **WHEN** harnesses are auto-detected or treated as configured
- **THEN** the fresh-repo default stays `claude`, `codex`'s detection paths are
  `.agents/skills` and `.codex/skills`, a detection path ending in `/skills`
  selects a harness only when it is that root's chosen writer, and
  `cospec update` and `cospec doctor` treat a harness as configured through a
  shared root only when it is the chosen writer or its own non-shared surface (a
  rules file, a command directory) holds cospec files

### Requirement: Frontmatter-less command files are manifest-tracked

A command file whose tool format carries no YAML frontmatter (the Markdown
`# <name>` header layout of Cline and Zoo Code, the bare body of Command Code
and Kilo Code, and TOML) SHALL be written without cospec frontmatter and SHALL
be tracked in `openspec/.cospec-manifest.json`, which decides its drift,
`.cospec-new` sidecar and removal, as for the Codex rules file.

#### Scenario: Cline's workflow carries no frontmatter

- **WHEN** `cospec init --harness cline` runs
- **THEN** each `.clinerules/workflows/cospec-<command>.md` starts with
  `# COSPEC: <title>`, a blank line and the workflow description, contains no
  `---` frontmatter block, and is listed in the manifest

#### Scenario: a hand-edited frontmatter-less command is preserved

- **WHEN** a `.kilo/command/cospec-propose.md` is hand-edited and
  `cospec update` runs
- **THEN** the edit is kept, a `.cospec-new` sidecar holds the regenerated file,
  and `cospec update --check` exits 1
