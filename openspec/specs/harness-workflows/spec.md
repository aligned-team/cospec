# harness-workflows Specification

## Purpose

Keeps cospec's generated agent-harness commands and skills at parity with
OpenSpec 1.5.0's `opsx` workflow set, expressed in cospec's own typed, gated
vocabulary rather than as a copy of opsx prose — so every live opsx workflow
(`new`, `ff`, `verify`, `bulk-archive`, `onboard`, `sync`) has a corresponding
cospec-native command/skill in every rendered harness (claude, codex, opencode),
and no generated body ever calls bare `openspec` or hand-mutates
`openspec/changes/` outside the gated `cospec` CLI path.

## Requirements

### Requirement: opsx 1.5.0 workflow parity

cospec SHALL emit a command (claude, opencode) and a skill (claude, codex,
opencode) for every live opsx 1.5.0 workflow, mapping opsx `sync` to the
existing cospec `sync-specs` workflow rather than renaming it.

#### Scenario: /cospec:verify exists

- **WHEN** `cospec init` runs against a target project
- **THEN** `.claude/commands/cospec/verify.md` and the `cospec-verify-change`
  skill are written to every rendered harness directory

#### Scenario: new/ff/bulk-archive/onboard exist across harnesses

- **WHEN** `cospec init` runs against a target project
- **THEN** commands and skills for `new`, `ff`, `bulk-archive`, and `onboard`
  are present in the claude, codex, and opencode output (commands where the
  harness supports them; skills in all three)

### Requirement: cospec-adapted workflow bodies

Each parity workflow body SHALL express cospec's typed model — not a copy of
opsx prose. `verify` SHALL drive the verification ledger and
`validate --strict`; `ff` SHALL respect the change's typed artifact plan and add
nothing it forbids; `bulk-archive` SHALL loop the gated `cospec archive` per
change and SHALL NOT hand-`mkdir`/`mv` a change; `onboard` SHALL archive via the
real `cospec archive` CLI path.

Workflow bodies render byte-identically into every harness, so they SHALL be
runtime-neutral: no body SHALL name a tool that exists in only one harness
(`AskUserQuestion`, `TodoWrite`), instructing the agent to ask the user or track
progress in runtime-neutral terms instead. Bodies that revisit an artifact SHALL
instruct re-reading it from disk rather than trusting an earlier in-context
copy. `apply` SHALL instruct surfacing added scope and pausing rather than
narrowing or deferring specified behavior, and SHALL only allow a task to be
checked off when the specified behavior is fully implemented. `explore` SHALL
require naming the exact artifacts and files to be written and obtaining an
explicit yes/no in a separate message before the first write — stating that
answering a design question is not consent and that editing schemas, templates,
or `config.yaml` counts as a write — and SHALL read the project's
`openspec/config.yaml` context and rules at session start. `bulk-archive` SHALL
carry an explicit declined branch that stops with nothing archived. `continue`,
`verify`, `sync-specs`, and `archive` SHALL auto-select a repository's sole
active change and announce the selection, while `bulk-archive` SHALL NOT.
`sync-specs` and `archive` SHALL describe the capability-retirement procedure,
including that a retirement is declared by `retire_capabilities` and that a
merged spec must never be left with an empty `## Requirements` section.

#### Scenario: verify body references the ledger and hard gates

- **WHEN** the rendered `cospec-verify-change` skill body is read
- **THEN** it instructs walking the verification ledger, running
  `cospec validate <slug> --strict`, and names the two hard archive gates
  (`archive/verification-incomplete`, `archive/scenario-preservation`) with no
  `--force` escape hatch

#### Scenario: no generated body calls bare openspec or hand-mvs a change

- **WHEN** any rendered workflow body (existing or new) is scanned
- **THEN** it contains no bare `openspec ` invocation and no manual `mv`/`mkdir`
  of an `openspec/changes/` entry — all change lifecycle operations go through
  `cospec` subcommands

#### Scenario: no generated body names a harness-specific tool

- **WHEN** every rendered command and skill body across the claude, codex, and
  opencode outputs is scanned
- **THEN** none contains `AskUserQuestion` or `TodoWrite`

#### Scenario: explore gates the first write on explicit consent

- **WHEN** the rendered `explore` body is read
- **THEN** it requires naming the exact files to be written and obtaining an
  explicit yes/no in a separate message before any write, and states that
  answering a design question is not consent

#### Scenario: bulk-archive has a declined branch

- **WHEN** the rendered `bulk-archive` body is read
- **THEN** it states that a declined confirmation stops the run with nothing
  archived, and it does not auto-select a sole active change

#### Scenario: sole active change is auto-selected and announced

- **WHEN** the rendered `continue`, `verify`, `sync-specs`, and `archive` bodies
  are read
- **THEN** each instructs auto-selecting a repository's only active change and
  announcing the selection to the user

### Requirement: opsx 1.11.0 workflow parity

cospec SHALL extend its generated workflow set to the `opsx` workflow set of the
pinned OpenSpec 1.11.0 release by adding a twelfth workflow, `update`, rendered
as a command (claude, opencode) and a skill (claude, codex, opencode) under
cospec's own naming — `/cospec:update` and the `cospec-update-change` skill. Its
body SHALL revise existing artifacts only: it SHALL edit only artifact output
paths that already exist, SHALL NOT invent an artifact (that remains
`continue`'s job), SHALL NOT edit code, SHALL route every read through
`cospec status --change <slug> --json` and
`cospec instructions <artifact> --change <slug> --json`, and SHALL hand off to
`/cospec:continue` or `/cospec:apply`. The workflow SHALL be registered in the
canon harness manifest and its skill id known to `cospec doctor`, so the
dangling-reference check does not flag it. cospec's schema count SHALL be
unaffected and remain eleven.

#### Scenario: update is rendered in every harness

- **WHEN** `cospec init` runs against a target project
- **THEN** `.claude/commands/cospec/update.md`, the opencode command, and the
  `cospec-update-change` skill in all three harnesses are written, bringing the
  rendered workflow count to twelve

#### Scenario: update revises rather than creates

- **WHEN** the rendered `update` body is read
- **THEN** it instructs editing only existing artifact paths, forbids inventing
  an artifact or editing code, and names `/cospec:continue` and `/cospec:apply`
  as the hand-offs

#### Scenario: doctor knows the new skill

- **WHEN** `cospec doctor` runs against a freshly initialized project
- **THEN** it reports no dangling workflow or skill reference for `update`

#### Scenario: generated output is drift-free

- **WHEN** the managed-file drift gate runs after regeneration
- **THEN** it reports no drift, and the schema count reported by
  `cospec schemas` is still eleven

### Requirement: OpenCode commands carry their arguments

Generated OpenCode command bodies SHALL declare the invocation's arguments
through OpenCode's `$ARGUMENTS` placeholder whenever the workflow takes
positional input, so an invocation like `/cospec-new feat add-widget` reaches
the agent with its argument text intact instead of silently dropping it.
Injection SHALL be a no-op when a body already references `$ARGUMENTS` or a
positional placeholder, SHALL preserve the body's existing line endings, and
SHALL apply only to workflows whose bodies actually take positional input.
Claude and Codex output SHALL be unchanged.

#### Scenario: An argument-taking OpenCode command declares $ARGUMENTS

- **WHEN** the generated `.opencode/commands/cospec-new.md` is read
- **THEN** it contains an `$ARGUMENTS` reference at its input-contract point

#### Scenario: Injection is idempotent

- **WHEN** a canon body already references `$ARGUMENTS`
- **THEN** the rendered OpenCode command contains exactly one such reference and
  is otherwise unchanged

#### Scenario: Other harnesses are untouched

- **WHEN** the claude and codex outputs are compared before and after the
  injection change
- **THEN** they are unchanged
