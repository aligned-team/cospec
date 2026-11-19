## MODIFIED Requirements

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
  `verification/interactive-required`, `verification/integration-check`, and
  `verification/deploy-real-layer`

#### Scenario: A wholly absent ledger is reported once

- **WHEN** a soft-promotable type with a checked flag has no `verification.md`
- **THEN** `meta/surface-unmet` reports it, since there is no row to inspect

#### Scenario: The agent-behavior flag demands no row

- **WHEN** a change checks the `agent-behavior` flag and its `verification.md`
  has no `@eval` row
- **THEN** cospec emits no verification issue for the flag and `cospec apply`
  does not soft-block on it
