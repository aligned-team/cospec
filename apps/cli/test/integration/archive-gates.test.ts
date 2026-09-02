// `cospec archive`'s two new hard gates (DESIGN §3.5): `archive/verification-
// incomplete` (after the tasks gate, independent of specs) and
// `archive/scenario-preservation` (before delegating to `openspec archive`,
// specs-bearing changes only). Authors changes directly at `schemaVersion: 2`
// (group 9's `cospec new` stamping) so the v2 gate applies deterministically.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
`

const FIX_PROPOSAL = `# change

## Why

A mocked handler was returning 200 regardless of input, enshrining the bug
instead of catching it; this fixes the real dependency call so the failure
actually reproduces before the fix and passes after.

## What Changes

- Call the real dependency instead of the mock.

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

function openspecYamlV2(schema: string): string {
  return `schema: ${schema}\ncreated: 2026-07-06\nschemaVersion: 2\n`
}

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  return root
}

describe('archive/verification-incomplete', () => {
  test('fully resolved (mix of [x] evidence and [~] defer) archives normally', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/fix-oauth'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('fix'),
      [`${c}/proposal.md`]: FIX_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
      [`${c}/verification.md`]: [
        '## 1. OAuth callback works',
        '- [x] 1.1 @regression reran the failing case against the real endpoint -> now returns 200 with a valid session',
        '- [~] 1.2 @manual exploratory click-through -> defer: no browser in CI',
      ].join('\n'),
    })
    const res = await cospec(['archive', 'fix-oauth'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/fix-oauth'))).toBe(false)
  })

  test('a v1 change (no schemaVersion stamp) with no verification.md is grandfathered', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/legacy-fix'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: fix\ncreated: 2026-07-06\n',
      [`${c}/proposal.md`]: FIX_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
    })
    const res = await cospec(['archive', 'legacy-fix'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/legacy-fix'))).toBe(false)
  })
})

describe('archive/scenario-preservation', () => {
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

  const FEAT_PROPOSAL = `# change

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

  function buildFeat(root: string, name: string, delta: string): void {
    writeFiles(root, {
      ['openspec/specs/widgets/spec.md']: LIVING,
      [`openspec/changes/${name}/.openspec.yaml`]: openspecYamlV2('feat'),
      [`openspec/changes/${name}/proposal.md`]: FEAT_PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/specs/widgets/spec.md`]: delta,
      [`openspec/changes/${name}/tasks.md`]: TASKS_DONE,
      [`openspec/changes/${name}/verification.md`]: [
        '## 1. Widget rendering still works [critical]',
        '- [x] 1.1 @e2e render a widget end to end -> a widget renders',
      ].join('\n'),
    })
  }

  test('a thinned MODIFIED delta refuses archive before delegation', async () => {
    const root = await initRepo()
    buildFeat(
      root,
      'thin-widget',
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
    )
    const res = await cospec(['archive', 'thin-widget'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('scenario-preservation')
    // No delegation happened — the change must still be in place.
    expect(existsSync(join(root, 'openspec/changes/thin-widget'))).toBe(true)
  })

  // The `Scenario removed:` escape hatch is retired. openspec 1.8.0 reports any
  // MODIFIED block that omits a living scenario as a validate ERROR and aborts
  // the archive on one, with no notion of cospec's note — so honouring it could
  // only push the refusal one step later and hand the author openspec's message
  // instead of cospec's. cospec refuses at its own gate, before delegating.
  test('a `Scenario removed:` note no longer excuses the drop', async () => {
    const root = await initRepo()
    buildFeat(
      root,
      'thin-widget-ok',
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

- Scenario removed: the empty-widget path merged into the primary scenario.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
    )
    const res = await cospec(['archive', 'thin-widget-ok'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('scenario-preservation')
    expect(res.stderr).toContain('no longer excuses the drop')
    expect(res.stderr).toContain('copy the missing scenario back into the MODIFIED block')
    expect(existsSync(join(root, 'openspec/changes/thin-widget-ok'))).toBe(true)
  })

  // W4's masking is load-bearing on this gate: a scenario heading that only
  // survives inside an HTML comment or a code fence is documentation, not a
  // preserved scenario. Both cases must read as a drop to zero, not as two
  // scenarios kept. Here the shape ERROR and the gate WARNING are reported
  // together by the pre-delegation validation pass, so they land on stdout.
  for (const [name, masked] of [
    ['masked-comment', '<!--\n$BODY\n-->'],
    ['masked-fence', '````\n$BODY\n````'],
  ] as const) {
    test(`scenarios that survive only inside ${name.slice(7)} markup are not preserved`, async () => {
      const root = await initRepo()
      const body = `#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered`
      buildFeat(
        root,
        name,
        `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

${masked.replace('$BODY', body)}
`,
      )
      const res = await cospec(['archive', name], { cwd: root })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toContain('archive/scenario-preservation')
      expect(res.stdout).toContain('drops scenario count from 2 to 0')
      expect(existsSync(join(root, `openspec/changes/${name}`))).toBe(true)
    })
  }

  test('keeping every living scenario in the MODIFIED block archives normally', async () => {
    const root = await initRepo()
    buildFeat(
      root,
      'keep-widget',
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested, quickly.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`,
    )
    const res = await cospec(['archive', 'keep-widget'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/keep-widget'))).toBe(false)
  })
})

// openspec 1.6.0 (#1353) grew the nested `specs/<area>/<capability>/spec.md`
// layout, and merges such a delta to the SAME relative path under the living
// specs root. cospec keyed its delta ops on the outermost directory, so both
// hard archive gates looked for `openspec/specs/<area>/spec.md`, found nothing,
// and silently passed every nested spec.
describe('archive gates under a nested capability path', () => {
  const NESTED_LIVING = `# Session layout Specification

## Purpose

Real purpose text for the nested session-layout capability.

## Requirements

### Requirement: Session layout

The system SHALL lay out the session shell.

#### Scenario: Lay out a session

- **WHEN** a session opens
- **THEN** the shell is laid out

#### Scenario: Lay out an empty session

- **WHEN** a session opens with no panes
- **THEN** a placeholder shell is laid out
`

  const NESTED_PROPOSAL = `# change

## Why

The session shell is being simplified so the layout path has one shape instead
of two; this narrows the nested session-layout capability to that one shape.

## What Changes

- Simplify the session layout.

## Capabilities

### Modified Capabilities

- platform/session-layout

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

  function buildNested(root: string, name: string, delta: string): void {
    writeFiles(root, {
      ['openspec/specs/platform/session-layout/spec.md']: NESTED_LIVING,
      [`openspec/changes/${name}/.openspec.yaml`]: openspecYamlV2('feat'),
      [`openspec/changes/${name}/proposal.md`]: NESTED_PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/specs/platform/session-layout/spec.md`]: delta,
      [`openspec/changes/${name}/tasks.md`]: TASKS_DONE,
      [`openspec/changes/${name}/verification.md`]: [
        '## 1. Session layout still works [critical]',
        '- [x] 1.1 @e2e open a session end to end -> the shell lays out',
      ].join('\n'),
    })
  }

  test('the scenario-preservation gate fires for a nested capability path', async () => {
    const root = await initRepo()
    buildNested(
      root,
      'thin-nested',
      `## MODIFIED Requirements

### Requirement: Session layout

The system SHALL lay out the session shell.

#### Scenario: Lay out a session

- **WHEN** a session opens
- **THEN** the shell is laid out
`,
    )
    const res = await cospec(['archive', 'thin-nested'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('scenario-preservation')
    // Named by its full capability path, not by the area directory.
    expect(res.stderr).toContain('platform/session-layout: "Session layout"')
    expect(existsSync(join(root, 'openspec/changes/thin-nested'))).toBe(true)
  })

  test('a well-formed nested delta archives and passes the post-merge spot-check', async () => {
    const root = await initRepo()
    buildNested(
      root,
      'nested-ok',
      `## MODIFIED Requirements

### Requirement: Session layout

The system SHALL lay out the session shell promptly.

#### Scenario: Lay out a session

- **WHEN** a session opens
- **THEN** the shell is laid out

#### Scenario: Lay out an empty session

- **WHEN** a session opens with no panes
- **THEN** a placeholder shell is laid out
`,
    )
    const res = await cospec(['archive', 'nested-ok'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(res.stderr).not.toContain('invariant breach')
    const merged = readFileSync(
      join(root, 'openspec/specs/platform/session-layout/spec.md'),
      'utf8',
    )
    expect(merged).toContain('lay out the session shell promptly')
  })
})

// `retire_capabilities: true` (openspec 1.8.0) lets a REMOVED that takes the
// last requirement DELETE the living spec. cospec's step-10 spot-check must
// read that as an intentional retirement, not as a merge that lost a spec.
describe('archive: capability retirement', () => {
  const LIVING_ONE = `# Widgets Specification

## Purpose

Real purpose text for the widgets capability.

## Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

  const RETIRE_PROPOSAL = `# change

## Why

The widget capability is being retired wholesale; nothing depends on it any
more and keeping the spec alive misleads the next reader into building on it.

## What Changes

- Retire the widgets capability.

## Capabilities

### Removed Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

  function buildRetire(root: string, name: string, marker: boolean): void {
    writeFiles(root, {
      ['openspec/specs/widgets/spec.md']: LIVING_ONE,
      [`openspec/changes/${name}/.openspec.yaml`]: `${openspecYamlV2('feat')}${
        marker ? 'retire_capabilities: true\n' : ''
      }`,
      [`openspec/changes/${name}/proposal.md`]: RETIRE_PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/specs/widgets/spec.md`]:
        '## REMOVED Requirements\n\n- `### Requirement: Widget rendering`\n',
      [`openspec/changes/${name}/tasks.md`]: TASKS_DONE,
      [`openspec/changes/${name}/verification.md`]: [
        '## 1. Nothing references widgets [critical]',
        '- [x] 1.1 @manual grep the tree for widget callers -> no references remain',
      ].join('\n'),
    })
  }

  test('with the marker, archive succeeds and reports the retirement', async () => {
    const root = await initRepo()
    buildRetire(root, 'retire-widgets', true)
    const res = await cospec(['archive', 'retire-widgets'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/specs/widgets/spec.md'))).toBe(false)
    expect(res.stdout).toContain('Retired:  widgets')
    // The deleted spec is a warning the user must see, not silent output.
    expect(res.stdout).toContain('Retiring openspec/specs/widgets/spec.md')
    // A legitimate retirement is never reported as an invariant breach.
    expect(res.stderr).not.toContain('invariant breach')
  })

  test('--json reports the retirement and the relayed warnings', async () => {
    const root = await initRepo()
    buildRetire(root, 'retire-widgets', true)
    const res = await cospec(['archive', 'retire-widgets', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as {
      archived: boolean
      retired: string[]
      warnings: string[]
    }
    expect(body.archived).toBe(true)
    expect(body.retired).toEqual(['widgets'])
    expect(body.warnings.some((w) => w.includes('Retiring openspec/specs/widgets/spec.md'))).toBe(
      true,
    )
  })

  test('without the marker openspec refuses and cospec relays the refusal', async () => {
    const root = await initRepo()
    buildRetire(root, 'retire-widgets', false)
    const res = await cospec(['archive', 'retire-widgets'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('retire_capabilities: true')
    expect(existsSync(join(root, 'openspec/specs/widgets/spec.md'))).toBe(true)
    expect(existsSync(join(root, 'openspec/changes/retire-widgets'))).toBe(true)
  })
})
