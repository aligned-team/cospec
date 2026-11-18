// Verification 3.4: the shared scenario-preservation gate takes only the
// verbatim view, and every command reaches it through `core/scenario-gate.ts`.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type AdvisoryDeltaOp,
  parseAdvisoryDelta,
  parseDeltaSpec,
} from '../../../src/core/deltas.ts'
import { type CapabilityDeltas, scenarioGate } from '../../../src/core/scenario-gate.ts'
import { mkTempRepo } from '../../fixtures/support.ts'

// Reads every command's source through fs; cli.ts's command registry reaches them all, so
// `bun test --changed` selects this file when one changes.
import '../../../src/cli.ts'

const DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget.

#### Scenario: Render a widget

- **WHEN** a caller asks
- **THEN** a widget is rendered
`

describe('core/scenario-gate.ts', () => {
  test('its input is typed on the verbatim view only', () => {
    const verbatim: CapabilityDeltas = {
      capability: 'widgets',
      ops: parseDeltaSpec(DELTA, 'specs/widgets/spec.md', 'widgets').ops,
    }
    const advisory: AdvisoryDeltaOp[] = parseAdvisoryDelta(
      DELTA,
      'specs/widgets/spec.md',
      'widgets',
    ).ops
    const root = mkTempRepo()
    expect(scenarioGate(root, [verbatim]).drops).toEqual([])
    // @ts-expect-error — a comment-masked op is not a gate input.
    expect(scenarioGate(root, [{ capability: 'widgets', ops: advisory }]).drops).toEqual([])
  })

  test('no command calls findScenarioDrops directly; archive and sync-specs import the gate', () => {
    const dir = join(import.meta.dir, '../../../src/commands')
    const direct = readdirSync(dir).filter((f) =>
      readFileSync(join(dir, f), 'utf8').includes('findScenarioDrops'),
    )
    expect(direct).toEqual([])
    const importers = readdirSync(dir).filter((f) =>
      readFileSync(join(dir, f), 'utf8').includes("from '../core/scenario-gate.ts'"),
    )
    expect(importers.toSorted()).toEqual(['archive.ts', 'sync-specs.ts'])
  })
})
