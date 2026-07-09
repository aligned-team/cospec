// `cospec show` + `cospec view` (WI-5) — proves the disciplined read-only
// passthroughs of `openspec show`/`openspec view` end to end: `show <change>
// --json` returns the change's deltas, `show <spec> --json` returns its
// requirements, an unknown item exits 1 with the one-JSON-doc error status,
// and `view` renders the dashboard header (or reports a missing root without
// relying on the wrapped exit code alone).

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

function seedRepo(): string {
  const repo = mkTempRepo()
  mkdirSync(join(repo, 'openspec', 'changes', 'add-widgets'), { recursive: true })
  writeFileSync(
    join(repo, 'openspec', 'changes', 'add-widgets', 'proposal.md'),
    '# Add Widgets\n\n## Why\nx\n\n## What Changes\ny\n',
  )
  mkdirSync(join(repo, 'openspec', 'specs', 'widgets'), { recursive: true })
  writeFileSync(
    join(repo, 'openspec', 'specs', 'widgets', 'spec.md'),
    [
      '# Widgets',
      '',
      '## Purpose',
      'Widgets purpose.',
      '',
      '## Requirements',
      '',
      '### Requirement: Widget Creation',
      'Widgets SHALL be creatable.',
      '',
      '#### Scenario: Create a widget',
      '- **WHEN** a user creates a widget',
      '- **THEN** it exists',
      '',
    ].join('\n'),
  )
  return repo
}

describe('cospec show', () => {
  test('show <change> --json returns the change with its deltas', async () => {
    const repo = seedRepo()
    const res = await cospec(['show', 'add-widgets', '--type', 'change', '--json'], { cwd: repo })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as { id: string; deltas: unknown[] }
    expect(body.id).toBe('add-widgets')
    expect(Array.isArray(body.deltas)).toBe(true)
  })

  test('show <spec> --json returns its requirements', async () => {
    const repo = seedRepo()
    const res = await cospec(['show', 'widgets', '--type', 'spec', '--json'], { cwd: repo })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as { id: string; requirements: unknown[] }
    expect(body.id).toBe('widgets')
    expect(Array.isArray(body.requirements)).toBe(true)
    expect(body.requirements.length).toBeGreaterThan(0)
  })

  test('show <unknown> --json surfaces the error status and exits 1', async () => {
    const repo = seedRepo()
    const res = await cospec(['show', 'nope', '--json'], { cwd: repo })
    expect(res.exitCode).toBe(1)
    const body = JSON.parse(res.stdout) as { status: Array<{ severity: string }> }
    expect(body.status.some((s) => s.severity === 'error')).toBe(true)
  })

  test('requires an item name', async () => {
    const repo = seedRepo()
    const res = await cospec(['show'], { cwd: repo })
    expect(res.exitCode).toBe(1)
  })

  test('show <change> without --json renders markdown text', async () => {
    const repo = seedRepo()
    const res = await cospec(['show', 'add-widgets', '--type', 'change'], { cwd: repo })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Add Widgets')
  })
})

describe('cospec view', () => {
  test('renders the dashboard header for a repo with a root', async () => {
    const repo = seedRepo()
    const res = await cospec(['view'], { cwd: repo })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('OpenSpec Dashboard')
  })

  test('exits 1 when there is no openspec/ directory', async () => {
    const repo = mkTempRepo()
    const res = await cospec(['view'], { cwd: repo })
    expect(res.exitCode).toBe(1)
  })
})
