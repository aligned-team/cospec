# workflow-profiles Specification

## Purpose

Lets a machine choose which of cospec's twelve workflows `cospec init` and
`cospec update` install, and where each is written, the way the wrapped OpenSpec
binary does: a `core` or `custom` profile and a `skills`, `commands` or `both`
delivery, applied only when explicitly set so an unconfigured install keeps all
twelve. It defines how a narrowed set stays coherent, with conditional
cross-workflow handoffs resolved at generation time, an `update` that never
removes an installed workflow, harness detection that does not hinge on one
skill, `init --language`, a `config.yaml` that documents its readable keys, and
a `doctor` report of the explicit profile and delivery.

## Requirements

### Requirement: A profile applies only when explicitly set

cospec SHALL choose the installed workflow set from a profile only when the
profile is explicit: `init --profile <core|custom>`, or a `profile` key actually
present in the machine-global config file (`openspec config path`) whose root is
a JSON object. The pinned binary's built-in default (`profile: core`) SHALL NOT
count. With no explicit profile, `cospec init` and `cospec update` SHALL write
all twelve workflows, as before. A missing, unreadable or invalid file, or a
non-object root, SHALL count as nothing set. `--profile` SHALL override the
file's `profile`; the `workflows` list still comes from the file. cospec SHALL
NOT write the global config, including the one-time `profile: custom` migration
the pinned binary's `init` and `update` perform.

#### Scenario: Nothing set installs all twelve

- **WHEN** `cospec init --harness claude` runs with no `--profile` and a global
  config that has no `profile` key (or no file at all)
- **THEN** all twelve skills and all twelve commands are written

#### Scenario: An explicit core key installs six

- **WHEN** the global config holds `{"profile": "core"}` and
  `cospec init --harness claude` runs in a fresh repo
- **THEN** exactly `propose`, `explore`, `apply`, `update`, `sync-specs` and
  `archive` are written as skills and commands, and `cospec doctor` reports no
  `dangling-ref`

#### Scenario: The built-in default does not count

- **WHEN** the global config holds `{"delivery": "both"}` and nothing else, and
  `cospec init --harness claude` runs
- **THEN** all twelve workflows are written

#### Scenario: The flag overrides the key

- **WHEN** the global config holds
  `{"profile": "custom", "workflows": ["archive"]}` and
  `cospec init --harness claude --profile core` runs
- **THEN** the six core workflows are written

#### Scenario: The global file is never written

- **WHEN** `cospec init` or `cospec update` runs against a repo with installed
  workflows and a global config with no `profile` key
- **THEN** the global config file is byte-identical afterwards

### Requirement: Core and custom profiles resolve as the pinned binary resolves them

`core` SHALL be the six workflows marked `core: true` in
`canon/workflows/harness.yaml`: `propose`, `explore`, `apply`, `update`,
`sync-specs` and `archive`. `custom` SHALL be the global config's `workflows`
list, read with upstream's spellings (`sync` is `sync-specs`; both are
accepted), ids outside the twelve dropped, and a value that is not an array read
as an empty list. When the list holds `archive` or `bulk-archive` without
`sync-specs`, `sync-specs` SHALL be added immediately before the first of them.
An explicit `custom` with no `workflows` key SHALL select no workflow. Any
profile value other than `custom` SHALL select core.

#### Scenario: Archive pulls in sync-specs

- **WHEN** the global config holds
  `{"profile": "custom", "workflows": ["archive"]}` and
  `cospec init --harness claude` runs
- **THEN** exactly `sync-specs` and `archive` are installed

#### Scenario: Bulk-archive pulls in sync-specs before it

- **WHEN** `workflows` is `["verify", "bulk-archive"]`
- **THEN** the resolved order is `verify`, `sync-specs`, `bulk-archive`, and an
  explicit `sync` or `sync-specs` already in the list adds nothing

#### Scenario: An invalid profile name is refused before any write

- **WHEN** `cospec init --profile bogus` runs in a fresh directory
- **THEN** stderr is
  `cospec: Invalid profile "bogus". Available profiles: core, custom`, the exit
  code is 1, and nothing is created

### Requirement: Delivery selects the surface a workflow is written to

A `delivery` key present in the global config SHALL select where each workflow
is written: `skills`, `commands` or `both`; any other value SHALL act as `both`,
and an unset key SHALL be `both`. cospec SHALL classify each harness row as
`adapter-backed` (it has a command surface), `skills-invocable` (`codex`) or
`none`, and SHALL generate skills unless delivery is `commands` and the row is
not `skills-invocable`, and commands only for an `adapter-backed` row unless
delivery is `skills`. Under `skills`, an `adapter-backed` row's skill bodies
SHALL be spelled with skill references. Skills at a root shared by several
selected rows SHALL be generated when any of them generates them. A row that
generates nothing under `commands` SHALL be named in the receipt with
`No skills or commands were generated for <names>: delivery is set to 'commands' but it supports only skills. Run 'cospec config set delivery both' to generate skills.`
A delivery switch SHALL remove the cospec-managed files of the surface no longer
generated, and the workflow SHALL stay installed.

#### Scenario: Skills only

- **WHEN** the global config holds `{"delivery": "skills"}` and
  `cospec init --harness claude` runs
- **THEN** the twelve skills are written, no `.claude/commands/cospec/` file
  exists, and no skill body names a `/cospec:` command

#### Scenario: Commands only

- **WHEN** the global config holds `{"delivery": "commands"}` and
  `cospec init --harness claude` runs
- **THEN** the twelve commands are written and no `.claude/skills/cospec-*`
  directory exists

#### Scenario: Switching moves the files both ways

- **WHEN** a repo initialised with `both` is updated under `skills`, and then
  under `commands`, and then under `both`
- **THEN** each step removes only cospec-managed files of the dropped surface,
  keeps every workflow installed, and the last step restores both surfaces

#### Scenario: A skills-only row under commands writes nothing

- **WHEN** delivery is `commands` and `cospec init --harness agents` runs
- **THEN** no skill is written and the receipt names `agents` in the line above

#### Scenario: Codex keeps its skills under commands

- **WHEN** delivery is `commands` and `cospec init --harness codex` runs
- **THEN** the skills under `.agents/skills` are written

### Requirement: Optional-workflow conditionals follow the pinned grammar

The renderer SHALL resolve
`[[opsx:if-workflow <id>]] … [[opsx:else]] … [[opsx:end]]` in each workflow
body, against the row's effective workflow set, before any dialect
transformation, using the pinned binary's grammar: a conditional alone on a line
is resolved whole-line, so an empty branch removes its line; markers cannot
nest; a block needs the full form. A body SHALL be checked well-formed before
any branch is chosen, so a malformed block fails for every set. The failures
SHALL carry the pinned binary's wording verbatim: an unrecognised marker,
`Malformed optional-workflow conditional: unrecognized marker at '<text>'. Markers are [[opsx:if-workflow <id>]], [[opsx:else]] and [[opsx:end]].`;
markers out of order or incomplete,
`Malformed optional-workflow conditional: markers are out of order or a block is incomplete. Each block needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form, and blocks cannot nest.`;
and a marker left after resolution,
`<reason>: '<marker>' is unresolved. Optional-workflow blocks are resolved by getSkillTemplates()/ getCommandTemplates() against the installed workflow set, and each needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form.`
with the reason `Malformed optional-workflow conditional` from the resolver and
`Skill '<name>' was generated without resolving its optional-workflow blocks` or
`Command '<id>' was generated without resolving its optional-workflow blocks`
where a file is written. No file SHALL be written when one of these fails.

#### Scenario: A whole-line conditional drops its line

- **WHEN** a body line is
  `- [[opsx:if-workflow verify]]verify[[opsx:else]][[opsx:end]]` and `verify` is
  not installed
- **THEN** the rendered body has no such line and no blank line in its place

#### Scenario: An installed id keeps its first branch

- **WHEN** the same marker is rendered with `verify` installed
- **THEN** the rendered line is `- verify`

#### Scenario: A malformed marker fails with the binary's message

- **WHEN** a body carries `[[opsx:if-workflow apply]]x[[opsx:end]]`
- **THEN** rendering throws
  `Malformed optional-workflow conditional: markers are out of order or a block is incomplete. …`,
  identical to the message the pinned `resolveOptionalWorkflows` throws for the
  same text, and nothing is written

#### Scenario: A truncated block in the dropped branch still fails

- **WHEN** a malformed block sits inside the branch that would be discarded for
  this profile
- **THEN** rendering fails as it would for every profile

#### Scenario: Differential equivalence

- **WHEN** cospec's resolver and the pinned
  `core/templates/optional-workflow.js` run over the same matrix of texts and
  installed sets, well-formed and not
- **THEN** their outputs, or their thrown messages, are identical

### Requirement: Every cross-workflow reference is conditional

Every `/cospec:<id>` reference in a canon workflow body SHALL sit inside an
`[[opsx:if-workflow <id>]]` conditional whose else branch is the raw gated
`cospec` command (or drops the line when the workflow has no CLI counterpart),
and the init receipt's hint lines SHALL resolve the same way. With all twelve
workflows installed the rendered bytes of every body SHALL equal what was
rendered before this requirement, so `cospec update` reports no drift in a repo
that sets nothing. No rendered body for a narrowed set SHALL name a workflow
absent from that set, and a marker id SHALL be one of the twelve.

#### Scenario: Core bodies name only core workflows

- **WHEN** `cospec init --profile core` renders the six workflows
- **THEN** no body contains `/cospec:new`, `/cospec:continue`, `/cospec:ff`,
  `/cospec:verify`, `/cospec:bulk-archive` or `/cospec:onboard`, and `update`'s
  hand-off to `continue` reads as a `cospec` command

#### Scenario: The full set is byte-identical

- **WHEN** the twelve bodies are rendered for every shipped row with all twelve
  installed
- **THEN** each equals the committed output byte for byte, and `contentHash` is
  unchanged

#### Scenario: A bare reference fails the canon check

- **WHEN** a canon body holds a `/cospec:<id>` outside a conditional branch
- **THEN** the canon unit test fails naming the file and line

### Requirement: update never removes an installed workflow

`cospec update` and a repeated `cospec init` SHALL write, for each selected row,
the profile's workflows plus every workflow already installed for that row,
where installed means a cospec-managed skill or command file is on disk (or a
manifest-tracked frontmatter-less command). Neither SHALL remove a workflow's
files because the profile no longer lists it; only a delivery switch removes
files, and only the dropped surface's. This is a cospec policy: the pinned
binary's `update` removes deselected workflows. `update` SHALL still add a
profile workflow that is missing.

#### Scenario: An explicit core profile removes nothing

- **WHEN** a repo with twelve installed workflows has `{"profile": "core"}` in
  the global config and `cospec update` runs
- **THEN** every skill and command file is unchanged and `cospec update` reports
  no `removed` outcome

#### Scenario: A profile workflow that is missing is added

- **WHEN** a repo with only the core six has a `custom` profile that adds
  `verify`, and `cospec update` runs
- **THEN** the `verify` skill and command are created and the other six are
  unchanged

#### Scenario: A later harness gets the profile's set

- **WHEN** a repo with twelve claude workflows runs
  `cospec init --harness opencode` under an explicit core profile
- **THEN** opencode gets six workflows and claude keeps twelve

### Requirement: Harness detection does not depend on one skill

`cospec update` SHALL treat a harness as configured when any cospec-managed
workflow skill exists under its skills root, or any cospec-managed command file
exists at one of its command paths, not only the `propose` skill. The
legacy-root and rules-file rules that tell `codex` from `agents` SHALL be
unchanged.

#### Scenario: A profile without propose is still updated

- **WHEN** a repo was initialised with `custom` workflows `["archive"]` and
  `cospec update` runs
- **THEN** `claude` is detected and `sync-specs` and `archive` are regenerated

#### Scenario: A commands-only install is still updated

- **WHEN** a repo was initialised under `delivery: commands` and `cospec update`
  runs
- **THEN** `claude` is detected from its command files and they are regenerated

### Requirement: init --language writes a directive or refuses

`cospec init --language <lang>` SHALL validate before any write, in this order,
each failing as `cospec: <message>` with exit 1: a value empty after trimming,
`The --language option requires a non-empty value.`; a control, bidi-control or
zero-width/line-separator character,
`The --language option must be a single line without control or invisible formatting characters.`;
a directive larger than 50 KB,
`The --language option is too long for OpenSpec's 50KB project context limit.`
The directive SHALL be three lines: `Language: <lang>`,
`All artifacts must be written in <lang>.` and
`Keep OpenSpec structural headings and SHALL/MUST keywords in English.` When
neither `openspec/config.yaml` nor `openspec/config.yml` exists, the directive
SHALL be written as the new file's `context:` and an unwritable or escaping
destination SHALL fail with
`Cannot create openspec/config.yaml for --language: <reason>`. When one exists,
`init` SHALL refuse, writing nothing, unless its `context` already contains the
directive:
`--language does not overwrite an existing OpenSpec config. Add the language instruction to its context field instead.`

#### Scenario: A fresh repo gets the three lines

- **WHEN** `cospec init --language Português` runs in a fresh repo
- **THEN** `openspec/config.yaml` has `context: |` followed by the three
  directive lines, indented two spaces

#### Scenario: A differing context refuses

- **WHEN** `openspec/config.yaml` exists with a `context` that lacks the
  directive and `cospec init --language English` runs
- **THEN** the exit code is 1, stderr is the does-not-overwrite message, and no
  file under the repo changed

#### Scenario: A config with no context refuses too

- **WHEN** `openspec/config.yaml` exists with no `context` key and
  `cospec init --language English` runs
- **THEN** it refuses with the same message

#### Scenario: The same directive is accepted

- **WHEN** the existing `context` already contains the directive and the same
  `--language` is passed again
- **THEN** the exit code is 0 and `config.yaml` is unchanged

#### Scenario: Whitespace-only value

- **WHEN** `cospec init --language "  "` runs
- **THEN** stderr is `cospec: The --language option requires a non-empty value.`
  and nothing is created

### Requirement: The generated config.yaml documents operations, store and references

The `config.yaml` that `cospec init` writes when none exists SHALL carry
commented examples of `operations:` (`apply` and `archive`, each with a
`guidance` list, as the pinned binary's template shows), `store:` (one store id
string) and `references:` (store ids or `{id, remote}` maps), alongside the
existing `schema:`, `context:` and `rules:` text. All examples SHALL be
comments: the file parses with the pinned reader and no warning. An existing
`config.yaml` SHALL never be modified.

#### Scenario: The examples are present and inert

- **WHEN** `cospec init` runs in a fresh repo
- **THEN** `openspec/config.yaml` contains `#   operations:`, `#   store:` and
  `#   references:` lines, and `openspec status` reads it without a warning

### Requirement: Doctor reports the explicit profile and delivery

`cospec doctor` SHALL stop describing `profile`, `workflows` and `delivery` as
inert. Under the unchanged check id `openspec-global-profile` it SHALL report at
INFO the explicit profile (with its workflows) and the explicit delivery read
from the global config, and for each selected harness the installed cospec
workflows that the explicit profile does not list, by name. It SHALL report
nothing when none of the keys is explicit. The `dangling-ref` check SHALL keep
reporting a reference to a workflow with neither a skill nor a command file,
SHALL pass a narrowed install whose bodies name only installed workflows, and
SHALL report an ERROR for a `[[opsx:` marker left in any file cospec wrote.

#### Scenario: Explicit core on a twelve-workflow repo

- **WHEN** a repo has all twelve workflows installed, the global config holds
  `{"profile": "core"}`, and `cospec doctor` runs
- **THEN** an INFO finding with check `openspec-global-profile` names the six
  installed workflows outside the profile (`new`, `continue`, `ff`,
  `bulk-archive`, `verify`, `onboard`), and no finding calls the keys inert

#### Scenario: Nothing explicit is silent

- **WHEN** the global config has no `profile`, `workflows` or `delivery` key
- **THEN** doctor emits no `openspec-global-profile` finding

#### Scenario: A narrowed install passes the dangling-reference check

- **WHEN** `cospec init --profile core` ran and `cospec doctor` runs
- **THEN** it reports no `dangling-ref`

#### Scenario: A residual marker is an error

- **WHEN** a cospec-written skill file contains `[[opsx:if-workflow apply]]`
- **THEN** doctor reports a `dangling-ref` ERROR naming that file
