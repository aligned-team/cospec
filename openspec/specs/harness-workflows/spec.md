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

When no profile is explicitly set (see the `workflow-profiles` capability),
cospec SHALL emit a command (claude, opencode) and a skill (claude, codex,
opencode, agents) for every live opsx 1.5.0 workflow, mapping opsx `sync` to the
existing cospec `sync-specs` workflow rather than renaming it. The `codex` and
`agents` skills are the same files in the shared `.agents/skills` root, so the
rendered skill set SHALL be complete there for both. An explicitly set profile
or delivery mode narrows what is written as `workflow-profiles` states; it never
changes a workflow's body when every workflow is installed.

#### Scenario: /cospec:verify exists

- **WHEN** `cospec init` runs against a target project
- **THEN** `.claude/commands/cospec/verify.md` and the `cospec-verify-change`
  skill are written to every rendered harness directory

#### Scenario: new/ff/bulk-archive/onboard exist across harnesses

- **WHEN** `cospec init` runs against a target project
- **THEN** commands and skills for `new`, `ff`, `bulk-archive`, and `onboard`
  are present in the claude, codex, opencode, and agents output (commands where
  the harness supports them; skills in all four, with codex and agents sharing
  one set of files)

#### Scenario: Setting nothing keeps every body byte-identical

- **WHEN** no profile and no delivery key is set and `cospec update` regenerates
  a repo initialised by the previous release
- **THEN** every skill and command file is reported unchanged

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

### Requirement: opsx 1.11.0 workflow parity

When no profile is explicitly set, cospec SHALL extend its generated workflow
set to the `opsx` workflow set of the pinned OpenSpec 1.11.0 release by adding a
twelfth workflow, `update`, rendered as a command (claude, opencode) and a skill
(claude, codex, opencode, agents) under cospec's own naming — `/cospec:update`
and the `cospec-update-change` skill. Its body SHALL revise existing artifacts
only: it SHALL edit only artifact output paths that already exist, SHALL NOT
invent an artifact (that remains `continue`'s job), SHALL NOT edit code, SHALL
route every read through `cospec status --change <slug> --json` and
`cospec instructions <artifact> --change <slug> --json`, and SHALL hand off to
`/cospec:continue` or `/cospec:apply` wherever those workflows are installed.
The workflow SHALL be registered in the canon harness manifest and its skill id
known to `cospec doctor`, so the dangling-reference check does not flag it under
either the workflow-id or the skill-name spelling. cospec's schema count SHALL
be unaffected and remain eleven.

#### Scenario: update is rendered in every harness

- **WHEN** `cospec init` runs against a target project
- **THEN** `.claude/commands/cospec/update.md`, the opencode command, and the
  `cospec-update-change` skill in the claude, opencode, and shared
  `.agents/skills` outputs are written, bringing the rendered workflow count to
  twelve

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

### Requirement: Shared .agents/skills harness root

cospec SHALL render skills for every harness whose skills root is `.agents`
(`codex`, `agents`, `antigravity`, `zed`) into the vendor-neutral
`.agents/skills/cospec-<skill>/SKILL.md` root, and SHALL write that root from
exactly one selected harness per run, chosen in this order: the harness named by
the ownership marker `.agents/skills/.cospec-target` when it is among the
preferred selected harnesses; then cospec's pre-marker evidence (the codex rules
file `.codex/rules/cospec.rules`, or a legacy `.codex/skills/cospec-*/SKILL.md`,
means `codex`); then `agents` when the root already holds a cospec skill; then
`codex`; then the first selected harness in the pinned OpenSpec binary's tool
order (`antigravity`, `codex`, `zed`, `agents`). The preferred harnesses are the
selected ones with no slash-command surface when any is selected, otherwise all
selected ones. cospec SHALL write the marker, containing the chosen harness id
and a newline, whenever it writes that root, and SHALL track it in the manifest.
cospec SHALL NOT write or read an `.agents/skills/.openspec-target` ownership
marker.

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

### Requirement: Legacy .codex/skills installs are migrated non-destructively

cospec SHALL migrate an existing `.codex/skills/cospec-*` install to
`.agents/skills` after generation has written the replacement, and SHALL delete
a legacy file only when that replacement was actually rendered and the legacy
file still hashes to its own stamped `contentHash`, or when `--force` was
passed. A legacy file cospec did not author SHALL be left untouched and
unreported; a hand-edited legacy file SHALL be left on disk and reported as
preserved, and its freshly generated replacement SHALL NOT be overwritten with
legacy content. Only paths of the exact shape `.codex/skills/cospec-*/SKILL.md`
SHALL be removed, directories SHALL be pruned with `rmdir`-if-empty rather than
a recursive removal, and `.codex/` itself — which still holds
`.codex/rules/cospec.rules` — SHALL never be removed.

A remaining legacy layout SHALL count as drift, so `cospec update --check` SHALL
exit 1 until it clears, and `cospec doctor` SHALL report one `legacy-layout`
WARNING per remaining legacy file rather than describing it as canon drift.
`cospec init --json` and `cospec update --json` SHALL carry the outcomes in a
top-level `migration` array, and `--check`/`--dry-run` SHALL compute every
outcome without touching the disk.

#### Scenario: an untouched legacy skill is removed

- **WHEN** `cospec update` runs in a repo whose `.codex/skills/cospec-propose/`
  holds an unmodified cospec-authored `SKILL.md`
- **THEN** that file is removed, its directory is pruned, the replacement under
  `.agents/skills/cospec-propose/` exists, and the receipt reports the migration

#### Scenario: a hand-edited legacy skill survives

- **WHEN** the legacy `SKILL.md` no longer matches its stamped `contentHash`
- **THEN** it is left on disk, reported as preserved with instructions to
  compare and re-run with `--force`, and the generated replacement is unchanged

#### Scenario: foreign files and .codex/rules are never touched

- **WHEN** `.codex/skills/` also contains a skill cospec did not author and a
  stray user file
- **THEN** neither is removed or reported, `.codex/skills/` is not pruned, and
  `.codex/rules/cospec.rules` and `.codex/` survive

#### Scenario: a remaining legacy layout is drift

- **WHEN** `cospec doctor` and `cospec update --check` run against a repo that
  still holds a legacy `.codex/skills` install
- **THEN** doctor reports a `legacy-layout` WARNING naming each legacy path and
  `cospec update --check` exits 1; after `cospec update` both are clean

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

### Requirement: Init receipt hint follows the selected harness

`cospec init`'s receipt SHALL end with its two hint lines (`Try: …` and
`Lightweight change? …`) spelled the way the first selected harness invokes the
`propose` workflow. The lines SHALL be rendered through that harness's body
dialect and invocation prefix, the same respelling its generated bodies get, so
the hint names a command or skill that exists for that harness. The first
selected harness SHALL be the first id of an explicit `--harness`/`--tools` list
as given, or otherwise the first selected row in table order. When no harness is
selected (`--harness none`), the hint SHALL keep the canonical `/cospec:propose`
spelling. When the `propose` workflow is not installed for that harness (an
explicit profile left it out), the hint SHALL name `new` when that workflow is
installed (`/cospec:new`, spelled the same way), and otherwise the raw gated
command, `cospec new feat <slug>`, followed by a line pointing at
`cospec config profile`, instead of a workflow that does not exist.

The receipt SHALL name only what the `delivery` wrote. The hint SHALL be spelled
for the first selected harness that generates a skill or a command: its command
under delivery `commands`, its skill (`/cospec-propose`, not `/cospec:propose`)
under delivery `skills` when the harness has command files it did not get. When
selected harnesses exist and none generates anything, the receipt SHALL print no
start hint. A harness's setup note SHALL print only when the delivery writes the
surface it is about, and the IDE restart line SHALL follow the surface the
delivery writes for the flagged harness; the shared-root line SHALL print only
for a skills root the delivery writes into.

#### Scenario: OpenCode receipt names the flat command

- **WHEN** `cospec init --harness opencode` runs in a fresh repo
- **THEN** the receipt ends with
  `Try: /cospec-propose "feat: <what you want to build>"` and no line of it
  contains `/cospec:propose`

#### Scenario: Shared-root receipt names the skill

- **WHEN** `cospec init --harness codex` or `cospec init --harness agents` runs
  in a fresh repo
- **THEN** the receipt ends with
  `Try: $cospec-propose (Codex) or /cospec-propose (other agents) "feat: <what you want to build>"`

#### Scenario: Claude-first receipts are unchanged

- **WHEN** `cospec init` runs with `--harness claude`, with `--harness all`, or
  in a fresh repo where nothing is detected
- **THEN** the receipt ends with
  `Try: /cospec:propose "feat: <what you want to build>"`, byte-identical to the
  receipt before this requirement

#### Scenario: The first listed harness decides

- **WHEN** `cospec init --harness opencode,claude` runs
- **THEN** the hint uses OpenCode's `/cospec-propose` spelling

#### Scenario: No harness keeps the canonical hint

- **WHEN** `cospec init --harness none` runs in a fresh repo
- **THEN** the receipt ends with
  `Try: /cospec:propose "feat: <what you want to build>"`, byte-identical to the
  receipt before this requirement

#### Scenario: A profile without propose names the raw command

- **WHEN** `cospec init --harness claude --profile custom` runs with a global
  config whose `workflows` is `["archive"]`
- **THEN** no line of the receipt contains `/cospec:propose`, the first hint
  line is `Try: cospec new feat <slug>`, and the line after it points at
  `cospec config profile`

#### Scenario: A profile with new but not propose names new

- **WHEN** `cospec init --harness claude --profile custom` runs with a global
  config whose `workflows` is `["new"]`
- **THEN** the hint is `Try: /cospec:new "feat: <what you want to build>"`, and
  no line names `cospec new feat <slug>`

#### Scenario: Delivery skills names the skill, not a command

- **WHEN** `cospec init --harness claude` runs with a global config whose
  `delivery` is `skills`
- **THEN** no `.claude/commands/` file is written, the receipt prints no
  `Restart Claude Code to pick up /cospec commands.` line, and the hint is
  `Try: /cospec-propose "feat: <what you want to build>"`

#### Scenario: Delivery commands with only skills harnesses advertises nothing

- **WHEN** `cospec init --harness agents,hermes` runs with a global config whose
  `delivery` is `commands`
- **THEN** nothing is written, the receipt prints the
  `No skills or commands were generated for …` line, and prints no `Try:` hint,
  no Hermes or shared `.agents/skills` setup note and no shared-root line

### Requirement: Doctor checks only the harness files cospec writes

`cospec doctor`'s `stale-harness`, `mixed-versions` and `dangling-ref` checks
SHALL read only files at a path cospec generates:
`<skills-root>/<skill>/SKILL.md`, with exactly one directory between a harness
row's project or legacy skills root and the file, and each markdown harness
row's command paths
(`<commands dir>/<file template with one path segment for the command><extension>`).
Any other file under a harness directory SHALL NOT produce one of those
findings. That includes a user's own markdown and a nested worktree's checkout.
The opsx leftover scan is not narrowed by this requirement.

#### Scenario: A user note is not a harness document

- **WHEN** `cospec doctor` runs in an initialized repo whose `.claude/notes.md`
  is the user's own file and mentions `/cospec:foo`
- **THEN** doctor reports no `dangling-ref`, `stale-harness` or `mixed-versions`
  finding for `.claude/notes.md`

#### Scenario: A nested worktree's copy is not checked

- **WHEN** `cospec doctor` runs in an initialized repo that holds a nested
  worktree under `.claude/worktrees/<name>/`, whose `.claude/skills/` and
  `.claude/commands/cospec/` files carry an older `generatedBy` and a reference
  to an unknown workflow
- **THEN** doctor reports no `stale-harness`, `mixed-versions` or `dangling-ref`
  finding that names a path under `.claude/worktrees/`

#### Scenario: A dangling reference in a cospec-written file still errors

- **WHEN** `.claude/commands/cospec/propose.md` references
  `/cospec:not-a-real-workflow` and `cospec doctor` runs
- **THEN** doctor reports a `dangling-ref` ERROR naming that file

### Requirement: The sync-specs workflow syncs through cospec sync-specs

The `sync-specs` workflow body SHALL do what upstream's `sync` workflow does,
merge a change's delta specs into the main specs without archiving it, and SHALL
do it only through the CLI: preview the merge (`cospec validate <slug>` and the
change's delta files), say which main specs will be created, changed or deleted,
then run `cospec sync-specs <slug>` and report its result. It SHALL NOT instruct
the agent to edit a main spec by hand, and SHALL NOT say that a mid-flight sync
is unsupported. It SHALL say that the merge is the archive's own, byte-for-byte,
so a refusal there is the same refusal archive would give, and that the change
stays active. The workflow's `harness.yaml` description SHALL say it merges a
change's delta specs into the main specs without archiving, and SHALL keep its
natural-phrasing triggers. The `archive` workflow body SHALL say that a change
whose specs were synced early archives as a no-op merge, with both hard gates
still run.

#### Scenario: The rendered sync-specs body runs the command

- **WHEN** the `sync-specs` workflow renders for every harness
- **THEN** each body instructs `cospec sync-specs <slug>` after a preview,
  carries no "no mid-flight sync" text, and names no bare `openspec` command

#### Scenario: The rendered archive body names the early-sync no-op

- **WHEN** the `archive` workflow renders
- **THEN** it says a change synced early with `/cospec:sync-specs` archives as a
  no-op merge and still passes both hard gates

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
implementation evidence, order the colliding changes by the order they archive
in (dependency first, then creation, older first), and record for each delta (a
change and a capability path) an include or exclude decision with its rationale:
only one change implemented includes that one, both implemented includes both
with the change that archives later (the newer) overwriting, and neither
excludes both with a warning. The retarget of a colliding `ADDED` to a
`MODIFIED`, and the scenario carry-over for two changes that `MODIFIED` one
requirement, SHALL fall on that later-archiving change.

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

#### Scenario: two MODIFIED blocks on one requirement resolve through a scenario carry-over

- **WHEN** two active changes both `MODIFIED` one living requirement, each
  adding a scenario, and the later-archiving change's block is edited to carry
  both scenarios as the body directs
- **THEN** both `cospec archive` calls exit 0 and the living spec holds the
  requirement with both scenarios, where unedited the second archive refuses
  with `archive/scenario-preservation`

#### Scenario: a provider created later than its consumer takes no retarget

- **WHEN** a consumer created earlier lists a later-created provider as a
  blocker and both `ADDED` one requirement on a new capability
- **THEN** the consumer's `ADDED` is the one retargeted to `MODIFIED`, the
  provider archives first and the consumer second, both exit 0, and retargeting
  the provider instead is refused by `archive/new-spec-non-added`

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
