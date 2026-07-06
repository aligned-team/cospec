## ADDED Requirements

### Requirement: Proposal Surfaces flag block

The `proposal` artifact SHALL carry a machine-parsed `## Surfaces` block for
every change type except the four no-surface light types (`chore`, `docs`,
`style`, `test`), gated by a per-type canon boolean `surfaces`. The block SHALL
use checkbox grammar with a closed four-token vocabulary — `interactive`,
`deploy`, `integration`, `agent-behavior` — all optional and defaulting to
unchecked. A token outside that set SHALL fail closed as
`proposal/surfaces-vocab`. A surfaces:true type whose proposal omits the
`## Surfaces` block entirely SHALL fail closed as `proposal/sections`, so a
dropped block cannot silently suppress its soft-trigger consequences; an
empty-but-present block satisfies the requirement.

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

The `design` artifact's per-type instruction SHALL require flag-keyed sections
that fire only when the matching `## Surfaces` flag is set:
`## Operational surface` when `interactive` or `deploy` is set
(`design/operational-surface`), `## Integration contract` when `integration` is
set (`design/integration-contract`), and `## Seam ownership` always for
`refactor` (`design/seam-ownership`). Each SHALL be a soft-level check. The
design artifact's matrix placement (optional for `feat`/`fix`/`perf`, required
for `refactor`, forbidden for `revert` and the light types) SHALL be unchanged.

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
soft nudge, firing only when the flag's consequence is absent and only for types
where the target artifact or row is not Forbidden. The consequence is reported
by whichever rule owns it: `meta/surface-unmet` when a soft-promotable type's
`verification.md` is absent entirely (no row to inspect), the `design/*` section
rules when a required design section is missing, and the `verification/*`
surface rules (`interactive-required`, `eval-check`, `integration-check`,
`deploy-real-layer`) when a present `verification.md` lacks the required row. At
validate time these SHALL be WARNING (ERROR under `--strict`). At apply time
they SHALL contribute to the existing soft-blocker set, yielding exit 3 unless
`--allow-soft` is passed, with reasons naming the triggering flag.

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
