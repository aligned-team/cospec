// `archive/scenario-preservation` contract test (DESIGN §3.5, §4.4). openspec
// 1.3.1 has no notion of "did we drop a scenario" — a MODIFIED delta that thins
// a requirement's scenario count merges cleanly at exit 0 (the exact atlas
// regression this gate exists to close). This pins that real behavior, then
// asserts `cospec archive` refuses BEFORE it ever delegates to the pinned
// binary — a false PASS here would be a release blocker.
//
// Re-probed against the 1.5.0 pin (2026-07-05): unchanged. No upstream
// scenario-preservation check landed; the real binary still merges the thinned
// delta cleanly at exit 0, so cospec's gate remains load-bearing and the pinned
// assertion below is verbatim-correct.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { writeLivingSpec } from './fixtures.ts'

afterAll(cleanupAll)

const PROPOSAL = `# change

## Why

The rendering path is being simplified and a stale scenario is trimmed along
the way; this proposal narrows widget rendering to the one path still in use.

## What Changes

- Simplify widget rendering.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Update rendering
`

const LIVING = `# Widgets Specification

## Purpose

Real purpose text.

## Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

/** MODIFIED delta that keeps only ONE of the two living scenarios — a silent
 * thin, with no `Scenario removed:` note and no `## REMOVED Requirements`. */
const THINNED_DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

function build(root: string, name: string): void {
  writeLivingSpec(root, 'widgets', LIVING)
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  writeFiles(root, {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
    [`${c}/proposal.md`]: PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/specs/widgets/spec.md`]: THINNED_DELTA,
    [`${c}/tasks.md`]: TASKS_DONE,
  })
}

describe('archive/scenario-preservation vs the pinned openspec 1.3.1 binary (re-probed unchanged at 1.5.0)', () => {
  test('openspec merges the thinned delta cleanly at exit 0 (the atlas regression)', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'thin-widget')
    const res = await openspec(['archive', 'thin-widget', '-y'], root)
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/thin-widget'))).toBe(false)
    const merged = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect((merged.match(/^####\s+Scenario:/gm) ?? []).length).toBe(1)
  })

  test('cospec archive refuses the same delta before ever delegating', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'thin-widget')
    const res = await cospec(['archive', 'thin-widget'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr).toContain('scenario-preservation')
    // No delegation happened — the change must still be in place.
    expect(existsSync(join(root, 'openspec/changes/thin-widget'))).toBe(true)
  })
})
