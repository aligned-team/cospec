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

cospec SHALL choose the installed workflow set from a profile only when it is
explicit: `init --profile <core|custom>`, or a `profile` key in the global
config (`openspec config path`) whose root is a JSON object, never the binary's
built-in `profile: core`. Otherwise `init` and `update` SHALL write all twelve
workflows. A missing, unreadable or invalid file, or a non-object root, SHALL
count as unset. `--profile` SHALL override the file's `profile`, not its
`workflows`.

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

#### Scenario: cospec never migrates the global config

- **WHEN** `cospec init` or `cospec update` runs with any profile state
- **THEN** cospec does not write the global config, including the one-time
  `profile: custom` migration the pinned binary's `init` and `update` perform

### Requirement: Core and custom profiles resolve as the pinned binary resolves them

`core` SHALL be the six `core: true` workflows in
`canon/workflows/harness.yaml`: `propose`, `explore`, `apply`, `update`,
`sync-specs`, `archive`. `custom` SHALL be the global `workflows` list, read
with upstream's spellings (`sync` or `sync-specs`), ids outside the twelve
dropped, a non-array read as empty, `sync-specs` added just before the first
`archive` or `bulk-archive` when absent. An explicit `custom` without
`workflows` SHALL select none; any other profile value SHALL select core.

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

A global `delivery` key SHALL select where workflows are written: `skills`,
`commands` or `both` (any other value, or unset). Each harness row is
`adapter-backed` (has a command surface), `skills-invocable` (`codex`) or
`none`; skills SHALL be generated unless delivery is `commands` and the row is
not `skills-invocable`, commands only for `adapter-backed` rows unless delivery
is `skills`. A switch SHALL remove the dropped surface's managed files, the
workflow staying installed.

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

#### Scenario: Skills delivery details

- **WHEN** delivery is `skills`, or several selected rows share a skills root
- **THEN** an `adapter-backed` row's skill bodies are spelled with skill
  references, and shared-root skills are generated when any sharing row
  generates them

#### Scenario: A row that generates nothing is named

- **WHEN** a row generates nothing under `commands`
- **THEN** the receipt names it with
  `No skills or commands were generated for <names>: delivery is set to 'commands' but it supports only skills. Run 'cospec config set delivery both' to generate skills.`

### Requirement: Optional-workflow conditionals follow the pinned grammar

The renderer SHALL resolve
`[[opsx:if-workflow <id>]] … [[opsx:else]] … [[opsx:end]]` in each workflow body
against the row's effective set, before any dialect transform, with the pinned
binary's grammar: a conditional alone on a line resolves whole-line, so an empty
branch removes its line; markers cannot nest; a block needs the full form. A
body SHALL be checked well-formed before any branch is chosen, failures SHALL
use the binary's wording verbatim, and a failure SHALL write no file.

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

#### Scenario: Grammar failures use the binary's sentences

- **WHEN** a body has an unrecognised marker, or markers out of order or
  incomplete
- **THEN** it fails with
  `Malformed optional-workflow conditional: unrecognized marker at '<text>'. Markers are [[opsx:if-workflow <id>]], [[opsx:else]] and [[opsx:end]].`
  or
  `Malformed optional-workflow conditional: markers are out of order or a block is incomplete. Each block needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form, and blocks cannot nest.`
  respectively

#### Scenario: A marker left after resolution fails with its reason

- **WHEN** a marker remains after resolution
- **THEN** it fails with
  `<reason>: '<marker>' is unresolved. Optional-workflow blocks are resolved by getSkillTemplates()/ getCommandTemplates() against the installed workflow set, and each needs the full [[opsx:if-workflow <id>]] ... [[opsx:else]] ... [[opsx:end]] form.`
  where the reason is `Malformed optional-workflow conditional` from the
  resolver, and
  `Skill '<name>' was generated without resolving its optional-workflow blocks`
  or
  `Command '<id>' was generated without resolving its optional-workflow blocks`
  where a file is written

### Requirement: Every cross-workflow reference is conditional

Every `/cospec:<id>` reference in a canon workflow body SHALL sit in an
`[[opsx:if-workflow <id>]]` conditional whose else branch is the raw gated
`cospec` command, or drops the line when the workflow has no CLI counterpart;
init receipt hints SHALL resolve the same way. With all twelve installed, every
rendered body SHALL be byte-identical to before, so `cospec update` reports no
drift. A narrowed set's bodies SHALL name no absent workflow, and a marker id
SHALL be one of the twelve.

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

`cospec update` and a repeated `cospec init` SHALL write, per selected row, the
profile's workflows plus every workflow already installed for it (a
cospec-managed skill or command file on disk, or a manifest-tracked
frontmatter-less command), and SHALL add a missing profile workflow. Neither
SHALL remove a workflow because the profile dropped it; only a delivery switch
removes files, the dropped surface's. This is cospec policy: the binary's
`update` removes deselected workflows.

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

`cospec init --language <lang>` SHALL validate before any write, each failure
printed as `cospec: <message>` with exit 1. The directive SHALL be three lines:
`Language: <lang>`, `All artifacts must be written in <lang>.` and
`Keep OpenSpec structural headings and SHALL/MUST keywords in English.` With no
`openspec/config.yaml` or `.yml`, it SHALL be the new file's `context:`. When
one exists, `init` SHALL refuse, writing nothing, unless its `context` already
holds the directive.

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

#### Scenario: Validation runs in order with the binary's sentences

- **WHEN** `--language` is empty after trimming, holds a control, bidi-control
  or zero-width/line-separator character, or yields a directive over 50 KB
- **THEN** it fails, checked in that order, with
  `The --language option requires a non-empty value.`,
  `The --language option must be a single line without control or invisible formatting characters.`,
  or
  `The --language option is too long for OpenSpec's 50KB project context limit.`

#### Scenario: Config creation and refusal sentences

- **WHEN** the new config cannot be written or its destination escapes, or an
  existing config's `context` lacks the directive
- **THEN** the failure is
  `Cannot create openspec/config.yaml for --language: <reason>`, or
  `--language does not overwrite an existing OpenSpec config. Add the language instruction to its context field instead.`

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

`cospec doctor` SHALL stop calling `profile`, `workflows` and `delivery` inert.
Under the unchanged check id `openspec-global-profile` it SHALL report at INFO
the explicit profile with its workflows, the explicit delivery, and per selected
harness the installed cospec workflows the profile does not list, by name,
reporting nothing when no key is explicit.

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

#### Scenario: The dangling-reference check fits narrowed installs

- **WHEN** `cospec doctor` runs its `dangling-ref` check
- **THEN** it still reports a reference to a workflow with neither a skill nor a
  command file, passes a narrowed install whose bodies name only installed
  workflows, and reports an ERROR for a `[[opsx:` marker left in any file cospec
  wrote
