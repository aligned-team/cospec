# harness-workflows Specification

## ADDED Requirements

### Requirement: GitHub Copilot is a harness target

`--harness github-copilot` SHALL select a target that writes cospec's twelve
skills to `.github/skills/cospec-<skill>/SKILL.md` and its twelve commands to
`.github/prompts/cospec-<command>.prompt.md`. A command file SHALL carry
`description` and cospec's `metadata` provenance block in its frontmatter and
the workflow body in the flat dialect, so references read `/cospec-<id>`. The
target SHALL be auto-detected by any of `.github/copilot-instructions.md`,
`.github/instructions`, `.github/workflows/copilot-setup-steps.yml`,
`.github/prompts`, `.github/agents`, `.github/skills` and `.github/.mcp.json`;
SHALL set `requiresIdeRestart`, so that a receipt naming it ends with
`Restart your IDE to refresh commands.`; and SHALL sit in the harness table
between `gemini` and `hermes`. `cospec update` SHALL detect it by the sentinel
`cospec-propose` skill under `.github/skills`. An OpenSpec-written
`.github/prompts/openspec-*.prompt.md` or `.github/prompts/opsx-*.prompt.md`
with upstream's provenance SHALL be reported as a leftover and removed by
`--remove-opsx`; a user's own prompt file SHALL NOT.

#### Scenario: Skills and prompts are written under .github

- **WHEN** `cospec init --harness github-copilot` runs in a fresh repo
- **THEN** `.github/skills/cospec-propose/SKILL.md` and
  `.github/prompts/cospec-propose.prompt.md` exist, the prompt body spells
  workflow references `/cospec-<id>`, and neither file calls bare `openspec`

#### Scenario: The receipt asks for an IDE restart

- **WHEN** the same command runs
- **THEN** the receipt's `Harness:` line names `github-copilot` and the receipt
  contains `Restart your IDE to refresh commands.`

#### Scenario: Detection by an existing Copilot path

- **WHEN** `cospec init` runs with no `--harness` in a repo that has
  `.github/prompts/` and none of the other harness directories
- **THEN** the harness selected is `github-copilot`

#### Scenario: update finds the target by its skills

- **WHEN** `cospec update` runs in a repo whose only cospec files are under
  `.github/skills` and `.github/prompts`
- **THEN** it regenerates those files and `--json` lists `github-copilot` in
  `harnesses`

#### Scenario: OpenSpec's Copilot prompt leftovers are found

- **WHEN** a file `.github/prompts/opsx-propose.prompt.md` that OpenSpec wrote
  and a user's `.github/prompts/release.prompt.md` exist and
  `cospec init --harness github-copilot --remove-opsx` runs
- **THEN** only the OpenSpec file is removed

## MODIFIED Requirements

### Requirement: Every pinned tool id is a harness

`cospec init --harness` and its `--tools` spelling SHALL accept every tool id
the pinned OpenSpec binary's `AI_TOOLS` declares, and SHALL resolve `windsurf`
to `devin` as the binary's `TOOL_ID_ALIASES` does; `all` SHALL select every
harness. For each harness cospec SHALL write cospec's own canon workflow bodies,
never an upstream `/opsx:*` template, at the paths the pinned binary's
`init --tools <id>` writes, with `openspec-<skill>` skill directories spelled
`cospec-<skill>` and `opsx-<id>`/`opsx/<id>` command files spelled
`cospec-<command>`/`cospec/<command>`, in the same directory, with the same
extension and the same wrapper (YAML frontmatter with upstream's keys plus
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
