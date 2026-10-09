// The pinned binary's `.agents/skills/.openspec-target` marker names the owner of its own
// `openspec-*` skills. It carries no frontmatter and no root guard, so the leftover scan reads
// it by path and shape, and lists it only once no `openspec-*` skill is left for it to describe
// (design decision 12; the opsx-migration-detection spec).

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { findOpsxFiles } from '../../src/commands/init.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

const MARKER = '.agents/skills/.openspec-target'
const OPENSPEC_SKILL = `---
name: openspec-propose
metadata:
  author: openspec
  generatedBy: "1.13.1"
---

Run \`openspec list --json\` first.
`
const USER_SKILL = '---\nname: openspec-mine\n---\n\nMy own skill.\n'

function write(dir: string, rel: string, text: string): void {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), text)
}

function repo(files: Record<string, string>): string {
  const dir = mkTempRepo({ git: true })
  write(dir, 'openspec/config.yaml', 'schema: feat\n')
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text)
  return dir
}

const found = (dir: string): string[] => findOpsxFiles(dir).map((f) => f.relpath)

describe('the .openspec-target marker is an opsx leftover', () => {
  test('listed with the openspec skills it names the owner of', () => {
    const dir = repo({
      [MARKER]: 'codex\n',
      '.agents/skills/openspec-propose/SKILL.md': OPENSPEC_SKILL,
    })
    expect(found(dir)).toEqual([MARKER, '.agents/skills/openspec-propose/SKILL.md'])
  })

  test('listed alone, once its skills are gone', () => {
    expect(found(repo({ [MARKER]: 'agents\n' }))).toEqual([MARKER])
  })

  test('kept while a skill of the user’s own is still under the root', () => {
    const dir = repo({
      [MARKER]: 'codex\n',
      '.agents/skills/openspec-propose/SKILL.md': OPENSPEC_SKILL,
      '.agents/skills/openspec-mine/SKILL.md': USER_SKILL,
    })
    expect(found(dir)).toEqual(['.agents/skills/openspec-propose/SKILL.md'])
  })

  test('a file at that path that does not hold a tool id is the user’s', () => {
    expect(found(repo({ [MARKER]: '# my notes\n\nnot a marker\n' }))).toEqual([])
  })

  test('the same name outside the shared skills root is never a leftover', () => {
    expect(found(repo({ '.claude/skills/.openspec-target': 'claude\n' }))).toEqual([])
  })

  test('cospec’s own marker is never a leftover', () => {
    expect(found(repo({ '.agents/skills/.cospec-target': 'codex\n' }))).toEqual([])
  })

  test('doctor names it, and --remove-opsx removes it and only it beside the skills', async () => {
    const dir = repo({
      [MARKER]: 'codex\n',
      '.agents/skills/openspec-propose/SKILL.md': OPENSPEC_SKILL,
    })
    const env = oracleEnv(mkTempRepo())
    const doctor = await cospec(['doctor', '--json'], { cwd: dir, env })
    const named = (
      JSON.parse(doctor.stdout) as { findings: { check: string; message: string }[] }
    ).findings.filter((f) => f.check === 'opsx-leftover' && f.message.includes(` ${MARKER} `))
    expect(named).toHaveLength(1)

    const run = await cospec(
      ['init', '--harness', 'codex', '--no-gate', '--remove-opsx', '--json'],
      { cwd: dir, env },
    )
    expect(run.exitCode).toBe(0)
    const doc = JSON.parse(run.stdout) as { opsx: { found: string[]; removed: boolean } }
    expect(doc.opsx.found).toContain(MARKER)
    expect(existsSync(join(dir, MARKER))).toBe(false)
    expect(existsSync(join(dir, '.agents/skills/openspec-propose'))).toBe(false)
    expect(readFileSync(join(dir, '.agents/skills/.cospec-target'), 'utf8')).toBe('codex\n')
    expect(existsSync(join(dir, '.agents/skills/cospec-propose/SKILL.md'))).toBe(true)
  })
})
