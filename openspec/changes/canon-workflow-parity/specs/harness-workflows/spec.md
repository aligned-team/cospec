# Delta for harness-workflows

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
authority to act or material to reproduce, and, when no root resolves, SHALL
follow the shared root-guard fragment rather than proceeding without project
context: a request the user made explicitly reports the failure and asks how to
proceed, while a workflow the agent selected itself stops using cospec and
answers the request normally.

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
  and slug, and, when no root resolves, reporting the failure and asking how to
  proceed for an explicit request or stopping without mentioning setup for an
  auto-selected workflow, never proceeding to `cospec new`

#### Scenario: update drafts before it writes

- **WHEN** the rendered `update` body is read
- **THEN** its reconcile step instructs drafting the requested edit in the
  conversation rather than in files and proposing no revisions when the change
  is already coherent, and its confirmation step states that it performs every
  artifact write in the workflow and that no earlier step edits an artifact

## ADDED Requirements

### Requirement: One shared fragment grounds every body on the project root

The canon SHALL declare the root-grounding text once, in
`canon/workflows/_shared/root-guard.md`, and `renderHarnessFiles` SHALL
interpolate it at a `{{ROOT_GUARD}}` token into each of the twelve workflow
bodies before any other render step. A body SHALL carry exactly one such token,
and a render whose body lacks it, repeats it or carries any other unregistered
`{{NAME}}` token (other than `{{TYPE_TABLE}}`) SHALL fail. The fragment SHALL
name no bare `openspec` command, no `/cospec:<id>` reference and no
optional-workflow marker.

The fragment SHALL open with the check that precedes the first write
(`cospec list --json`, with `--store <id>` when a store is selected, reading
`root`), and SHALL carry three parts: a store-declaration carve-out, which
applies when a `status` message starts `Declared in` or
`Invalid store declaration in` and names the project's `openspec/config.yaml` or
`config.yml` and which stops before writing and shows that entry's `message` and
`fix`; the distinction between a workflow the agent selected itself, which stops
using cospec and answers normally without mentioning setup, and an explicit
request, which stops before writing and asks whether to initialise, target a
store or continue without cospec; and a change picker. In both branches the
fragment SHALL forbid creating the root as a side effect. The picker SHALL
present the three or four most recently modified changes in the order
`cospec list --json` returns them, each with its type, gate state, task progress
and how recently it was modified from `lastModified`, and SHALL mark the most
recent `(Recommended)`.

A body's own root-grounding or change-picking prose SHALL NOT duplicate the
fragment; the bodies that auto-select a sole active change SHALL keep that
behaviour and its announcement.

#### Scenario: the fragment renders into all twelve bodies

- **WHEN** every workflow body is rendered for every shipped harness row
- **THEN** each carries the fragment's text exactly once, and none carries the
  literal `{{ROOT_GUARD}}`

#### Scenario: an auto-selected workflow stays out of the way

- **WHEN** a rendered body's fragment is read
- **THEN** it states that, with no root and a workflow the agent selected
  itself, the agent answers normally and mentions no setup, and that with an
  explicit request it stops before writing and asks whether to run
  `cospec init`, pass `--store <id>`, or continue without cospec

#### Scenario: a declared store the machine cannot resolve is not an uninitialised project

- **WHEN** a rendered body's fragment is read
- **THEN** it names the `Declared in` and `Invalid store declaration in`
  prefixes, tells the agent not to treat that project as uninitialised, and
  tells it to stop and show the entry's `message` and `fix`

#### Scenario: the picker is recency-ranked and marks the likeliest change

- **WHEN** a rendered body's fragment is read
- **THEN** it tells the agent to present the three or four most recently
  modified changes with type, gate state, progress and recency, to mark the most
  recent `(Recommended)`, and not to re-sort by name

#### Scenario: a body without the token fails to render

- **WHEN** a workflow body lacks `{{ROOT_GUARD}}` or carries it twice
- **THEN** the render throws naming the workflow

### Requirement: propose and ff inspect the project before drafting

The rendered `propose` and `ff` bodies SHALL tell the agent, before it drafts an
artifact, to read the instructions' `context` and `rules` and then inspect the
implementation, nearby tests, configuration and documentation outside
`openspec/`, read-only and in proportion to the change. They SHALL tell the
agent to identify the target project from the request and context and to ask
when it is unclear, to ground scope, approach and tasks in what it finds while
distinguishing observed behaviour from assumptions and surfacing conflicts with
existing specs instead of silently choosing, and to do that discovery now rather
than leave generic exploration tasks. The passage SHALL NOT instruct reading
`openspec/config.yaml` or the schema files, and the existing rule that an
artifact's format comes from `cospec instructions` SHALL remain.

#### Scenario: propose and ff name what to inspect and when to ask

- **WHEN** the rendered `propose` and `ff` bodies are read
- **THEN** each tells the agent to inspect implementation, tests, configuration
  and documentation outside `openspec/` before drafting, in proportion to the
  change, and to ask when the target is unclear

#### Scenario: inspecting the project does not reopen the format rule

- **WHEN** the rendered `propose` and `ff` bodies are read
- **THEN** each still states that an artifact's template and format come from
  `cospec instructions`, and neither instructs opening `openspec/schemas/` or
  `openspec/config.yaml`

### Requirement: explore draws diagrams in ASCII only

The rendered `explore` body SHALL state that diagrams are drawn in plain ASCII
(borders `+` `-` `|`, arrows `-->` `<--` `^` `v`, markers `*` `x`), with the
reason that Unicode diagram glyphs render at different widths across terminals,
fonts and locales. The body SHALL contain no box-drawing or arrow glyph.

#### Scenario: explore states the ASCII rule and follows it

- **WHEN** the rendered `explore` body is read
- **THEN** it states the plain-ASCII rule with its reason and contains no
  character in U+2190-U+21FF or U+2500-U+257F

### Requirement: apply treats the project's inputs as controlled advice

The rendered `apply` body SHALL tell the agent to read `context` and
`operationGuidance` from the `apply` object of `cospec apply --json`: `context`
as a required prompt-level input and `operationGuidance` as optional additive
advice, each entry considered and followed only where applicable and compatible
with the built-in workflow. It SHALL keep both apart from the gate, the tasks,
the progress, `contextFiles` and the built-in instruction; say neither is
evidence of task completion, replaces the instruction or permits bypassing a
blocked or soft-blocked state; require a conflict with the instruction, an
explicit user choice or a CLI-controlled value to be reported with the
controlling value kept, and inapplicable guidance to be left unfollowed with the
reason said; forbid copying either verbatim into implementation files or
planning artifacts unless the user asks; and say they are prompt-level
contracts, not enforceable checks.

#### Scenario: apply carries the precedence paragraph

- **WHEN** the rendered `apply` body is read
- **THEN** it carries each of those rules, and each controlling sentence appears
  in the pinned `apply-change.js` template's corresponding paragraph

### Requirement: archive and bulk-archive consult the archive guidance advisorily

The rendered `archive` body SHALL, after selecting the change, run
`cospec instructions archive --change "<slug>" --json` (with the selected
`--store`) and the rendered `bulk-archive` body SHALL run it once for the
selected root before batch validation. The lookup SHALL be stated as optional
and non-blocking: a non-zero exit or invalid JSON means continuing with no
context and no guidance, with no error reported and no stop. Each body SHALL
carry the precedence paragraph for the returned `context` (required) and
`operationGuidance` (additive): neither overrides built-in steps, explicit user
choices, resolved paths, CLI checks or command contracts; a conflict is reported
with the controlling value kept; no replacement paths, skipped prompts or flags
are inferred; neither is copied into specs, change artifacts or the summary; and
both are prompt-level only. Following `archive.md` alone SHALL reach
`operations.archive.guidance`.

#### Scenario: the lookup the body names returns the configured guidance

- **WHEN** a project's `config.yaml` sets `operations.archive.guidance` and the
  command line printed in the rendered `archive` body is run for a change
- **THEN** its `--json` document carries that guidance in `operationGuidance`

#### Scenario: a failed lookup never blocks the archive

- **WHEN** the rendered `archive` and `bulk-archive` bodies are read
- **THEN** each states that a non-zero exit or invalid JSON from the lookup
  continues the workflow with no context and no guidance and reports nothing

### Requirement: bulk-archive resolves cross-change collisions through delta edits

The rendered `bulk-archive` body SHALL define a collision as two or more
selected changes carrying a delta for the exact same `<capability-path>`, and
SHALL instruct the agent to read each conflicting delta, search the codebase for
implementation evidence, order the colliding changes chronologically by creation
(older first), and record for each delta (a change and a capability path) an
include or exclude decision with its rationale: only one change implemented
includes that one, both implemented includes both with the newer overwriting,
and neither excludes both with a warning.

The resolution SHALL edit only the conflicting change's delta files, SHALL
require the user's confirmation of the resolution and each proposed edit before
any edit is written (a declined confirmation edits and archives nothing), SHALL
NOT write a main spec, move a change directory or edit any other artifact, and
SHALL require each edited change to pass `cospec validate <slug> --strict` after
every change ahead of it in the resolved order has archived and before its own
archive. Each change SHALL be archived with `cospec archive <slug>` in the
resolved order, so both archive hard gates run for each, and no `--force*` flag
SHALL be suggested to get past a collision.

#### Scenario: a duplicate ADDED resolves through a delta edit and archives through the gates

- **WHEN** two active changes both ADD the same requirement to one capability,
  the newer change's delta is edited as the body directs, and both are archived
  in chronological order
- **THEN** only files under the newer change's `specs/` directory differ from
  before the edit, both `cospec archive` calls exit 0 with both hard gates run,
  and the living spec holds the newer change's requirement

#### Scenario: the unresolved collision is the case the later archive refuses

- **WHEN** the same two changes are archived without the edit
- **THEN** the second `cospec archive` refuses with `archive/added-exists` and
  nothing is moved for it

#### Scenario: the body never writes a main spec or moves a directory

- **WHEN** the rendered `bulk-archive` body is read
- **THEN** it forbids writing a main spec, hand-moving a change directory and
  `--force*`, and states that a declined confirmation edits and archives nothing

### Requirement: Each ported passage records its upstream template and pin

`canon/workflows/harness.yaml` SHALL carry, for every workflow, a `ported:` list
whose entries each name a `passage`, the upstream template `file` it was ported
from (relative to the pinned `@fission-ai/openspec` package root) and the `pin`
it was read at. Every workflow SHALL list the root-guard and change-picker
passages, and each ported passage of this change SHALL have an entry on the
workflow that carries it. The list SHALL NOT reach any generated file.

#### Scenario: every ported entry names a template in the pinned dist

- **WHEN** each `ported:` entry is checked against the pinned dist
- **THEN** its `file` exists there and its `pin` equals the pinned version, and
  a mismatch lists every entry to re-diff

#### Scenario: the provenance never reaches a generated file

- **WHEN** every harness file is rendered
- **THEN** none contains the text of a `ported:` key
