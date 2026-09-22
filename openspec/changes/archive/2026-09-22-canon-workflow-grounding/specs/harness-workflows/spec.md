## MODIFIED Requirements

### Requirement: cospec-adapted workflow bodies

Each parity workflow body SHALL express cospec's typed model — not a copy of
opsx prose. `verify` SHALL drive the verification ledger and
`validate --strict`; `ff` SHALL respect the change's typed artifact plan and add
nothing it forbids; `bulk-archive` SHALL loop the gated `cospec archive` per
change and SHALL NOT hand-`mkdir`/`mv` a change; `onboard` SHALL archive via the
real `cospec archive` CLI path.

Workflow bodies render from one canonical source into every harness, differing
only in the dialect-driven spelling of their `/cospec:<id>` references, so they
SHALL be runtime-neutral: no body SHALL name a tool that exists in only one
harness (`AskUserQuestion`, `TodoWrite`), instructing the agent to ask the user
or track progress in runtime-neutral terms instead. Bodies that revisit an
artifact SHALL instruct re-reading it from disk rather than trusting an earlier
in-context copy. `apply` SHALL instruct surfacing added scope and pausing rather
than narrowing or deferring specified behavior, and SHALL only allow a task to
be checked off when the specified behavior is fully implemented. `explore` SHALL
require naming the exact artifacts and files to be written and obtaining an
explicit yes/no in a separate message before the first write — stating that
answering a design question is not consent and that editing schemas, templates,
or `config.yaml` counts as a write. `bulk-archive` SHALL carry an explicit
declined branch that stops with nothing archived. `continue`, `verify`,
`sync-specs`, and `archive` SHALL auto-select a repository's sole active change
and announce the selection, while `bulk-archive` SHALL NOT. `sync-specs` and
`archive` SHALL describe the capability-retirement procedure, including that a
retirement is declared by `retire_capabilities` and that a merged spec must
never be left with an empty `## Requirements` section.

Every project fact a body grounds itself on SHALL be obtained through a `cospec`
command rather than by reading a store file directly: `explore` and `propose`
SHALL read the project's `context` and `rules` through `cospec context --json`
and SHALL NOT instruct reading `openspec/config.yaml` (or `config.yml`) by hand,
SHALL treat the result as a constraint on their own reasoning rather than
authority to act or material to reproduce, and SHALL report a root-resolution
failure rather than proceeding without project context.

A body that edits artifacts under user confirmation SHALL stage the edit before
writing it: `update` SHALL draft the requested revision in the conversation
rather than in files, check every other existing artifact against the drafted
edit, propose no revisions when the change is already coherent, and SHALL name
exactly one step as the step that performs every artifact write in the workflow,
with no earlier step editing an artifact.

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

- **WHEN** every rendered command and skill body across the claude, codex,
  opencode, and agents outputs is scanned
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

#### Scenario: project context is read through a cospec command

- **WHEN** the rendered `explore` and `propose` bodies are scanned
- **THEN** each names `cospec context --json` as the way to obtain the project's
  `context` and `rules`, neither instructs opening `openspec/config.yaml` or
  `openspec/config.yml` directly, and each states that the result constrains the
  agent's reasoning rather than authorising action or being reproduced verbatim

#### Scenario: propose stops on a root-resolution failure

- **WHEN** the rendered `propose` body is read
- **THEN** it instructs running `cospec context --json` before choosing a type
  and slug, and reporting a root-resolution failure to the user instead of
  proceeding

#### Scenario: update drafts before it writes

- **WHEN** the rendered `update` body is read
- **THEN** its reconcile step instructs drafting the requested edit in the
  conversation rather than in files and proposing no revisions when the change
  is already coherent, and its confirmation step states that it performs every
  artifact write in the workflow and that no earlier step edits an artifact

## ADDED Requirements

### Requirement: Explore conducts grounded, dependency-ordered discovery

The rendered `explore` body SHALL instruct the agent how to conduct discovery,
not only when it may write. It SHALL require asking one focused question at a
time, naming the decision that question unlocks, and ordering questions by
dependency so an answer is never sought before the answer it depends on. It
SHALL require checking the repository for any fact the agent can verify itself
before asking the user for it, and offering a grounded recommendation with its
tradeoffs rather than an open menu. It SHALL state that decisions are tracked in
the conversation and not in files, and that silence is not acceptance — that
accepting an answer, or a batch of recommendations, is not permission to write.

The body SHALL also carry a capability-inventory step built on cospec commands
that already exist: `cospec list --specs` to enumerate the project's capability
specs, and `cospec show "<id>" --type spec [--no-scenarios]` to read one.

An explicit request from the user to capture, record, or write down a named
result SHALL be its own write confirmation, scoped to exactly what was named and
to nothing else.

#### Scenario: explore names the questioning discipline

- **WHEN** the rendered `explore` body is read
- **THEN** it instructs one focused question at a time with the decision it
  unlocks, dependency-ordered questioning, checking the repository before asking
  the user a verifiable fact, recommending with tradeoffs, tracking decisions in
  the conversation rather than in files, and states that silence is not
  acceptance

#### Scenario: explore inventories capabilities through cospec

- **WHEN** the rendered `explore` body is read
- **THEN** it names `cospec list --specs` and
  `cospec show "<id>" --type spec --no-scenarios` as the way to inventory and
  read the project's capability specs

#### Scenario: an explicit capture request is its own confirmation

- **WHEN** the rendered `explore` body is read
- **THEN** it states that a user's explicit request to capture or record a named
  result is itself the write confirmation for that result, and that the
  confirmation covers nothing beyond what the user named

### Requirement: Workflow skill descriptions carry natural-phrasing triggers

Every workflow description in the canon harness manifest SHALL carry, in
addition to its functional sentence, a trigger sentence naming the phrasings a
user actually types, because harness skill matching keys off the description
rather than the body. The trigger sentence SHALL cover both vocabularies cospec
users arrive with — the `cospec <verb>` spelling and the `openspec <verb>`
spelling. The `cospec-update-change` description SHALL additionally disambiguate
the workflow from the unrelated `cospec update` CLI subcommand that regenerates
managed harness and schema files.

#### Scenario: every description carries a trigger sentence

- **WHEN** the canon harness manifest's workflow descriptions are scanned
- **THEN** each of the twelve descriptions contains a trigger sentence in
  addition to its functional sentence, and the trigger sentences name both the
  `cospec` and `openspec` spellings of the workflow's verb

#### Scenario: update-change is disambiguated from the update subcommand

- **WHEN** the `cospec-update-change` description is read
- **THEN** it states that the workflow revises a change's artifacts and is not
  the `cospec update` CLI subcommand that regenerates managed files

#### Scenario: descriptions render into every harness

- **WHEN** the rendered claude, codex, opencode, and shared `.agents/skills`
  outputs are compared against the manifest
- **THEN** each skill's description matches the manifest description verbatim,
  trigger sentence included

### Requirement: Bulk archive documents the per-call collision pre-check

The rendered `bulk-archive` body SHALL record that every `cospec archive <slug>`
call runs its own archive-slot collision pre-check before any spec sync occurs,
so a collision is reported before specs are written rather than discovered at
move time with partial work already committed. The statement SHALL be
documentation of existing behaviour only and SHALL NOT introduce a new step the
agent must perform.

#### Scenario: bulk-archive states when the collision check runs

- **WHEN** the rendered `bulk-archive` body is read
- **THEN** it states that each `cospec archive` call pre-checks its archive slot
  for a collision before any spec sync, and adds no manual pre-check step
