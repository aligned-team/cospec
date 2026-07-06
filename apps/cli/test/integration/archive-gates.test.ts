// `cospec archive`'s two new hard gates (DESIGN §3.5): `archive/verification-
// incomplete` (after the tasks gate, independent of specs) and
// `archive/scenario-preservation` (before delegating to `openspec archive`,
// specs-bearing changes only). Authors changes directly at `schemaVersion: 2`
// (group 9's `cospec new` stamping) so the v2 gate applies deterministically.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
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

  test('a `Scenario removed:` note excuses the drop and archives normally', async () => {
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
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/thin-widget-ok'))).toBe(false)
  })
})
