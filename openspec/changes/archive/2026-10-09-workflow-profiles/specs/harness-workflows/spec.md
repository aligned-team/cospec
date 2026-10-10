# Spec Delta

## MODIFIED Requirements

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
