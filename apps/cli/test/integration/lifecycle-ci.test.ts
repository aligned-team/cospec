// ci lifecycle (DESIGN §8.3): a 3-artifact light change archives via --skip-specs
// with no living-spec writes, and a planted specs/ directory is rejected by
// meta/forbidden-artifact.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorCi } from './support.ts'

afterAll(cleanupAll)

let root: string

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
})

function specsCaps(): string[] {
  const dir = join(root, 'openspec/specs')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}

describe('ci lifecycle', () => {
  test('light change archives with --skip-specs and writes no living specs', async () => {
    authorCi(root, 'add-lint', { tasksDone: true })
    const v = await cospec(['validate', 'add-lint', '--strict'], { cwd: root })
    expect(v.exitCode).toBe(0)

    const archive = await cospec(['archive', 'add-lint'], { cwd: root })
    expect(archive.exitCode).toBe(0)
    expect(existsSync(join(root, 'openspec/changes/add-lint'))).toBe(false)
    // No spec merge occurred — the ci type declares no specs artifact.
    expect(specsCaps()).toEqual([])
  })

  test('a planted specs/ dir on a ci change fails meta/forbidden-artifact', async () => {
    authorCi(root, 'bad-ci', { tasksDone: true })
    writeFiles(root, {
      'openspec/changes/bad-ci/specs/thing/spec.md':
        '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n',
    })
    const res = await cospec(['validate', 'bad-ci', '--strict', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    let rules: string[] = []
    try {
      rules = Object.keys(
        (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } }).summary.byRule,
      )
    } catch {
      /* leave empty */
    }
    expect(rules).toContain('meta/forbidden-artifact')
  })
})
