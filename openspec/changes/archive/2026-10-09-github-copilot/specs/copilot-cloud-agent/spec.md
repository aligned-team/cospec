# copilot-cloud-agent Specification

## ADDED Requirements

### Requirement: The cloud-file decision follows five tiers in upstream's order

When a run of `cospec init` selects `github-copilot`, whether to write the two
cloud files SHALL be decided by the first of these that applies, in this order:
(1) `--copilot-cloud` or `--no-copilot-cloud` on the command line; (2) a boolean
`githubCopilot.cloudAgent` in `openspec/config.yaml`; (3) a cospec-managed cloud
file already on disk, which enables the cloud files; (4) an interactive confirm
whose default answer is No; (5) otherwise skip, persisting nothing. When both
flags are present the one that comes last in the argument list SHALL win. A
`githubCopilot.cloudAgent` that is not a boolean SHALL count as undecided. Tier
4 SHALL be reached only when no `--harness`/`--tools` list was given, `--json`
was not given, and the run is interactive: `OPEN_SPEC_INTERACTIVE` is not `0`,
no `CI` variable is set, and stdin is a terminal. Every other undecided run
SHALL take tier 5.

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
only when the decision came from a flag (tier 1) or an answered confirm (tier
4), and the value SHALL be that decision. It SHALL NOT write it for tiers 2, 3
or 5. The write SHALL go through the YAML document model so that existing
comments, key order and formatting survive; a `githubCopilot` value that is not
a mapping SHALL be replaced by one; a config that does not parse as a YAML
mapping document SHALL be left byte-for-byte untouched with a warning on stderr
that the decision was not persisted. A write that fails with `EACCES`, `EPERM`
or `EROFS` SHALL warn on stderr naming the code and path and SHALL NOT fail the
init; any other error SHALL propagate.

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

### Requirement: Cloud files are two managed files that name cospec

When enabled, cospec SHALL write `.github/workflows/copilot-setup-steps.yml` and
`.github/agents/cospec.agent.md`, composed from files in cospec's canon. The
workflow SHALL keep GitHub's required job name `copilot-setup-steps`, SHALL
install `@aligned-team/cospec` with `npm install -g`, and SHALL run
`cospec --version`. The agent file SHALL be a custom agent named `cospec` whose
body names only `cospec` commands, never bare `openspec`. Both SHALL carry a
visible `Generated by cospec for GitHub Copilot coding agent support.` marker.
The agent file SHALL carry cospec's `metadata` provenance block (`author`,
`generatedBy`, `contentHash`) in its frontmatter; the workflow SHALL be tracked
by the managed-file manifest. Neither file SHALL carry the `generatedBy` version
inside the workflow text, so a version bump alone rewrites only the agent file.

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

### Requirement: Removal only ever touches files cospec wrote and you left alone

Removing the cloud files on an opt-out SHALL delete a file only when cospec
wrote it and it is unedited: the workflow when the manifest has its path and its
hash still matches, the agent file when its frontmatter says
`metadata.author: cospec` and its `contentHash` still matches its body. A file
that was edited SHALL be left in place and reported as left in place. A file
with no cospec provenance, including OpenSpec's own `openspec.agent.md` and a
`copilot-setup-steps.yml` OpenSpec wrote, SHALL never be removed or overwritten.
Writing over a file cospec did not write, or wrote and you edited, SHALL write
the new version beside it as `<path>.cospec-new` and report the original as
preserved.

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

### Requirement: An alternate agent profile is respected

When `.github/agents/cospec.md` exists, cospec SHALL NOT write
`.github/agents/cospec.agent.md`; when `.github/agents/cospec.agent.md` is also
present and is a managed file it SHALL be removed, and when it is present and
not managed cospec SHALL fail the Copilot target with
`Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md`.
`init` SHALL report that failure in a `Failed:` block and exit 1 after writing
every other file; `update` SHALL print it as
`Warning: failed to sync Copilot cloud agent files: <message>` and keep its exit
code. A parent path that is not a directory, or a managed path that is not a
regular file, SHALL fail the same way with upstream's sentences.

#### Scenario: The alternate profile suppresses the agent file

- **WHEN** `.github/agents/cospec.md` exists and
  `cospec init --harness github-copilot --copilot-cloud` runs
- **THEN** the workflow is written and `.github/agents/cospec.agent.md` is not

#### Scenario: Two unmanaged profiles conflict

- **WHEN** `.github/agents/cospec.md` and an unmanaged
  `.github/agents/cospec.agent.md` both exist and the same command runs
- **THEN** init prints the conflict in its `Failed:` block, exits 1, and has
  already written the skills and prompts

### Requirement: update re-syncs, removes and hints

`cospec update` SHALL, on every run in which `github-copilot` is a detected
harness: write or refresh the cloud files when enabled (tier 2, else tier 3 of
the decision above); remove the managed ones and print
`Removed: <n> Copilot cloud agent file(s) (opted out of cloud files)` when
`githubCopilot.cloudAgent` is `false`; and when undecided print
`GitHub Copilot cloud coding-agent files are available (opt-in). Enable with 'cospec init --copilot-cloud'.`
only on an interactive run. When `github-copilot` is not a detected harness,
`update` SHALL remove the managed cloud files and print
`Removed: <n> Copilot cloud agent file(s) (github-copilot not configured)`.
`update --check` and `cospec doctor` SHALL compute the same outcomes without
writing and SHALL count a would-be create, update or removal as drift. `update`
SHALL never prompt and SHALL never write `githubCopilot.cloudAgent`.

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
