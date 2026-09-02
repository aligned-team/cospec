// `archive/scenario-preservation` contract test (DESIGN §3.5, §4.4).
//
// Re-probed against the 1.11.0 pin (2026-09-01). The header this file carried
// until now — "the real binary still merges the thinned delta cleanly at exit
// 0" — is FALSE at this pin and the "atlas regression" framing with it.
// openspec 1.8.0 added its own check on both sides:
//   - `validate` reports `MODIFIED "<name>" omits scenario(s) the current spec
//     still has: …` as an ERROR;
//   - `archive` refuses the merge outright — `current spec contains scenario(s)
//     not present in the modified block … Aborted. No files were changed.`,
//     exit 1, change unmoved, living spec untouched.
//
// cospec's own gate stays, and is still load-bearing for two reasons:
//   1. cospec accepts openspec `>=1.0.0 <2.0.0`, and on 1.0.0–1.7.x the binary
//      really does merge a thinned delta at exit 0. cospec's gate is the only
//      defence there — that is what the first test below pins, by asserting the
//      gate refuses BEFORE any delegation happens.
//   2. It refuses with cospec's own message and rule id, before the change is
//      touched, instead of surfacing the wrapped binary's wording mid-archive.
//
// Consequence for users, pinned by the third test: the documented
// `- Scenario removed: <reason>` escape hatch is retired. Upstream has no
// notion of the note, so honouring it could only move the refusal later.

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

/** The same MODIFIED delta plus the (now retired) `Scenario removed:` note. */
const NOTED_THINNED_DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

- Scenario removed: the empty-widget path merged into the primary scenario.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

describe('archive/scenario-preservation vs the pinned openspec binary (re-probed at 1.11.0)', () => {
  test('the real binary now refuses the thinned delta and changes nothing', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'thin-widget')
    const res = await openspec(['archive', 'thin-widget', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain(
      'current spec contains scenario(s) not present in the modified block',
    )
    expect(res.stdout).toContain('Aborted. No files were changed.')
    // The change is untouched and the living spec keeps BOTH scenarios.
    expect(existsSync(join(root, 'openspec/changes/thin-widget'))).toBe(true)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect((living.match(/^####\s+Scenario:/gm) ?? []).length).toBe(2)
  })

  test('cospec archive refuses the same delta before ever delegating', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'thin-widget')
    const res = await cospec(['archive', 'thin-widget'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    // cospec's OWN gate, on stderr, naming its own rule — reached before the
    // wrapped binary is spawned, which is what makes it a defence on the
    // 1.0.0–1.7.x runtimes inside cospec's accepted range.
    expect(res.stderr).toContain('scenario-preservation gate refused')
    expect(res.stderr).toContain('widgets: "Widget rendering" 2 -> 1 scenario(s)')
    expect(existsSync(join(root, 'openspec/changes/thin-widget'))).toBe(true)
  })

  test('the `Scenario removed:` note is not an escape hatch on either side', async () => {
    // openspec has no notion of the note: same refusal.
    const oRepo = mkTempRepo({ git: true })
    writeLivingSpec(oRepo, 'widgets', LIVING)
    mkdirSync(join(oRepo, 'openspec/changes/archive'), { recursive: true })
    writeFiles(oRepo, {
      'openspec/changes/noted-thin/.openspec.yaml': 'schema: feat\ncreated: 2026-07-06\n',
      'openspec/changes/noted-thin/proposal.md': PROPOSAL,
      'openspec/changes/noted-thin/blocking-changes.md': BLOCKERS,
      'openspec/changes/noted-thin/specs/widgets/spec.md': NOTED_THINNED_DELTA,
      'openspec/changes/noted-thin/tasks.md': TASKS_DONE,
    })
    const o = await openspec(['archive', 'noted-thin', '-y'], oRepo)
    expect(o.exitCode).toBe(1)
    expect(o.stdout).toContain('Aborted. No files were changed.')
    expect(existsSync(join(oRepo, 'openspec/changes/noted-thin'))).toBe(true)

    // cospec refuses first, and says why the note no longer helps.
    const cRepo = mkTempRepo({ git: true })
    writeLivingSpec(cRepo, 'widgets', LIVING)
    mkdirSync(join(cRepo, 'openspec/changes/archive'), { recursive: true })
    writeFiles(cRepo, {
      'openspec/changes/noted-thin/.openspec.yaml': 'schema: feat\ncreated: 2026-07-06\n',
      'openspec/changes/noted-thin/proposal.md': PROPOSAL,
      'openspec/changes/noted-thin/blocking-changes.md': BLOCKERS,
      'openspec/changes/noted-thin/specs/widgets/spec.md': NOTED_THINNED_DELTA,
      'openspec/changes/noted-thin/tasks.md': TASKS_DONE,
    })
    const c = await cospec(['archive', 'noted-thin'], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(c.stderr).toContain('scenario-preservation gate refused')
    expect(c.stderr).toContain('no longer excuses the drop')
    expect(existsSync(join(cRepo, 'openspec/changes/noted-thin'))).toBe(true)
  })
})
