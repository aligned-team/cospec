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
