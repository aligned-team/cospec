// vanilla-openspec state (DESIGN §8.3): a pre-existing spec-driven change keeps
// validating/archiving via delegation, and opsx detection + --remove-opsx deletes
// only provably openspec-generated files.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Add the greeting handler
- [x] 1.2 Add a test covering the named-greeting scenario
`

describe('legacy (spec-driven) change via delegation', () => {
  test('cospec validate accepts the vanilla change in legacy mode', async () => {
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    const res = await cospec(['validate', 'add-greeting', '--strict', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const rules = Object.keys(
      (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } }).summary.byRule,
    )
    // Legacy mode is engaged rather than cospec rule families.
    expect(rules).toContain('meta/legacy-schema')
  })

  test('cospec archive delegates and merges the living spec', async () => {
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    writeFiles(root, { 'openspec/changes/add-greeting/tasks.md': TASKS_DONE })
    const res = await cospec(['archive', 'add-greeting'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/add-greeting'))).toBe(false)
    const archived = readdirSync(join(root, 'openspec/changes/archive'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    expect(archived.some((d) => /^\d{4}-\d{2}-\d{2}-add-greeting$/.test(d))).toBe(true)
    expect(existsSync(join(root, 'openspec/specs/greeting/spec.md'))).toBe(true)
  })
})

describe('opsx coexistence + --remove-opsx (DESIGN §2.1, §6.6)', () => {
  test('--remove-opsx deletes only generatedBy:openspec files, adds cospec harness', async () => {
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    // Sanity: the fixture ships openspec-generated opsx files.
    expect(existsSync(join(root, '.claude/skills/openspec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(root, '.claude/commands/opsx/propose.md'))).toBe(true)

    const res = await cospec(
      ['init', '--harness', 'claude', '--remove-opsx', '--no-gate', '--yes'],
      { cwd: root },
    )
    expect(res.exitCode).toBe(0)
    // opsx files removed.
    expect(existsSync(join(root, '.claude/skills/openspec-propose/SKILL.md'))).toBe(false)
    expect(existsSync(join(root, '.claude/commands/opsx/propose.md'))).toBe(false)
    // cospec harness present.
    expect(existsSync(join(root, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(root, '.claude/commands/cospec/propose.md'))).toBe(true)
  })
})
