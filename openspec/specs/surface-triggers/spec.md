# surface-triggers Specification

## Purpose

Defines cospec's lean, opt-in trigger mechanism for acceptance nudges: the
closed `## Surfaces` flag block on the `proposal` artifact, the flag-keyed
`design` sections (`## Operational surface`, `## Integration contract`,
`## Seam ownership`) that fire only when their matching surface flag is set, and
the `meta/surface-unmet` soft-trigger mechanic that soft-blocks apply (exit 3)
unless cleared. It also fixes the static `apply.requires` invariant — trigger
behavior influences soft nudges only and must never mutate the hard
required-artifact matrix.

## Requirements

### Requirement: Proposal Surfaces flag block

The `proposal` SHALL carry a machine-parsed `## Surfaces` block for each type
whose canon boolean `surfaces` is true (all but `chore`, `docs`, `style`,
`test`), using checkbox grammar over a closed vocabulary — `interactive`,
`deploy`, `integration`, `agent-behavior` — each optional, unchecked by default;
any other token SHALL fail closed as `proposal/surfaces-vocab`. A surfaces type
whose proposal omits the block SHALL fail closed as `proposal/sections`; an
empty-but-present block satisfies it.

#### Scenario: Valid surface flags parse

- **WHEN** a `feat` proposal's `## Surfaces` block checks `interactive` and
  `deploy` from the closed vocabulary
- **THEN** no `proposal/surfaces-vocab` issue is emitted

#### Scenario: Unknown surface token is rejected

- **WHEN** a `## Surfaces` block lists `- [ ] telemetry`
- **THEN** cospec emits `proposal/surfaces-vocab`

#### Scenario: Surfaces block is mandatory for surfaces types

- **WHEN** a `feat` (or any surfaces:true type) proposal has no `## Surfaces`
  block at all
- **THEN** cospec emits `proposal/sections` naming the missing `## Surfaces`
  section

#### Scenario: Empty-but-present block is accepted

- **WHEN** a `feat` proposal carries a `## Surfaces` block with every flag left
  unchecked
- **THEN** neither `proposal/sections` nor `proposal/surfaces-vocab` is emitted

#### Scenario: Light types omit the block

- **WHEN** a `chore`, `docs`, `style`, or `test` proposal is composed
- **THEN** no `## Surfaces` block is required or expected and the type keeps its
  existing ceremony

### Requirement: Design flag-keyed sections

The `design` per-type instruction SHALL require flag-keyed sections, each a
soft-level check: `## Operational surface` when `interactive` or `deploy` is set
(`design/operational-surface`), `## Integration contract` when `integration` is
set (`design/integration-contract`), and `## Seam ownership` always for
`refactor` (`design/seam-ownership`). Design's matrix placement (optional for
`feat`/`fix`/`perf`, required for `refactor`, forbidden for `revert` and the
light types) SHALL be unchanged.

#### Scenario: Deploy flag without operational surface

- **WHEN** a `feat` change checks the `deploy` surface flag but its `design.md`
  has no `## Operational surface` section
- **THEN** cospec emits `design/operational-surface` (a warning, blocking under
  `--strict`)

#### Scenario: Integration flag without integration contract

- **WHEN** a change checks the `integration` flag but its `design.md` has no
  `## Integration contract` section
- **THEN** cospec emits `design/integration-contract`

#### Scenario: Refactor always expects seam ownership

- **WHEN** a `refactor` change's `design.md` has no `## Seam ownership` section
- **THEN** cospec emits `design/seam-ownership`

#### Scenario: No flag, no section demand

- **WHEN** a `feat` change checks no surface flags
- **THEN** none of `design/operational-surface`, `design/integration-contract`
  is emitted

### Requirement: Surface soft-trigger mechanic

cospec SHALL promote an absent consequence of a checked `## Surfaces` flag to a
soft nudge, only where the target artifact or row is not Forbidden, from the
rule that owns it: `meta/surface-unmet` when `verification.md` is absent, the
`design/*` rules for a missing design section, the `verification/*` surface
rules for a missing row. At validate time these SHALL be WARNING (ERROR under
`--strict`); at apply, soft blockers (exit 3 unless `--allow-soft`) whose
reasons name the flag.

#### Scenario: Interactive flag without a manual or e2e row

- **WHEN** a change with a present `verification.md` checks the `interactive`
  flag but the ledger has no `@manual` or `@e2e` row
- **THEN** cospec emits `verification/interactive-required`

#### Scenario: Apply soft-blocks on an unmet surface

- **WHEN** `cospec apply` runs on a change with an unmet surface consequence and
  `--allow-soft` is absent
- **THEN** the gate exits 3 and lists the surface soft-blocker with its
  triggering flag

#### Scenario: allow-soft clears the surface nudge

- **WHEN** the same `cospec apply` is re-run with `--allow-soft`
- **THEN** the surface soft-blocker no longer blocks and the gate proceeds

#### Scenario: Stray flag on a forbidden target is a no-op

- **WHEN** a change checks a flag whose consequence targets an artifact that is
  Forbidden for that type
- **THEN** `meta/surface-unmet` does not fire for that flag

#### Scenario: Each verification surface rule owns its missing row

- **WHEN** a present `verification.md` lacks the row a checked flag requires
- **THEN** the nudge comes from the owning rule among
  `verification/interactive-required`, `verification/eval-check`,
  `verification/integration-check`, and `verification/deploy-real-layer`

#### Scenario: A wholly absent ledger is reported once

- **WHEN** a soft-promotable type with a checked flag has no `verification.md`
- **THEN** `meta/surface-unmet` reports it, since there is no row to inspect

### Requirement: Static apply.requires invariant

cospec SHALL compute `apply.requires` as a static per-type lookup
(`TYPE_ARTIFACTS[type].applyRequires`) and SHALL NOT re-derive it from a
change's file content at gate time. All surface-trigger behavior SHALL be
layered on top as soft-blockers reusing the existing `gate.soft` /
`--allow-soft` / exit-3 mechanism; a triggered artifact, row, or section SHALL
never enter `apply.requires`.

#### Scenario: Triggers never mutate the required set

- **WHEN** a change checks surface flags that promote optional consequences
- **THEN** the static `apply.requires` set for that type is unchanged and the
  consequences appear only as soft-blockers

#### Scenario: Required set is content-independent

- **WHEN** the required-artifact presence step of `cospec apply` runs
- **THEN** it consults only the static per-type lookup, never the change's
  authored file content
