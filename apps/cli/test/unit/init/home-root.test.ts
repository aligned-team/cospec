// A row whose skills root is home-relative (`globalSkillsDir`, MiniMax Code's shape) is a managed
// root (design decision 8): `generate()` writes it under USERPROFILE, else HOME, removes an
// orphaned skill there only on frontmatter provenance, and a dry run reads it without writing.
// The row is a fixture; the env is set per test and restored, so the real home is never read.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { detectHarnesses, generate } from '../../../src/commands/update.ts'
import type { HarnessAdapter, HarnessName } from '../../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'
import { availableHarnesses } from '../../../src/harness/shared-root.ts'
import { cleanup, makeRepo, managedMarkdown } from './helpers.ts'

const ROW: HarnessAdapter = {
  id: 'home-fixture',
  displayName: 'Fixture tool with a home skills root',
  globalSkillsDir: '.home-fixture',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: [],
}
const OPTS = { harnesses: [ROW.id as HarnessName], adapters: [ROW] }
const SKILLS = readWorkflowManifest().workflows.map((w) => w.skill)

/** Every file under `dir`, relative to it; empty when `dir` is absent. */
function tree(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => {
      const child = rel === '' ? e.name : `${rel}/${e.name}`
      return e.isDirectory() ? tree(dir, child) : [child]
    })
    .toSorted()
}

const skillFile = (root: string, skill: string): string =>
  join(root, '.home-fixture/skills', skill, 'SKILL.md')

describe('a home-relative skills root is a managed root', () => {
  let dir: string
  let home: string
  let profile: string
  let saved: { HOME?: string; USERPROFILE?: string }
  beforeEach(() => {
    dir = makeRepo()
    home = makeRepo()
    profile = makeRepo()
    saved = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }
    process.env.HOME = home
    delete process.env.USERPROFILE
  })
  afterEach(() => {
    for (const key of ['HOME', 'USERPROFILE'] as const) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    for (const d of [dir, home, profile]) cleanup(d)
  })

  test('writes every skill under HOME when USERPROFILE is unset', () => {
    const { results, failed } = generate(dir, OPTS)
    expect(failed).toEqual([])
    for (const skill of SKILLS) expect(existsSync(skillFile(home, skill))).toBe(true)
    expect(tree(dir).filter((p) => p.includes('.home-fixture'))).toEqual([])
    const written = results.filter((r) => r.path.includes('.home-fixture'))
    expect(written).toHaveLength(SKILLS.length)
    for (const r of written) {
      expect(r.outcome).toBe('created')
      expect(r.path.startsWith(join(home, '.home-fixture/skills'))).toBe(true)
    }
  })

  test('USERPROFILE wins over HOME', () => {
    process.env.USERPROFILE = profile
    generate(dir, OPTS)
    for (const skill of SKILLS) expect(existsSync(skillFile(profile, skill))).toBe(true)
    expect(tree(home)).toEqual([])
    expect(tree(dir).filter((p) => p.includes('.home-fixture'))).toEqual([])
  })

  test('a dry run reads the home root and writes nothing under it', () => {
    const before = generate(dir, { ...OPTS, dryRun: true })
    expect(before.results.filter((r) => r.path.includes('.home-fixture'))).toHaveLength(
      SKILLS.length,
    )
    expect(tree(home)).toEqual([])

    generate(dir, OPTS)
    const file = skillFile(home, SKILLS[0]!)
    const old = new Date('2020-01-01T00:00:00Z')
    utimesSync(file, old, old)
    const again = generate(dir, { ...OPTS, dryRun: true })
    for (const r of again.results.filter((x) => x.path.includes('.home-fixture'))) {
      expect(r.outcome).toBe('unchanged')
    }
    expect(statSync(file).mtimeMs).toBe(old.getTime())
  })

  test('an orphaned cospec skill is removed, a user skill and a dry run keep theirs', () => {
    generate(dir, OPTS)
    const retired = skillFile(home, 'cospec-retired')
    const mine = skillFile(home, 'my-skill')
    mkdirSync(join(retired, '..'), { recursive: true })
    mkdirSync(join(mine, '..'), { recursive: true })
    writeFileSync(retired, managedMarkdown('cospec-retired', 'gone from canon'))
    writeFileSync(mine, '---\nname: my-skill\n---\nmy own skill\n')

    const dry = generate(dir, { ...OPTS, dryRun: true })
    expect(dry.results.filter((r) => r.outcome === 'removed').map((r) => r.path)).toEqual([retired])
    expect(existsSync(retired)).toBe(true)

    const run = generate(dir, OPTS)
    expect(run.results.filter((r) => r.outcome === 'removed').map((r) => r.path)).toEqual([retired])
    expect(existsSync(retired)).toBe(false)
    expect(readFileSync(mine, 'utf8')).toContain('my own skill')
  })

  test('a hand-edited home skill is kept beside a sidecar, --force restores canon', () => {
    generate(dir, OPTS)
    const file = skillFile(home, SKILLS[0]!)
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nmy edit\n`)

    const kept = generate(dir, OPTS)
    const entry = kept.results.find((r) => r.path === file)
    expect(entry?.outcome).toBe('preserved-modified')
    expect(existsSync(`${file}.cospec-new`)).toBe(true)
    expect(readFileSync(file, 'utf8')).toContain('my edit')

    const forced = generate(dir, { ...OPTS, force: true })
    expect(forced.results.find((r) => r.path === file)?.outcome).toBe('forced')
    expect(readFileSync(file, 'utf8')).not.toContain('my edit')
  })

  test('update detects the row from a cospec skill in the home root', () => {
    expect(detectHarnesses(dir, [ROW])).toEqual([])
    mkdirSync(join(skillFile(home, 'my-skill'), '..'), { recursive: true })
    writeFileSync(skillFile(home, 'my-skill'), '---\nname: my-skill\n---\nmine\n')
    expect(detectHarnesses(dir, [ROW])).toEqual([])
    generate(dir, OPTS)
    expect(detectHarnesses(dir, [ROW])).toEqual([ROW.id as HarnessName])
  })

  test('init selects the row from a cospec- or OpenSpec-authored skill, not a user one', () => {
    const plant = (skill: string, author: string): void => {
      mkdirSync(join(skillFile(home, skill), '..'), { recursive: true })
      writeFileSync(
        skillFile(home, skill),
        `---\nname: ${skill}\nmetadata:\n  author: ${author}\n---\nbody\n`,
      )
    }
    expect(availableHarnesses(dir, [ROW])).toEqual([])
    plant('openspec-propose', 'someone-else')
    expect(availableHarnesses(dir, [ROW])).toEqual([])
    plant('openspec-propose', 'openspec')
    expect(availableHarnesses(dir, [ROW])).toEqual([ROW.id])
    cleanup(join(home, '.home-fixture'))
    plant('cospec-propose', 'cospec')
    expect(availableHarnesses(dir, [ROW])).toEqual([ROW.id])
  })
})
