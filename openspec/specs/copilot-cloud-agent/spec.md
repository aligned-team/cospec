# copilot-cloud-agent Specification

## Purpose

Governs how `cospec init`, `cospec update` and `cospec doctor` handle the opt-in
GitHub Copilot cloud coding-agent files for the `github-copilot` harness: the
five-tier decision on whether to write them, the persisted
`githubCopilot.cloudAgent` key in `openspec/config.yaml`, the two cospec-managed
cloud files that name `cospec` rather than `openspec`, the rule that removal and
overwrite only ever touch files cospec wrote and the user has not edited, and
the `init --json` `copilotCloud` report.

## Requirements

### Requirement: The cloud-file decision follows five tiers in upstream's order

When `cospec init` selects `github-copilot`, writing the two cloud files SHALL
be decided by the first tier that applies: (1) `--copilot-cloud` or
`--no-copilot-cloud`, the last one given winning; (2) a boolean
`githubCopilot.cloudAgent` in `openspec/config.yaml`, a non-boolean counting as
undecided; (3) a cospec-managed cloud file on disk, which enables them; (4) an
interactive confirm defaulting to No; (5) otherwise skip, persisting nothing.

#### Scenario: A flag beats a persisted opt-out

- **WHEN** `openspec/config.yaml` holds `githubCopilot: { cloudAgent: false }`
  and `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** both cloud files are written and the config now holds
  `cloudAgent: true`

#### Scenario: The last flag wins

- **WHEN**
  `cospec init --harness github-copilot --copilot-cloud --no-copilot-cloud` runs
  in a fresh repo
- **THEN** no cloud file is written and the config holds `cloudAgent: false`
- **AND**
  `cospec init --harness github-copilot --no-copilot-cloud --copilot-cloud`
  writes both files and persists `cloudAgent: true`

#### Scenario: A persisted opt-in applies with no flag

- **WHEN** the config holds `cloudAgent: true` and
  `cospec init --harness github-copilot` runs
- **THEN** both cloud files are written and the config is not rewritten

#### Scenario: A persisted opt-out beats managed files on disk

- **WHEN** both cospec-managed cloud files exist, the config holds
  `cloudAgent: false`, and `cospec init --harness github-copilot` runs
- **THEN** both files are removed

#### Scenario: Managed files already on disk enable the cloud files without persisting

- **WHEN** a managed cloud file exists, the config has no `githubCopilot` key,
  and `cospec init --harness github-copilot` runs
- **THEN** both cloud files are written or refreshed and the config still has no
  `githubCopilot` key

#### Scenario: Nothing decided and no terminal skips

- **WHEN** `cospec init --harness github-copilot` runs in a fresh repo with no
  flag, no config key and no cloud file
- **THEN** no cloud file is written, the config has no `githubCopilot` key, and
  the receipt says
  `Skipped GitHub Copilot cloud files (opt-in). Enable with 'cospec init --copilot-cloud'.`

#### Scenario: A malformed persisted value counts as undecided

- **WHEN** the config holds `githubCopilot: { cloudAgent: x }` and
  `cospec init --harness github-copilot` runs
- **THEN** no cloud file is written and the config value is left as it was

#### Scenario: The confirm defaults to No and persists its answer

- **WHEN** `cospec init` runs with no `--harness`, no flag, no config key and no
  managed file, in an interactive terminal, in a repo where `github-copilot` is
  detected, and the answer is empty
- **THEN** the prompt text is upstream's, no cloud file is written, and the
  config holds `cloudAgent: false`
- **AND** an answer of `y` writes both files and persists `cloudAgent: true`
- **AND** input that ends before an answer (Ctrl-D) is no answer: tier 5
  applies, nothing is written, removed or saved, and the Skipped line prints

#### Scenario: An explicit harness list never prompts

- **WHEN** `cospec init --harness github-copilot` runs in an interactive
  terminal with nothing decided
- **THEN** no prompt is shown and tier 5 applies

#### Scenario: The confirm is reached only on an interactive, unlisted run

- **WHEN** no tier 1 to 3 decides and either a `--harness`/`--tools` list or
  `--json` was given, `OPEN_SPEC_INTERACTIVE` is `0`, a `CI` variable is set, or
  stdin is not a terminal
- **THEN** no confirm is shown and tier 5 applies; otherwise tier 4 prompts

### Requirement: A flag passed without the tool is reported, not applied

When `--copilot-cloud` or `--no-copilot-cloud` is passed and `github-copilot` is
not among the selected harnesses, `cospec init` SHALL print
`--copilot-cloud/--no-copilot-cloud was ignored because the github-copilot tool was not selected.`,
SHALL write no cloud file, SHALL NOT persist anything, and SHALL carry on and
exit as it would without the flag. Under `--json` the sentence SHALL go to
stderr and the document SHALL carry `copilotCloud.ignoredFlag: true`, so stdout
stays one document.

#### Scenario: The flag with another tool

- **WHEN** `cospec init --harness claude --copilot-cloud` runs
- **THEN** stdout contains the sentence above, exit is 0, and neither `.github/`
  nor `githubCopilot` exists afterwards

#### Scenario: The flag under --json

- **WHEN** `cospec init --harness claude --no-copilot-cloud --json` runs
- **THEN** stdout is one JSON document with `copilotCloud.ignoredFlag` true and
  stderr holds the sentence

### Requirement: Only a decision made this run is persisted

`cospec init` SHALL write `githubCopilot.cloudAgent` to `openspec/config.yaml`
only for a tier 1 or tier 4 decision, as that decision, never for tiers 2, 3
or 5. The write SHALL go through the YAML document model, keeping comments, key
order and formatting, and SHALL replace a non-mapping `githubCopilot` with a
mapping. A config that is not a YAML mapping document SHALL be left untouched
with a stderr warning that the decision was not persisted.

#### Scenario: Comments and order survive

- **WHEN** the config is `# my header`, `schema: feat`, `# keep me`, a
  `context:` block, and `cospec init --harness github-copilot --copilot-cloud`
  runs
- **THEN** every original line is still present in its original order and the
  file ends with `githubCopilot:` and `  cloudAgent: true`

#### Scenario: A stray scalar is replaced

- **WHEN** the config holds `githubCopilot: false` and
  `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** the config holds `githubCopilot:` with `cloudAgent: true`

#### Scenario: An unparseable config is not rewritten

- **WHEN** the config does not parse as YAML and the flag is passed
- **THEN** the config bytes are unchanged and stderr says the opt-in was not
  persisted

#### Scenario: A read-only config warns without failing init

- **WHEN** writing the decision fails with `EACCES`, `EPERM` or `EROFS`
- **THEN** stderr warns naming the code and path and `cospec init` does not
  fail; any other write error propagates

### Requirement: Cloud files are two managed files that name cospec

When enabled, cospec SHALL write `.github/workflows/copilot-setup-steps.yml` and
`.github/agents/cospec.agent.md` from cospec's canon, both carrying a visible
`Generated by cospec for GitHub Copilot coding agent support.` marker. The
workflow SHALL keep job name `copilot-setup-steps`, run
`npm install -g @aligned-team/cospec` and `cospec --version`, and be tracked in
the manifest. The agent file SHALL be a custom agent `cospec` whose body names
only `cospec` commands, never bare `openspec`.

#### Scenario: The workflow installs cospec

- **WHEN** `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** `.github/workflows/copilot-setup-steps.yml` contains a job named
  `copilot-setup-steps`, `npm install -g @aligned-team/cospec` and
  `cospec --version`, and does not contain `@fission-ai/openspec`

#### Scenario: The agent file is a cospec agent

- **WHEN** the same command runs
- **THEN** `.github/agents/cospec.agent.md` has frontmatter `name: cospec` and
  `metadata.author: cospec`, and no line of its body runs bare `openspec`

#### Scenario: A second run changes nothing

- **WHEN** the same command runs twice
- **THEN** the second run reports both files `unchanged` in `--json` and the
  working tree is byte-identical

#### Scenario: Provenance lives only in the agent file

- **WHEN** the cloud files are written
- **THEN** the agent file's frontmatter carries cospec's `metadata` provenance
  block (`author`, `generatedBy`, `contentHash`), the workflow text carries no
  `generatedBy` version, and a cospec version bump alone rewrites only the agent
  file

### Requirement: Removal only ever touches files cospec wrote and you left alone

An opt-out SHALL delete a cloud file only when cospec wrote it unedited: the
workflow when the manifest has its path and its hash still matches, the agent
file when its frontmatter says `metadata.author: cospec` and its `contentHash`
matches its body. An edited file SHALL be left and reported as left in place. A
file with no cospec provenance, such as OpenSpec's own `openspec.agent.md` or
`copilot-setup-steps.yml`, SHALL never be removed or overwritten.

#### Scenario: Opt-in, opt-out, opt-in

- **WHEN** `cospec init --harness github-copilot` runs with `--copilot-cloud`,
  then with `--no-copilot-cloud`, then with `--copilot-cloud`
- **THEN** after the first both files exist, after the second neither exists and
  the config holds `cloudAgent: false`, and after the third both exist again and
  the config holds `cloudAgent: true`

#### Scenario: An edited cloud file survives opt-out

- **WHEN** both files were written, a line is appended to the agent file, and
  `cospec init --harness github-copilot --no-copilot-cloud` runs
- **THEN** the workflow is removed, the edited agent file is still on disk with
  the appended line, and the receipt says it was left in place

#### Scenario: A foreign workflow is never removed or overwritten

- **WHEN** `.github/workflows/copilot-setup-steps.yml` holds `name: mine` and
  `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** the file still holds `name: mine`,
  `copilot-setup-steps.yml.cospec-new` holds cospec's version, and the receipt
  says
  `Left your existing .github/workflows/copilot-setup-steps.yml untouched — add the cospec install step by hand so the Copilot cloud agent can run cospec.`
- **AND** a later `--no-copilot-cloud` run leaves `name: mine` in place

#### Scenario: OpenSpec's agent file is not cospec's

- **WHEN** OpenSpec's `.github/agents/openspec.agent.md` exists and the cloud
  files are enabled then disabled
- **THEN** that file is never read as managed and is still on disk afterwards

#### Scenario: A write over a foreign or edited file lands beside it

- **WHEN** cospec would write a cloud file over one it did not write, or wrote
  and you edited
- **THEN** the new version is written as `<path>.cospec-new` and the original is
  reported as preserved

### Requirement: An alternate agent profile is respected

When `.github/agents/cospec.md` exists, cospec SHALL NOT write
`.github/agents/cospec.agent.md`, SHALL remove a managed one, and SHALL fail the
Copilot target with
`Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md`
on an unmanaged one. A parent path that is not a directory, or a managed path
that is not a regular file, SHALL fail the same way with upstream's sentences.

#### Scenario: The alternate profile suppresses the agent file

- **WHEN** `.github/agents/cospec.md` exists and
  `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** the workflow is written and `.github/agents/cospec.agent.md` is not

#### Scenario: Two unmanaged profiles conflict

- **WHEN** `.github/agents/cospec.md` and an unmanaged
  `.github/agents/cospec.agent.md` both exist and the same command runs
- **THEN** init prints the conflict in its `Failed:` block, exits 1, and has
  already written the skills and prompts

#### Scenario: A Copilot target failure is reported per command

- **WHEN** the Copilot target fails during `init` or `update`
- **THEN** `init` writes every other file, reports the failure in a `Failed:`
  block and exits 1, while `update` prints
  `Warning: failed to sync Copilot cloud agent files: <message>` and keeps its
  exit code

### Requirement: update re-syncs, removes and hints

When `github-copilot` is a detected harness, `cospec update` SHALL write or
refresh the cloud files when enabled (tier 2, else tier 3), remove the managed
ones with `Removed: <n> Copilot cloud agent file(s) (opted out of cloud files)`
when `cloudAgent` is `false`, and, only on an interactive undecided run, print
`GitHub Copilot cloud coding-agent files are available (opt-in). Enable with 'cospec init --copilot-cloud'.`
`update` SHALL never prompt or write `githubCopilot.cloudAgent`.

#### Scenario: A hand-damaged managed file is refreshed on update

- **WHEN** the config holds `cloudAgent: true`, the managed workflow was
  deleted, and `cospec update` runs
- **THEN** the workflow is written again and `update --json` lists it as
  `created`

#### Scenario: Opt-out is honoured by update

- **WHEN** the config holds `cloudAgent: false` and managed cloud files exist,
  and `cospec update` runs
- **THEN** both files are removed and the line above is printed

#### Scenario: Dropping the tool removes the files

- **WHEN** the cloud files are managed and `.github/skills/cospec-*` is deleted
  so that `github-copilot` is no longer detected, and `cospec update` runs
- **THEN** both cloud files are removed

#### Scenario: check mode writes nothing

- **WHEN** `cospec update --check` runs with `cloudAgent: true` and the agent
  file missing
- **THEN** it exits 1 listing the agent file as `created` and writes no file

#### Scenario: An undetected harness removes the managed files

- **WHEN** `cospec update` runs and `github-copilot` is not a detected harness
- **THEN** it removes the managed cloud files and prints
  `Removed: <n> Copilot cloud agent file(s) (github-copilot not configured)`

#### Scenario: check and doctor count cloud-file drift

- **WHEN** `cospec update --check` or `cospec doctor` runs
- **THEN** it computes the same cloud-file outcomes without writing and counts a
  would-be create, update or removal as drift

### Requirement: The init --json document reports the cloud decision

`cospec init --json` SHALL carry an additive `copilotCloud` object: `tier`
(`flag`, `config`, `existing-files`, `prompt`, `undecided` or `not-selected`),
`enabled` (boolean), `persisted` (boolean or null), `ignoredFlag` (boolean), and
`present`, `collisions`, `removed` and `leftInPlace` (arrays of repo-relative
paths). No existing key SHALL change.

#### Scenario: Skipped and decided runs

- **WHEN** `cospec init --harness github-copilot --json` runs with nothing
  decided, and then again with `--copilot-cloud`
- **THEN** the first document has `tier` `undecided` and `enabled` false, and
  the second has `tier` `flag`, `enabled` true, `persisted` true and both paths
  in `present`
