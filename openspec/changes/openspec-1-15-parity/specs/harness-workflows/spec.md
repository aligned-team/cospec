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

## MODIFIED Requirements

### Requirement: opsx 1.5.0 workflow parity

With no profile explicitly set (see `workflow-profiles`), cospec SHALL emit a
command (claude, opencode) and a skill (claude, codex, opencode, agents) for
every live opsx 1.5.0 workflow, mapping opsx `sync` to the existing cospec
`sync-specs` workflow, not renaming it. `codex` and `agents` share the
`.agents/skills` files, so that set SHALL be complete for both. An explicit
profile or delivery narrows what is written but SHALL NOT change a body when
every workflow is installed.

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

Each parity workflow body SHALL express cospec's typed model, not opsx prose,
and SHALL be runtime-neutral, differing per harness only in `/cospec:<id>`
spelling. `verify` SHALL drive the verification ledger and `validate --strict`;
`ff` SHALL respect the typed artifact plan; `bulk-archive` SHALL loop gated
`cospec archive` and never hand-`mkdir`/`mv` a change; `onboard` SHALL archive
via `cospec archive`. Further body obligations are stated as scenarios.

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

#### Scenario: bodies name no harness-only tool and re-read artifacts

- **WHEN** any rendered workflow body is read
- **THEN** it names no tool that exists in only one harness (`AskUserQuestion`,
  `TodoWrite`), asks the user or tracks progress in runtime-neutral terms, and
  any body that revisits an artifact instructs re-reading it from disk rather
  than trusting an earlier in-context copy

#### Scenario: apply surfaces added scope instead of narrowing

- **WHEN** the rendered `apply` body is read
- **THEN** it instructs surfacing added scope and pausing rather than narrowing
  or deferring specified behavior, and allows checking off a task only when the
  specified behavior is fully implemented

#### Scenario: explore counts config edits as writes

- **WHEN** the rendered `explore` body is read
- **THEN** it requires naming the exact artifacts and files to be written, and
  states that editing schemas, templates, or `config.yaml` counts as a write

#### Scenario: sync-specs and archive describe capability retirement

- **WHEN** the rendered `sync-specs` and `archive` bodies are read
- **THEN** each describes the capability-retirement procedure, states that a
  retirement is declared by `retire_capabilities`, and that a merged spec must
  never be left with an empty `## Requirements` section

#### Scenario: project facts come through cospec commands

- **WHEN** any rendered workflow body grounds itself on a project fact
- **THEN** it obtains the fact through a `cospec` command rather than by reading
  a store file directly, and `explore` and `propose` read `context` and `rules`
  through `cospec context --json`, never by opening `openspec/config.yaml` (or
  `config.yml`), treating the result as a constraint on their reasoning rather
  than authority to act or material to reproduce

#### Scenario: explore and propose follow the root guard without a root

- **WHEN** the rendered `explore` and `propose` bodies are read for the case
  where no root resolves
- **THEN** each follows the shared root-guard fragment rather than proceeding
  without project context: an explicit user request reports the failure and asks
  how to proceed, while a workflow the agent selected itself stops using cospec
  and answers the request normally

#### Scenario: update names its single write step

- **WHEN** the rendered `update` body is read
- **THEN** it stages edits before writing them, checks every other existing
  artifact against the drafted edit, and names exactly one step as the step that
  performs every artifact write, with no earlier step editing an artifact

### Requirement: opsx 1.11.0 workflow parity

With no profile set, cospec SHALL add opsx 1.11.0's twelfth workflow, `update`,
as a command (claude, opencode) and skill (claude, codex, opencode, agents):
`/cospec:update` and `cospec-update-change`. Its body SHALL only revise existing
artifact paths, never invent an artifact or edit code, read only through
`cospec` commands, and hand off to `/cospec:continue` or `/cospec:apply`. It
SHALL be in the harness manifest and known to `cospec doctor`. Schemas SHALL
stay eleven.

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

#### Scenario: update reads only through cospec commands

- **WHEN** the rendered `update` body is read
- **THEN** every read it instructs goes through
  `cospec status --change <slug> --json` and
  `cospec instructions <artifact> --change <slug> --json`, and its hand-offs to
  `/cospec:continue` and `/cospec:apply` apply wherever those workflows are
  installed

#### Scenario: doctor accepts both update spellings

- **WHEN** `cospec doctor` checks references to `update` spelled by workflow id
  and by skill name
- **THEN** neither spelling is flagged by the dangling-reference check

### Requirement: OpenCode commands carry their arguments

Generated OpenCode command bodies SHALL declare the invocation's arguments
through OpenCode's `$ARGUMENTS` placeholder whenever the workflow takes
positional input, so `/cospec-new feat add-widget` reaches the agent intact.
Injection SHALL be a no-op when a body already references `$ARGUMENTS` or a
positional placeholder, SHALL preserve line endings, and SHALL apply only to
workflows taking positional input. Claude and Codex output SHALL be unchanged.

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
(`codex`, `agents`, `antigravity`, `zed`) into
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

#### Scenario: the writer is chosen in a fixed order

- **WHEN** cospec chooses the writer of the `.agents/skills` root
- **THEN** it takes, in order: the harness the `.cospec-target` marker names
  when it is among the preferred selected harnesses; `codex` when
  `.codex/rules/cospec.rules` or a legacy `.codex/skills/cospec-*/SKILL.md`
  exists; `agents` when the root already holds a cospec skill; `codex`; then the
  first selected harness in the pinned binary's tool order (`antigravity`,
  `codex`, `zed`, `agents`) — where the preferred harnesses are the selected
  ones with no slash-command surface when any is selected, otherwise all
  selected ones

#### Scenario: each harness emits its own extra surface

- **WHEN** shared-root harnesses are rendered
- **THEN** `codex`, `agents` and `zed` render byte-identical shared skills,
  `contentHash` included, through the shared dialect; `antigravity` renders
  through its flat dialect when it is the chosen writer; `agents` and `zed` emit
  skills only; `codex` also emits `.codex/rules/cospec.rules`; `antigravity`
  also emits `.agents/workflows/` whichever harness writes the skills; and no
  output path is written twice in one run

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

### Requirement: Legacy .codex/skills installs are migrated non-destructively

cospec SHALL migrate `.codex/skills/cospec-*` to `.agents/skills` after the
replacement is written, deleting a legacy file only when its replacement was
rendered and it still matches its stamped `contentHash`, or with `--force`. It
SHALL remove only `.codex/skills/cospec-*/SKILL.md`, prune with
`rmdir`-if-empty, and never remove `.codex/`. A remaining legacy layout SHALL be
drift. `init`/`update --json` SHALL carry a top-level `migration` array.

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

#### Scenario: a preserved file keeps its replacement generated

- **WHEN** a hand-edited legacy file is preserved during migration
- **THEN** its freshly generated `.agents/skills` replacement is not overwritten
  with legacy content, and a legacy file cospec did not author is neither
  touched nor reported

#### Scenario: doctor reports legacy files, not canon drift

- **WHEN** `cospec doctor` finds a remaining legacy file
- **THEN** it reports one `legacy-layout` WARNING per file rather than
  describing it as canon drift

#### Scenario: check and dry-run compute outcomes without writing

- **WHEN** `cospec update --check` or `--dry-run` runs with a legacy install
- **THEN** every migration outcome is computed and the disk is untouched

### Requirement: Explore conducts grounded, dependency-ordered discovery

The `explore` body SHALL instruct: one focused question at a time naming the
decision it unlocks, in dependency order; checking the repository before asking
a verifiable fact; a recommendation with tradeoffs, not an open menu; decisions
kept in the conversation, not files; and that silence or accepted answers are
not permission to write. It SHALL inventory capabilities via
`cospec list --specs` and `cospec show`. An explicit capture request SHALL
confirm only what it names.

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

Every workflow description in the canon harness manifest SHALL carry, beside its
functional sentence, a trigger sentence naming the phrasings users type, since
harness skill matching keys off the description. It SHALL cover both the
`cospec <verb>` and `openspec <verb>` spellings. The `cospec-update-change`
description SHALL also disambiguate it from the unrelated `cospec update`
subcommand that regenerates managed files.

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

### Requirement: Init receipt hint follows the selected harness

`cospec init`'s receipt SHALL end with its `Try: …` and `Lightweight change? …`
hints spelled, via that harness's dialect and invocation prefix, as the first
selected harness (first `--harness`/`--tools` id, else first selected row in
table order) invokes `propose`. With `--harness none` it SHALL keep
`/cospec:propose`. Without `propose` it SHALL name `new`, else
`cospec new feat <slug>` and a `cospec config profile` line. The receipt SHALL
name only what `delivery` wrote.

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

#### Scenario: delivery decides the hint harness and spelling

- **WHEN** a `delivery` is set
- **THEN** the hint is spelled for the first selected harness that generates a
  skill or a command: its command under `commands`, its skill
  (`/cospec-propose`) under `skills` when the harness has command files it did
  not get

#### Scenario: setup notes follow the delivered surface

- **WHEN** the receipt is printed under any `delivery`
- **THEN** a harness's setup note prints only when the delivery writes the
  surface it is about, the IDE restart line follows the surface written for the
  flagged harness, and the shared-root line prints only for a skills root the
  delivery writes into

### Requirement: Doctor checks only the harness files cospec writes

`cospec doctor`'s `stale-harness`, `mixed-versions` and `dangling-ref` checks
SHALL read only paths cospec generates: `<skills-root>/<skill>/SKILL.md`, one
directory below a harness row's project or legacy skills root, and each markdown
harness row's command paths (one path segment for the command). Any other file
under a harness directory, including user markdown and nested worktree
checkouts, SHALL NOT produce those findings. The opsx leftover scan is not
narrowed.

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

The `sync-specs` body SHALL merge a change's delta specs into the main specs
without archiving, only through the CLI: preview (`cospec validate <slug>` and
the delta files), say which main specs are created, changed or deleted, run
`cospec sync-specs <slug>` and report. It SHALL NOT hand-edit a main spec or
call mid-flight sync unsupported, and SHALL say the merge is the archive's own
and the change stays active, as its `harness.yaml` description SHALL.

#### Scenario: The rendered sync-specs body runs the command

- **WHEN** the `sync-specs` workflow renders for every harness
- **THEN** each body instructs `cospec sync-specs <slug>` after a preview,
  carries no "no mid-flight sync" text, and names no bare `openspec` command

#### Scenario: The rendered archive body names the early-sync no-op

- **WHEN** the `archive` workflow renders
- **THEN** it says a change synced early with `/cospec:sync-specs` archives as a
  no-op merge and still passes both hard gates

#### Scenario: sync-specs shares the archive's refusals

- **WHEN** the rendered `sync-specs` body is read
- **THEN** it says the merge is byte-for-byte the archive's own, so a refusal
  there is the same refusal archive would give

#### Scenario: the description says it merges without archiving

- **WHEN** the `sync-specs` description in `harness.yaml` is read
- **THEN** it says the workflow merges a change's delta specs into the main
  specs without archiving and keeps its natural-phrasing triggers

### Requirement: Every pinned tool id is a harness

`cospec init --harness`/`--tools` SHALL accept every pinned `AI_TOOLS` id,
resolve `windsurf` to `devin`, and let `all` select all. Each harness SHALL get
cospec's canon bodies, never `/opsx:*` templates, at the paths the binary's
`init --tools <id>` writes, `openspec-`/`opsx-` names respelled `cospec-`, with
upstream's directory, extension and wrapper. The receipt SHALL print upstream
setup notes verbatim. Unknown values, including `agents` aliases, SHALL be
refused.

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

#### Scenario: wrappers keep upstream's shape plus provenance

- **WHEN** a harness's command files are rendered
- **THEN** each uses upstream's wrapper — YAML frontmatter with upstream's keys
  plus cospec's `metadata` provenance, a Markdown `# <name>` header, a bare
  body, or TOML — and `opsx-<id>`/`opsx/<id>` are spelled
  `cospec-<command>`/`cospec/<command>`

#### Scenario: the restart line follows the setup notes

- **WHEN** a selected harness requires an IDE restart
- **THEN** the receipt prints the binary's single IDE-restart line after each
  selected harness's setup note

#### Scenario: the fallback line names the flag typed

- **WHEN** `cospec init --harness bogus` runs
- **THEN** the refusal names the valid values and is followed by
  `Tool not listed? Use --harness agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`

### Requirement: Workflow references follow each tool's invocation

Skill and command bodies SHALL spell `/cospec:<id>` as the tool invokes it, per
the binary's transforms: `/cospec:<id>` namespaced, `<prefix>cospec-<id>` flat
(`@` for Amazon Q), `/cospec-<skill>` for skills-only tools and Devin's skills,
`/skill:cospec-<skill>` for Kimi Code, `the cospec-<skill> skill` for Rovo Dev,
and the shared dialect on `.agents`. Receipt hints SHALL use the first selected
harness's skill spelling. `cospec doctor` SHALL recognise every spelling.

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

#### Scenario: prose-skill hints use the tool name

- **WHEN** the first selected harness references skills in prose
- **THEN** the receipt hint reads
  `Try: ask <tool name> to use the cospec-propose skill with "feat: <what you want to build>"`

### Requirement: Legacy tool roots move OpenSpec-managed content

cospec SHALL port the binary's legacy root moves for a selected harness:
`.kimi`→`.kimi-code` and `.agent`→`.agents` without consent, `.codex`→`.agents`
after generation, `.windsurf`→`.devin` with consent. Only
`openspec-<skill>/SKILL.md` and `opsx-*` command files SHALL move; an identical
destination drops the legacy copy, a differing one keeps both and is reported;
directories go only when empty. Every move SHALL be reported in the receipt and
`--json` `migration`.

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

#### Scenario: consent for the Windsurf move

- **WHEN** `.windsurf` holds OpenSpec-managed content
- **THEN** `cospec init` treats selecting the tool as consent, and
  `cospec update` asks before moving only when stdin and stdout are terminals
  and neither `--json` nor `--force` is passed, moving without asking otherwise

### Requirement: GitHub Copilot is a harness target

`--harness github-copilot` SHALL write the twelve skills to
`.github/skills/cospec-<skill>/SKILL.md` and twelve commands to
`.github/prompts/cospec-<command>.prompt.md`, each with `description` and
`metadata` frontmatter and a flat-dialect body. It SHALL set
`requiresIdeRestart`, sit between `gemini` and `hermes`, and be found by
`update` via its `cospec-propose` skill. OpenSpec-written `openspec-*`/`opsx-*`
prompts SHALL be leftovers for `--remove-opsx`; user prompts SHALL NOT be.

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

#### Scenario: every Copilot detection path selects it

- **WHEN** `cospec init` runs with no `--harness` in a repo holding any one of
  `.github/copilot-instructions.md`, `.github/instructions`,
  `.github/workflows/copilot-setup-steps.yml`, `.github/prompts`,
  `.github/agents`, `.github/skills` or `.github/.mcp.json`
- **THEN** `github-copilot` is auto-detected

### Requirement: One shared fragment grounds every body on the project root

The canon SHALL declare root-grounding once in
`canon/workflows/_shared/root-guard.md`, interpolated at one `{{ROOT_GUARD}}`
token per workflow body before any other render step; a missing or repeated
token, or any other unregistered `{{NAME}}` besides `{{TYPE_TABLE}}`, SHALL fail
the render. The fragment SHALL name no bare `openspec`, `/cospec:<id>` or
optional-workflow marker. Bodies SHALL NOT duplicate it and SHALL keep
sole-change auto-selection.

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

#### Scenario: the fragment opens with the root check

- **WHEN** the fragment is read
- **THEN** it opens with the check that precedes the first write,
  `cospec list --json` (with `--store <id>` when a store is selected) reading
  `root`, and in both no-root branches forbids creating the root as a side
  effect

#### Scenario: the store carve-out names config

- **WHEN** a `status` message starts `Declared in` or
  `Invalid store declaration in` and names the project's `openspec/config.yaml`
  or `config.yml`
- **THEN** the fragment applies its store-declaration carve-out

#### Scenario: the picker uses list order and lastModified

- **WHEN** the fragment's change picker is read
- **THEN** it presents changes in the order `cospec list --json` returns them,
  with recency taken from `lastModified`

### Requirement: propose and ff inspect the project before drafting

Before drafting, the rendered `propose` and `ff` bodies SHALL have the agent
read the instructions' `context` and `rules`, then inspect, read-only and in
proportion, implementation, tests, configuration and docs outside `openspec/`;
identify the target project, asking when unclear; and ground the draft in
findings now, not generic tasks. They SHALL NOT instruct reading config or
schema files, and an artifact's format SHALL still come from
`cospec instructions`.

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

#### Scenario: findings ground the draft

- **WHEN** the rendered `propose` and `ff` bodies are read
- **THEN** each tells the agent to ground scope, approach and tasks in what it
  found, distinguishing observed behaviour from assumptions, to surface
  conflicts with existing specs instead of silently choosing, and to do the
  discovery now rather than leave generic exploration tasks

### Requirement: apply treats the project's inputs as controlled advice

The rendered `apply` body SHALL read `context` (required prompt input) and
`operationGuidance` (optional additive advice, followed only where applicable
and compatible) from `cospec apply --json`'s `apply` object, kept apart from the
gate, tasks, progress, `contextFiles` and the built-in instruction. Neither
SHALL count as task evidence, replace the instruction or bypass a blocked or
soft-blocked state. The scenarios below state conflict, copying and enforcement
rules.

#### Scenario: apply carries the precedence paragraph

- **WHEN** the rendered `apply` body is read
- **THEN** it carries each of those rules, and each controlling sentence appears
  in the pinned `apply-change.js` template's corresponding paragraph

#### Scenario: conflicts keep the controlling value

- **WHEN** the rendered `apply` body is read
- **THEN** it requires a conflict with the instruction, an explicit user choice
  or a CLI-controlled value to be reported with the controlling value kept, and
  inapplicable guidance to be left unfollowed with the reason said

#### Scenario: the inputs are not copied and not enforced

- **WHEN** the rendered `apply` body is read
- **THEN** it forbids copying `context` or `operationGuidance` verbatim into
  implementation files or planning artifacts unless the user asks, and says both
  are prompt-level contracts, not enforceable checks

### Requirement: archive and bulk-archive consult the archive guidance advisorily

The `archive` body SHALL, after selecting the change, run
`cospec instructions archive --change "<slug>" --json` (with the selected
`--store`); `bulk-archive` SHALL run it once per root before batch validation.
The lookup SHALL be optional and non-blocking. Each body SHALL carry the
precedence paragraph for `context` (required) and `operationGuidance`
(additive). Following `archive.md` alone SHALL reach
`operations.archive.guidance`.

#### Scenario: the lookup the body names returns the configured guidance

- **WHEN** a project's `config.yaml` sets `operations.archive.guidance` and the
  command line printed in the rendered `archive` body is run for a change
- **THEN** its `--json` document carries that guidance in `operationGuidance`

#### Scenario: a failed lookup never blocks the archive

- **WHEN** the rendered `archive` and `bulk-archive` bodies are read
- **THEN** each states that a non-zero exit or invalid JSON from the lookup
  continues the workflow with no context and no guidance and reports nothing

#### Scenario: the precedence paragraph bounds both inputs

- **WHEN** the rendered `archive` and `bulk-archive` bodies are read
- **THEN** each states that neither `context` nor `operationGuidance` overrides
  built-in steps, explicit user choices, resolved paths, CLI checks or command
  contracts; a conflict is reported with the controlling value kept; no
  replacement paths, skipped prompts or flags are inferred; neither is copied
  into specs, change artifacts or the summary; and both are prompt-level only

### Requirement: bulk-archive resolves cross-change collisions through delta edits

The `bulk-archive` body SHALL define a collision as selected changes carrying a
delta for the same `<capability-path>`, have the agent read each, search for
implementation evidence, order changes by archive order (dependency, then
creation, older first), and record include/exclude per delta with rationale. It
SHALL edit only conflicting delta files after user confirmation, then archive
each change via `cospec archive <slug>` in order, both gates running, never
suggesting `--force*`.

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

#### Scenario: the include/exclude decision follows the evidence

- **WHEN** the body's collision decision is read
- **THEN** only one change implemented includes that one, both implemented
  includes both with the later-archiving (newer) change overwriting, and neither
  excludes both with a warning; the `ADDED`→`MODIFIED` retarget and the scenario
  carry-over for two `MODIFIED` blocks on one requirement fall on the
  later-archiving change

#### Scenario: each edited change validates before its own archive

- **WHEN** a delta edit has been confirmed and written
- **THEN** the body requires the user to confirm the resolution and each
  proposed edit before any edit is written, writes no other artifact, and
  requires each edited change to pass `cospec validate <slug> --strict` after
  every change ahead of it has archived and before its own archive
