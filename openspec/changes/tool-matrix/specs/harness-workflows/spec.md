# Spec Delta

## MODIFIED Requirements

### Requirement: Shared .agents/skills harness root

cospec SHALL render skills for every harness whose skills root is `.agents`
(`codex`, `agents`, `antigravity`, `zed`) into the vendor-neutral
`.agents/skills/cospec-<skill>/SKILL.md` root, and SHALL write that root from
exactly one selected harness per run, chosen in this order: the harness named by
the ownership marker `.agents/skills/.cospec-target` when it is among the
preferred selected harnesses; then cospec's pre-marker evidence (the codex rules
file `.codex/rules/cospec.rules`, or a legacy `.codex/skills/cospec-*/SKILL.md`,
means `codex`); then `agents` when the root already holds a cospec skill; then
`codex`; then the first selected harness in table order. The preferred harnesses
are the selected ones with no slash-command surface when any is selected,
otherwise all selected ones. cospec SHALL write the marker, containing the
chosen harness id and a newline, whenever it writes that root, and SHALL track
it in the manifest. cospec SHALL NOT write or read an
`.agents/skills/.openspec-target` ownership marker.

`codex`, `agents` and `zed` SHALL render byte-identical shared skill files,
including the stamped `contentHash`, through the single shared body dialect;
`antigravity` SHALL render its skills through its flat dialect when it is the
chosen writer. `agents` and `zed` SHALL emit skills only; `codex` SHALL
additionally emit `.codex/rules/cospec.rules`; `antigravity` SHALL additionally
emit its workflows under `.agents/workflows/` whichever harness writes the
skills. No output path SHALL be written twice in one run, and two harnesses
mapping one output path to differing content SHALL be a hard render error when
the files are rendered without a chosen writer.

In the shared dialect an in-body `/cospec:<id>` reference SHALL be respelled to
`$cospec-<skill> (Codex) or /cospec-<skill> (other agents)` using the skill
directory name, never the workflow id, because no command file resolves under
that root; an id cospec does not know SHALL be left verbatim so
`cospec doctor`'s dangling-reference check still fires on a genuinely bad
reference, and that check SHALL accept both the workflow-id and the skill-name
spelling. The `canonical` and `flat` dialects SHALL be unchanged.

Auto-detection SHALL key the `agents` target on `.agents/skills`, not on a bare
`.agents/` directory, and the fresh-repo default SHALL remain `claude`. The
`codex` target's detection paths SHALL be `.agents/skills` and `.codex/skills`,
as the pinned binary's; a detection path ending in `/skills` SHALL select a
harness only when that harness is the chosen writer of the root, as the binary's
tool detection reconciles it. `cospec update` and `cospec doctor` SHALL treat a
harness as configured through a shared root only when it is that root's chosen
writer, or when its own non-shared surface (a rules file, a command directory)
holds cospec files.

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
  `codex`, `agents` or `zed` is read
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

## ADDED Requirements

### Requirement: Every pinned tool id is a harness

`cospec init --harness` and its `--tools` spelling SHALL accept every tool id
the pinned OpenSpec binary's `AI_TOOLS` declares, except `github-copilot`, and
SHALL resolve `windsurf` to `devin` as the binary's `TOOL_ID_ALIASES` does;
`all` SHALL select every harness. For each harness cospec SHALL write cospec's
own canon workflow bodies, never an upstream `/opsx:*` template, at the paths
the pinned binary's `init --tools <id>` writes, with `openspec-<skill>` skill
directories spelled `cospec-<skill>` and `opsx-<id>`/`opsx/<id>` command files
spelled `cospec-<command>`/`cospec/<command>`, in the same directory, with the
same extension and the same wrapper (YAML frontmatter with upstream's keys plus
cospec's `metadata` provenance, a Markdown `# <name>` header, a bare body, or
TOML). The receipt SHALL print, after each selected harness's setup note, the
binary's single IDE-restart line when a selected harness requires a restart; a
harness whose upstream entry carries a setup note SHALL print a note that
includes that text verbatim. An unknown value SHALL be refused naming the valid
values and followed by the line
`Tool not listed? Use <flag> agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`,
with `<flag>` the flag the user typed; the `agents` target's search aliases
SHALL NOT be accepted as values, as the binary does not accept them.

#### Scenario: a new tool's files land where upstream writes them

- **WHEN** `cospec init --tools cursor` runs in a fresh repo
- **THEN** twelve `.cursor/skills/cospec-*/SKILL.md` and twelve
  `.cursor/commands/cospec-<command>.md` files are written, each command's
  frontmatter carrying `name: /cospec-<command>`, `id: cospec-<command>`,
  `category`, `description` and cospec's `metadata`, and the receipt ends with
  `Restart your IDE to refresh commands.` before the hint lines

#### Scenario: the windsurf alias writes Devin's files

- **WHEN** `cospec init --tools windsurf` runs in a fresh repo
- **THEN** the files written are exactly those `cospec init --tools devin`
  writes, and the receipt's `Harness:` line names `devin`

#### Scenario: Hermes prints upstream's setup note

- **WHEN** `cospec init --harness hermes` runs
- **THEN** the receipt contains the pinned binary's Hermes setup note verbatim

#### Scenario: an alias word is refused with the fallback hint

- **WHEN** `cospec init --tools universal` runs
- **THEN** it exits 1 naming `universal` as invalid, the next line reads
  `Tool not listed? Use --tools agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`,
  and nothing is written

### Requirement: Workflow references follow each tool's invocation

A harness's skill bodies and command bodies SHALL spell an in-body
`/cospec:<id>` reference the way that tool invokes it, as the pinned binary's
skill and command reference transforms do: `/cospec:<id>` for a namespaced
command surface, `<prefix>cospec-<id>` for a flat one (`@` for Amazon Q),
`/cospec-<skill>` for a skills-only tool and for Devin's skills,
`/skill:cospec-<skill>` for Kimi Code, `the cospec-<skill> skill` for Rovo Dev,
and the shared dialect on the shared `.agents` root. The receipt's hint lines
SHALL use the first selected harness's skill spelling; for a harness whose
skills are referenced in prose the hint SHALL read
`Try: ask <tool name> to use the cospec-propose skill with "feat: <what you want to build>"`.
`cospec doctor`'s dangling-reference check SHALL recognise every one of these
spellings.

#### Scenario: Devin's skills and workflows spell differently

- **WHEN** the harness files are rendered for `['devin']`
- **THEN** its `.devin/skills/cospec-*/SKILL.md` bodies reference
  `/cospec-<skill>` and its `.devin/workflows/cospec-<command>.md` bodies
  reference `/cospec-<id>`

#### Scenario: Kimi's skills use its skill prefix

- **WHEN** the harness files are rendered for `['kimi']`
- **THEN** every workflow reference in its skill bodies reads
  `/skill:cospec-<skill>`, and `cospec doctor` reports no `dangling-ref` for
  them

#### Scenario: Rovo Dev's receipt hint is prose

- **WHEN** `cospec init --harness rovodev` runs
- **THEN** the receipt ends with
  `Try: ask Rovo Dev CLI to use the cospec-propose skill with "feat: <what you want to build>"`

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

- **WHEN** a `.kilocode/workflows/cospec-propose.md` is hand-edited and
  `cospec update` runs
- **THEN** the edit is kept, a `.cospec-new` sidecar holds the regenerated file,
  and `cospec update --check` exits 1

### Requirement: Command arguments reach tools that need a placeholder

A command body for a tool whose commands receive their arguments only through an
explicit placeholder SHALL carry `**Provided arguments**: <placeholder>` as its
own paragraph before the body's first `## ` section, when the workflow takes
arguments and the body names no placeholder yet: `$ARGUMENTS` for OpenCode and
Command Code, `$@` for Pi and Oh My Pi. Skill bodies SHALL never carry it.

#### Scenario: Pi's command carries $@

- **WHEN** the harness files are rendered for `['pi']`
- **THEN** `.pi/prompts/cospec-propose.md` contains `**Provided arguments**: $@`
  and `.pi/skills/cospec-propose/SKILL.md` does not

### Requirement: A home-directory skills root is a managed root

For a harness whose skills root is home-relative (`minimax-code`), cospec SHALL
resolve the home directory as `USERPROFILE`, else `HOME`, else the OS home
directory, SHALL write its skills under `<home>/.minimax/skills/`, SHALL detect
the harness from a cospec- or OpenSpec-authored skill there, and SHALL remove an
orphaned skill there only when its frontmatter proves cospec wrote it.
`--check`, `--dry-run` and `cospec doctor` SHALL read that root and never write
it.

#### Scenario: MiniMax writes under HOME

- **WHEN** `cospec init --harness minimax-code` runs with `HOME` set to a temp
  directory and `USERPROFILE` unset
- **THEN** twelve `cospec-*/SKILL.md` files exist under
  `<HOME>/.minimax/skills/` and none under the project

#### Scenario: USERPROFILE wins over HOME

- **WHEN** the same run has `USERPROFILE` and `HOME` set to different temp
  directories
- **THEN** the skills are written under `<USERPROFILE>/.minimax/skills/` only

### Requirement: Legacy tool roots move OpenSpec-managed content

cospec SHALL port the pinned binary's legacy tool-root moves for a selected
harness: `.kimi` to `.kimi-code` and `.agent` to `.agents` without consent,
`.codex` to `.agents` after generation, and `.windsurf` to `.devin` with
consent. Only OpenSpec-managed skill files (`openspec-<skill>/SKILL.md`) and
command files (`opsx-*` at the tool's command path under the legacy root) SHALL
move; an identical destination SHALL drop the legacy copy, a differing one SHALL
keep both and be reported, and a directory SHALL be removed only when empty.
`cospec init` SHALL treat selecting the tool as consent. `cospec update` SHALL
ask before moving `.windsurf` only when stdin and stdout are terminals and
neither `--json` nor `--force` is passed, and SHALL move without asking
otherwise. Every move SHALL be reported in the receipt and the `--json`
`migration` array.

#### Scenario: init moves Kimi's legacy skills

- **WHEN** `.kimi/skills/openspec-propose/SKILL.md` was written by OpenSpec and
  `cospec init --harness kimi` runs
- **THEN** it is now at `.kimi-code/skills/openspec-propose/SKILL.md`, `.kimi/`
  is removed if empty, and the receipt reports the move

#### Scenario: a user file under the legacy root stays

- **WHEN** `.windsurf/workflows/` also holds a workflow the user wrote and
  `cospec init --harness devin` runs
- **THEN** the user's workflow stays in `.windsurf/workflows/` and only the
  OpenSpec-managed files move

#### Scenario: a non-interactive update migrates Windsurf

- **WHEN** `cospec update --json` runs in a repo where `devin` is detected and
  `.windsurf/` holds OpenSpec-managed workflows
- **THEN** they are moved to `.devin/workflows/` without a question and listed
  in the document's `migration` array

### Requirement: A write failure is isolated to its file

When `cospec init` or `cospec update` cannot write, sidecar or remove one
generated file because of a permission or path-type error, it SHALL record that
file as `{ path, error }`, SHALL still write every other file of every selected
harness, SHALL list the failures in the receipt and in a `failed` array of the
`--json` document, SHALL leave the failed file out of the manifest, and SHALL
exit 1. Any other error SHALL propagate.

#### Scenario: a locked harness directory fails alone

- **WHEN** `.cursor/` is mode 000 and `cospec init --harness claude,cursor` runs
- **THEN** every `.claude/` file is written, `failed` names the `.cursor/`
  paths, the receipt lists them under `Failed:`, and the exit code is 1

#### Scenario: the next run retries

- **WHEN** the directory is made writable again and `cospec update` runs
- **THEN** the previously failed files are written and the exit code is 0
