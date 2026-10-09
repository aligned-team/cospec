// The home skills root of a home-scoped row (`minimax-code`, `globalSkillsDir: .minimax`), run
// through the built CLI under a private HOME (7.1, 7.2). Every case points HOME, and where it
// is set USERPROFILE, at temp dirs, so nothing here reads or writes the real home directory.
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

const SKILLS = '.minimax/skills'

/** The cospec skills (a `cospec-*` directory holding a SKILL.md) under `home`, sorted. */
function cospecSkills(home: string): string[] {
  const root = join(home, SKILLS)
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => name.startsWith('cospec-') && existsSync(join(root, name, 'SKILL.md')))
    .toSorted()
}

/** Every file under `dir` with its mtime, sorted, for "read, not written" checks. */
function mtimes(dir: string, rel = ''): [string, number][] {
  const abs = join(dir, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((entry): [string, number][] => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) return mtimes(dir, child)
      return [[child, statSync(join(dir, child)).mtimeMs]]
    })
    .toSorted((a, b) => a[0].localeCompare(b[0]))
}

describe('minimax-code writes its skills under the home directory (7.1)', () => {
  test('HOME alone: twelve skills under <HOME>/.minimax/skills and none in the project', async () => {
    const home = mkTempRepo()
    const project = mkTempRepo({ git: true })
    const res = await cospec(['init', '--harness', 'minimax-code', '--no-gate', '--yes'], {
      cwd: project,
      env: { HOME: home },
      unset: ['USERPROFILE'],
    })
    expect(res.exitCode).toBe(0)
    expect(cospecSkills(home)).toHaveLength(12)
    expect(existsSync(join(project, '.minimax'))).toBe(false)
  }, 120_000)

  test('USERPROFILE wins over HOME: skills land under <USERPROFILE>/.minimax/skills only', async () => {
    const home = mkTempRepo()
    const profile = mkTempRepo()
    const project = mkTempRepo({ git: true })
    const res = await cospec(['init', '--harness', 'minimax-code', '--no-gate', '--yes'], {
      cwd: project,
      env: { HOME: home, USERPROFILE: profile },
    })
    expect(res.exitCode).toBe(0)
    expect(cospecSkills(profile)).toHaveLength(12)
    expect(cospecSkills(home)).toHaveLength(0)
  }, 120_000)
})

describe('update and doctor read the home root and remove only cospec orphans (7.2)', () => {
  test('--check and doctor leave the home root unwritten; an orphaned cospec skill goes, a user skill stays', async () => {
    const home = mkTempRepo()
    const project = mkTempRepo({ git: true })
    const env = { HOME: home }
    const unset = ['USERPROFILE']
    const init = await cospec(['init', '--harness', 'minimax-code', '--no-gate', '--yes'], {
      cwd: project,
      env,
      unset,
    })
    expect(init.exitCode).toBe(0)

    const before = mtimes(join(home, '.minimax'))
    const check = await cospec(['update', '--check', '--json'], { cwd: project, env, unset })
    expect(check.exitCode).toBe(0)
    const doctor = await cospec(['doctor', '--json'], { cwd: project, env, unset })
    expect(doctor.exitCode).toBe(0)
    expect(mtimes(join(home, '.minimax'))).toEqual(before)

    // An orphan carrying cospec's own provenance, and a user's skill beside it.
    const live = join(home, SKILLS, cospecSkills(home)[0]!, 'SKILL.md')
    const orphanDir = join(home, SKILLS, 'cospec-retired')
    const userDir = join(home, SKILLS, 'my-own-skill')
    mkdirSync(orphanDir, { recursive: true })
    mkdirSync(userDir, { recursive: true })
    writeFileSync(join(orphanDir, 'SKILL.md'), readFileSync(live, 'utf8'))
    writeFileSync(join(userDir, 'SKILL.md'), '---\nname: my-own-skill\n---\nmine\n')

    const update = await cospec(['update', '--json'], { cwd: project, env, unset })
    expect(update.exitCode).toBe(0)
    expect(existsSync(join(orphanDir, 'SKILL.md'))).toBe(false)
    expect(readFileSync(join(userDir, 'SKILL.md'), 'utf8')).toContain('mine')
    expect(cospecSkills(home)).toHaveLength(12)
  }, 120_000)
})
