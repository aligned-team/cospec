// End-to-end lifecycle tests against the real dependency-resolved openspec
// 1.3.1 binary (the same path production uses). Exercises the clear-gate apply
// payload, the ci skip-specs archive, and the feat archive verifier + spec merge
// spot-check + blocker fan-out (DESIGN §5.1–5.2). These spawn subprocesses.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { run as applyRun } from '../../../src/commands/apply.ts'
import { run as archiveRun } from '../../../src/commands/archive.ts'
import { run as instructionsRun } from '../../../src/commands/instructions.ts'
import {
  ctx,
  DONE_TASKS,
  EMPTY_BLOCKERS,
  LITE_PROPOSAL,
  makeRepo,
  runCmd,
  writeChange,
} from './helpers.ts'

const roots: string[] = []
function repo(): string {
  const dir = makeRepo()
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const FEAT_PROPOSAL = `## Why

We need a widget capability so downstream changes can render widgets. Nothing provides this today and several changes are waiting on it to land first.

## What Changes

- Add a widget capability

## Capabilities

### New Capabilities

- widgets

## Impact

- New module src/widgets.ts

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const WIDGET_DELTA = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a widget is requested
- **THEN** it is rendered
`

describe('apply clear gate (openspec instructions payload)', () => {
  test('exit 0 with a merged gate + apply payload', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { json: true }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as {
      gate: { state: string }
      apply: { state: string }
    }
    expect(parsed.gate.state).toBe('clear')
    expect(parsed.apply.state).toBe('all_done')
  })

  test('instructions apply is an alias for the apply gate', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(instructionsRun, ctx(cwd, ['apply', '--change', 'c'], { json: true }))
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out).gate.state).toBe('clear')
  })
})

describe('archive: ci skip-specs', () => {
  test('archives, reports skipped specs, moves the dir', async () => {
    const cwd = repo()
    writeChange(cwd, 'try-it', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['try-it'], { json: true }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as { archived: boolean; specs: string; target: string }
    expect(parsed.archived).toBe(true)
    expect(parsed.specs).toBe('skipped')
    expect(existsSync(join(cwd, 'openspec', 'changes', 'try-it'))).toBe(false)
    expect(parsed.target).toMatch(/^\d{4}-\d{2}-\d{2}-try-it$/)
  })
})

describe('archive: feat verifier + spec merge + blocker fan-out', () => {
  test('merges the ADDED delta, spot-checks it, and unblocks the sibling', async () => {
    const cwd = repo()
    writeChange(cwd, 'add-widget', 'feat', {
      'proposal.md': FEAT_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'specs/widgets/spec.md': WIDGET_DELTA,
      'tasks.md': DONE_TASKS,
    })
    const usesDir = writeChange(cwd, 'uses-widget', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': `# Dependencies\n\n## Blocked by\n\n- [ ] \`add-widget\` — provides the widget capability\n\n## Soft-blocked by\n\nNone.\n`,
      'tasks.md': DONE_TASKS,
    })

    const r = await runCmd(archiveRun, ctx(cwd, ['add-widget'], { json: true }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as {
      archived: boolean
      specs: { added: number }
      blockers: { checkedOff: string[]; nowUnblocked: string[] }
    }
    expect(parsed.archived).toBe(true)
    expect(parsed.specs.added).toBe(1)
    expect(parsed.blockers.checkedOff).toContain('uses-widget')
    expect(parsed.blockers.nowUnblocked).toContain('uses-widget')

    // Living spec merged (date-agnostic archive dir present).
    const living = join(cwd, 'openspec', 'specs', 'widgets', 'spec.md')
    expect(existsSync(living)).toBe(true)
    expect(readFileSync(living, 'utf8')).toContain('### Requirement: Widget rendering')
    const archived = readdirSync(join(cwd, 'openspec', 'changes', 'archive'))
    expect(archived.some((d) => /^\d{4}-\d{2}-\d{2}-add-widget$/.test(d))).toBe(true)

    // Sibling blocker was checked off with the archived date stamp.
    const siblingBlockers = readFileSync(join(usesDir, 'blocking-changes.md'), 'utf8')
    expect(siblingBlockers).toMatch(/- \[x\] `add-widget`.*\*\(archived \d{4}-\d{2}-\d{2}\)\*/)
  })
})
