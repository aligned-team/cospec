// `cospec schemas` / `cospec schema which|validate` / `cospec templates`
// (WI-6) — read-only passthroughs over the disciplined plumbing landed in
// WI-1. Drives the CLI as a subprocess against a freshly-initialized repo so
// the 11 canon-managed schemas are on disk to inspect.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

let root: string

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
})

describe('cospec schemas', () => {
  test('--json lists the 11 cospec types', async () => {
    const res = await cospec(['schemas', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as Array<{ name: string; source: string }>
    const names = parsed.map((s) => s.name).toSorted()
    const cospecTypes = [
      'build',
      'chore',
      'ci',
      'docs',
      'feat',
      'fix',
      'perf',
      'refactor',
      'revert',
      'style',
      'test',
    ]
    for (const t of cospecTypes) expect(names).toContain(t)
    // Every cospec type resolves from the project (canon-managed), not the
    // package fallback (`spec-driven`).
    for (const entry of parsed)
      if (cospecTypes.includes(entry.name)) expect(entry.source).toBe('project')
  })

  test('human mode relays plain-text output', async () => {
    const res = await cospec(['schemas'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(/feat/)
  })
})

describe('cospec schema which', () => {
  test('--json shows where a schema resolves from', async () => {
    const res = await cospec(['schema', 'which', 'feat', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as { name: string; source: string; path: string }
    expect(parsed.name).toBe('feat')
    expect(parsed.source).toBe('project')
  })

  test('--all --json lists every schema with its source', async () => {
    const res = await cospec(['schema', 'which', '--all', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as Array<{ name: string }>
    expect(parsed.map((s) => s.name)).toContain('feat')
  })

  test('unknown schema name fails without crashing the JSON contract', async () => {
    const res = await cospec(['schema', 'which', 'nope', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const parsed = JSON.parse(res.stdout) as { error: string }
    expect(parsed.error).toMatch(/not found/)
  })
})

describe('cospec schema validate', () => {
  test('validates a generated schema clean', async () => {
    const res = await cospec(['schema', 'validate', 'feat', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as { name: string; valid: boolean; issues: unknown[] }
    expect(parsed.name).toBe('feat')
    expect(parsed.valid).toBe(true)
    expect(parsed.issues).toEqual([])
  })
})

describe('cospec schema fork/init — canon-managed guidance, no side effects', () => {
  test('fork prints not-supported guidance, exits 1, and touches no schema on disk', async () => {
    const before = existsSync(join(root, 'openspec/schemas/forked-schema'))
    expect(before).toBe(false)
    const res = await cospec(['schema', 'fork', 'feat', 'forked-schema'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toMatch(/canon-managed/)
    expect(existsSync(join(root, 'openspec/schemas/forked-schema'))).toBe(false)
  })

  test('init prints not-supported guidance, exits 1, and touches no schema on disk', async () => {
    const res = await cospec(['schema', 'init', 'new-schema'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toMatch(/canon-managed/)
    expect(existsSync(join(root, 'openspec/schemas/new-schema'))).toBe(false)
  })

  test('missing subcommand fails without calling the wrapped binary', async () => {
    const res = await cospec(['schema'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toMatch(/missing subcommand/)
  })
})

describe('cospec templates', () => {
  test('--schema feat --json maps every feat artifact to a project template path', async () => {
    const res = await cospec(['templates', '--schema', 'feat', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as Record<string, { path: string; source: string }>
    expect(parsed.proposal?.source).toBe('project')
    expect(existsSync(parsed.proposal!.path)).toBe(true)
    expect(parsed.tasks?.source).toBe('project')
  })
})
