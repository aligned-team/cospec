// `archive/added-exists` vs the pinned openspec binary (re-probed at 1.11.0).
//
// openspec 1.7.0's early-sync pattern: an ADDED block whose normalized raw text
// matches the living requirement of the same name means the spec was already
// synced to the baseline, so re-applying it is a no-op and `openspec archive`
// completes at exit 0. Only a DIFFERING body is a genuine collision, which the
// binary refuses with `ADDED failed for header … - already exists`.
//
// cospec used to flag both shapes on name membership alone — a recorded
// conservatism that blocked an archive the binary performs. It now compares the
// two blocks with a verbatim port of openspec's `normalizeBlockRaw` (CRLF fold
// plus one outer trim, nothing more). This file pins BOTH halves against the
// real binary, because the relaxed half is exactly where a false archive PASS
// would hide: the second test is the guard that the relaxation did not swallow
// a real collision.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { writeLivingSpec } from './fixtures.ts'

afterAll(cleanupAll)

const PROPOSAL = `# change

## Why

The widgets spec was written into the living baseline ahead of the archive, so
this change restates the requirement it already carries; without restating it
the delta would not describe the capability at all.

## What Changes

- Restate the widget rendering requirement.

## Capabilities

### New Capabilities

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

- [x] 1.1 Restate the requirement
`

const REQUIREMENT_BLOCK = `### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const LIVING = `# Widgets Specification

## Purpose

Real purpose text.

## Requirements

${REQUIREMENT_BLOCK}`

/** An ADDED delta whose block is identical to the living requirement. */
const IDENTICAL_DELTA = `## ADDED Requirements

${REQUIREMENT_BLOCK}`

/** The same name, a different body — the genuine collision. */
const DIFFERING_DELTA = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested, and cache it.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a cached widget is rendered
`

function build(root: string, name: string, delta: string): void {
  writeLivingSpec(root, 'widgets', LIVING)
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

describe('archive/added-exists early sync vs the pinned openspec binary', () => {
  test('an identical ADDED block: the real binary archives it at exit 0', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'sync-widget', IDENTICAL_DELTA)
    const res = await openspec(['archive', 'sync-widget', '-y'], root)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).not.toContain('already exists')
    expect(existsSync(join(root, 'openspec/changes/sync-widget'))).toBe(false)
    // The living spec still carries exactly the one requirement, unduplicated.
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect((living.match(/^###\s+Requirement:/gm) ?? []).length).toBe(1)
  })

  test('an identical ADDED block: cospec agrees and archives it too', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'sync-widget', IDENTICAL_DELTA)
    const validated = await cospec(['validate', 'sync-widget', '--strict', '--json'], { cwd: root })
    expect(validated.exitCode).toBe(0)
    expect(validated.stdout).not.toContain('archive/added-exists')

    const res = await cospec(['archive', 'sync-widget'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/sync-widget'))).toBe(false)
    // openspec files the archived change under a date-stamped directory name.
    expect(
      readdirSync(join(root, 'openspec/changes/archive')).some((d) => d.endsWith('sync-widget')),
    ).toBe(true)
  })

  test('a differing ADDED body: the real binary refuses and changes nothing', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'collide-widget', DIFFERING_DELTA)
    const res = await openspec(['archive', 'collide-widget', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('already exists')
    expect(res.stdout).toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/collide-widget'))).toBe(true)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(living).not.toContain('and cache it')
  })

  test('a differing ADDED body: cospec still refuses it, before delegating', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'collide-widget', DIFFERING_DELTA)
    const validated = await cospec(['validate', 'collide-widget', '--strict', '--json'], {
      cwd: root,
    })
    expect(validated.exitCode).not.toBe(0)
    const byRule = (JSON.parse(validated.stdout) as { summary: { byRule: Record<string, number> } })
      .summary.byRule
    expect(Object.keys(byRule)).toContain('archive/added-exists')

    const res = await cospec(['archive', 'collide-widget'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(existsSync(join(root, 'openspec/changes/collide-widget'))).toBe(true)
  })
})
