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
