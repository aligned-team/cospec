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

// Name identity: the gap the count-only gate left open. A MODIFIED block can
// keep the living scenario COUNT and still delete a scenario, by replacing one
// name with another. openspec 1.8.0+ catches it (it has always compared names);
// on 1.0.0-1.7.x, inside cospec's accepted range, nothing did, and the scenario
// was merged away at exit 0. cospec now refuses it at its own gate, before the
// binary is spawned, and names the scenario that would have been lost.

/** Same requirement, same scenario COUNT — one scenario renamed. */
const NAME_SWAP_DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render a placeholder widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

function buildWith(root: string, name: string, delta: string, living = LIVING): void {
  writeLivingSpec(root, 'widgets', living)
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  writeFiles(root, {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
    [`${c}/proposal.md`]: PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/specs/widgets/spec.md`]: delta,
    [`${c}/tasks.md`]: TASKS_DONE,
  })
}

describe('scenario NAME identity vs the pinned openspec binary', () => {
  test('a same-count name swap: the real binary refuses it and changes nothing', async () => {
    const root = mkTempRepo({ git: true })
    buildWith(root, 'swap-widget', NAME_SWAP_DELTA)

    // 1.11.0 writes validate findings to stderr, its archive summary to stdout.
    const v = await openspec(['validate', 'swap-widget', '--strict'], root)
    expect(v.exitCode).toBe(1)
    expect(v.stderr).toContain(
      'MODIFIED "Widget rendering" omits scenario(s) the current spec still has: "Render an empty widget"',
    )

    const res = await openspec(['archive', 'swap-widget', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain(
      'current spec contains scenario(s) not present in the modified block',
    )
    expect(res.stdout).toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/swap-widget'))).toBe(true)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(living).toContain('#### Scenario: Render an empty widget')
  })

  test('a same-count name swap: cospec refuses it before ever delegating', async () => {
    const root = mkTempRepo({ git: true })
    buildWith(root, 'swap-widget', NAME_SWAP_DELTA)
    const res = await cospec(['archive', 'swap-widget'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    // cospec's OWN gate, on stderr, before the binary is spawned — the defence
    // that matters on the 1.0.0-1.7.x runtimes inside cospec's accepted range.
    expect(res.stderr).toContain('scenario-preservation gate refused')
    expect(res.stderr).toContain(
      'widgets: "Widget rendering" 2 -> 2 scenario(s); missing: "Render an empty widget"',
    )
    expect(existsSync(join(root, 'openspec/changes/swap-widget'))).toBe(true)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(living).toContain('#### Scenario: Render an empty widget')
  })

  test("validate reports the swap once — cospec's finding, not both sides'", async () => {
    const root = mkTempRepo({ git: true })
    buildWith(root, 'swap-widget', NAME_SWAP_DELTA)
    const res = await cospec(['validate', 'swap-widget', '--strict', '--json'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    const byRule = (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } })
      .summary.byRule
    expect(byRule['archive/scenario-preservation']).toBe(1)
    // The delegated twin (1.11.0's own name-identity check) is suppressed, so
    // the author sees one finding under cospec's rule id, not two.
    expect(res.stdout).not.toContain('omits scenario(s) the current spec still has')
  })
})

// The negative that keeps the relaxation honest: the gate must not refuse a
// removal expressed the way openspec supports. A requirement retired through
// `## REMOVED Requirements` carries no MODIFIED op at all, so its scenarios
// leave the living spec with no scenario-preservation finding on either side.

const TWO_REQUIREMENT_LIVING = `${LIVING}
### Requirement: Widget sizing

The system SHALL size a widget when asked.

#### Scenario: Size a widget

- **WHEN** a caller sizes a widget
- **THEN** the widget is sized
`

const REMOVED_DELTA = `## REMOVED Requirements

### Requirement: Widget sizing

**Reason**: sizing moved to the layout capability.

**Migration**: callers size widgets through the layout capability instead.
`

describe('a requirement retired through REMOVED is not a scenario drop', () => {
  test('the real binary archives it and drops the requirement from the living spec', async () => {
    const root = mkTempRepo({ git: true })
    buildWith(root, 'retire-sizing', REMOVED_DELTA, TWO_REQUIREMENT_LIVING)
    const res = await openspec(['archive', 'retire-sizing', '-y'], root)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).not.toContain('Aborted')
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(living).not.toContain('Widget sizing')
    expect(living).toContain('### Requirement: Widget rendering')
  })

  test('cospec archives it too — the gate never fires on a REMOVED op', async () => {
    const root = mkTempRepo({ git: true })
    buildWith(root, 'retire-sizing', REMOVED_DELTA, TWO_REQUIREMENT_LIVING)
    const v = await cospec(['validate', 'retire-sizing', '--strict'], { cwd: root })
    expect(v.exitCode).toBe(0)

    const res = await cospec(['archive', 'retire-sizing'], { cwd: root })
    expect(res.stderr).not.toContain('scenario-preservation')
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/retire-sizing'))).toBe(false)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(living).not.toContain('Widget sizing')
    // The surviving requirement keeps both of its scenarios.
    expect((living.match(/^####\s+Scenario:/gm) ?? []).length).toBe(2)
  })
})

/** A companion doc an author keeps beside the real delta. It happens to quote a
 * thinned MODIFIED block as an illustration — content `openspec archive` never
 * reads, because only `spec.md` is a delta. */
const COMPANION_NOTES = `# Notes

Rationale for the delta. The block below is quoted for illustration only:

${THINNED_DELTA}`

/** The real delta: MODIFIED that preserves both living scenarios. */
const FULL_DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested, via the single rendering path.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

describe('only spec.md is a delta', () => {
  test('a companion .md beside the delta feeds neither gate, on either side', async () => {
    const root = mkTempRepo({ git: true })
    writeLivingSpec(root, 'widgets', LIVING)
    mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
    writeFiles(root, {
      'openspec/changes/with-notes/.openspec.yaml': 'schema: feat\ncreated: 2026-07-06\n',
      'openspec/changes/with-notes/proposal.md': PROPOSAL,
      'openspec/changes/with-notes/blocking-changes.md': BLOCKERS,
      'openspec/changes/with-notes/specs/widgets/spec.md': FULL_DELTA,
      // Invisible to openspec's change parser; must be invisible to cospec too.
      'openspec/changes/with-notes/specs/widgets/notes.md': COMPANION_NOTES,
      'openspec/changes/with-notes/tasks.md': TASKS_DONE,
    })

    const v = await cospec(['validate', 'with-notes', '--strict'], { cwd: root })
    expect(v.exitCode).toBe(0)

    const res = await cospec(['archive', 'with-notes'], { cwd: root })
    expect(res.stderr).not.toContain('scenario-preservation gate refused')
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/with-notes'))).toBe(false)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect((living.match(/^####\s+Scenario:/gm) ?? []).length).toBe(2)
  })
})
