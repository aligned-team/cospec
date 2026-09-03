// init across the 3 repo states + idempotence + update reconciliation
// (DESIGN §2.1, §2.2, §6.5). Drives the CLI as a subprocess against copies of
// the checked-in fixtures.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, hashTree, listTree, mkTempRepo } from '../fixtures/support.ts'
import { claudeInitPaths } from './support.ts'

afterAll(cleanupAll)

describe('cospec init — repo-state matrix', () => {
  test('state A (fresh): full scaffold with the Claude harness', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    const res = await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const tree = listTree(root)
    for (const path of claudeInitPaths()) expect(tree).toContain(path)
  })

  test('state B (plain): scaffolds openspec + harness, preserves existing files', async () => {
    const root = mkTempRepo({ fixture: 'plain', git: true })
    const res = await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // Pre-existing project files are untouched.
    expect(existsSync(join(root, 'package.json'))).toBe(true)
    expect(existsSync(join(root, 'src/index.ts'))).toBe(true)
    const tree = listTree(root)
    for (const path of claudeInitPaths()) expect(tree).toContain(path)
  })

  test('state C (vanilla openspec): adopt mode leaves changes/specs untouched', async () => {
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    const res = await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // The pre-existing spec-driven change is preserved verbatim.
    expect(existsSync(join(root, 'openspec/changes/add-greeting/proposal.md'))).toBe(true)
    // Schemas are materialized alongside it.
    expect(existsSync(join(root, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
  })

  test('state C: --remove-opsx clears the `.agents/skills/` openspec leftover too', async () => {
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    const leftover = join(root, '.agents/skills/openspec-propose/SKILL.md')
    expect(existsSync(leftover)).toBe(true)
    const res = await cospec(
      ['init', '--harness', 'claude', '--remove-opsx', '--no-gate', '--yes'],
      { cwd: root },
    )
    expect(res.exitCode).toBe(0)
    expect(existsSync(leftover)).toBe(false)
    expect(existsSync(join(root, '.agents/skills/openspec-propose'))).toBe(false)
  })
})

describe('cospec init — idempotence (DESIGN §6.5)', () => {
  test('a second init is a byte-for-byte no-op', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    const before = hashTree(root)
    const res = await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(hashTree(root)).toEqual(before)
  })
})

describe('cospec update — managed-file reconciliation (DESIGN §6.5)', () => {
  test('a user-modified managed file is preserved and a .cospec-new is written', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })

    const schema = join(root, 'openspec/schemas/feat/schema.yaml')
    const skill = join(root, '.claude/skills/cospec-propose/SKILL.md')
    const editedSchema = `${readFileSync(schema, 'utf8')}\n# local hand-edit\n`
    const editedSkill = `${readFileSync(skill, 'utf8')}\n\nLocal hand-edit paragraph.\n`
    writeFileSync(schema, editedSchema)
    writeFileSync(skill, editedSkill)

    const res = await cospec(['update'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // Edits survive.
    expect(readFileSync(schema, 'utf8')).toBe(editedSchema)
    expect(readFileSync(skill, 'utf8')).toBe(editedSkill)
    // Canon version is offered alongside, not silently applied.
    expect(existsSync(`${schema}.cospec-new`)).toBe(true)
    expect(existsSync(`${skill}.cospec-new`)).toBe(true)
  })

  test('update --check exits 1 when a managed file has drifted', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    await cospec(['init', '--harness', 'claude', '--no-gate', '--yes'], { cwd: root })
    const skill = join(root, '.claude/skills/cospec-propose/SKILL.md')
    writeFileSync(skill, `${readFileSync(skill, 'utf8')}\n\nDrifted.\n`)
    const res = await cospec(['update', '--check'], { cwd: root })
    expect(res.exitCode).toBe(1)
  })
})
