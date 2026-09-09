import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { computeContentHash } from '../../../src/core/managed-files.ts'
import { migrateLegacySkills } from '../../../src/harness/legacy-skills.ts'

const EMITTED = new Set([
  '.agents/skills/cospec-propose/SKILL.md',
  '.agents/skills/cospec-apply-change/SKILL.md',
])

const DELIM = '-'.repeat(3)

const SKILL_BODY = '\nWorkflow body.\n'

/** Write a legacy `.codex/skills/<name>/SKILL.md` carrying cospec provenance. */
function seedLegacy(
  dir: string,
  name: string,
  opts: { author?: string; edited?: boolean } = {},
): string {
  const author = opts.author ?? 'cospec'
  const onDisk = opts.edited === true ? `${SKILL_BODY}user edit\n` : SKILL_BODY
  const frontmatter = [
    DELIM,
    `name: ${name}`,
    'metadata:',
    `  author: ${author}`,
    '  generatedBy: cospec@0.6.0',
    `  contentHash: ${computeContentHash(SKILL_BODY)}`,
    DELIM,
  ].join('\n')
  const relpath = `.codex/skills/${name}/SKILL.md`
  const abspath = join(dir, relpath)
  mkdirSync(dirname(abspath), { recursive: true })
  writeFileSync(abspath, `${frontmatter}\n${onDisk}`)
  return relpath
}

/** Every file under `root`, repo-relative and sorted. */
function inventory(root: string): string[] {
  const out: string[] = []
  const walk = (abs: string, rel: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(join(abs, entry.name), child)
      else out.push(child)
    }
  }
  walk(root, '')
  return out.toSorted()
}

describe('migrateLegacySkills (.codex/skills to .agents/skills)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cospec-legacy-'))
    mkdirSync(join(dir, '.codex/rules'), { recursive: true })
    writeFileSync(join(dir, '.codex/rules/cospec.rules'), '# rules\n')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test('no-ops when there is no legacy tree', () => {
    expect(migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })).toEqual([])
  })

  test('never migrates when this run rendered no shared-root skills', () => {
    const relpath = seedLegacy(dir, 'cospec-propose')
    const results = migrateLegacySkills(dir, new Set(['.claude/skills/cospec-propose/SKILL.md']), {
      dryRun: false,
      force: false,
    })
    expect(results).toEqual([])
    expect(existsSync(join(dir, relpath))).toBe(true)
  })

  test('removes an unmodified legacy skill and prunes its directory', () => {
    const relpath = seedLegacy(dir, 'cospec-propose')
    const results = migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })
    expect(results).toEqual([{ path: relpath, outcome: 'removed' }])
    expect(existsSync(join(dir, relpath))).toBe(false)
    expect(existsSync(join(dir, '.codex/skills/cospec-propose'))).toBe(false)
    // The skills root is pruned; `.codex/` and its rules file survive.
    expect(existsSync(join(dir, '.codex/skills'))).toBe(false)
    expect(existsSync(join(dir, '.codex/rules/cospec.rules'))).toBe(true)
  })

  test('preserves a user-edited legacy skill and reports it', () => {
    const relpath = seedLegacy(dir, 'cospec-propose', { edited: true })
    const results = migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })
    expect(results).toEqual([{ path: relpath, outcome: 'preserved-modified' }])
    expect(existsSync(join(dir, relpath))).toBe(true)
  })

  test('force removes an edited legacy skill', () => {
    const relpath = seedLegacy(dir, 'cospec-propose', { edited: true })
    const results = migrateLegacySkills(dir, EMITTED, { dryRun: false, force: true })
    expect(results).toEqual([{ path: relpath, outcome: 'removed' }])
    expect(existsSync(join(dir, relpath))).toBe(false)
  })

  test('leaves a skill cospec did not author alone, and does not report it', () => {
    const relpath = seedLegacy(dir, 'cospec-propose', { author: 'someone-else' })
    expect(migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })).toEqual([])
    expect(existsSync(join(dir, relpath))).toBe(true)
  })

  test('never deletes a legacy skill this version no longer renders', () => {
    const relpath = seedLegacy(dir, 'cospec-retired-workflow')
    const results = migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })
    expect(results).toEqual([{ path: relpath, outcome: 'preserved-modified' }])
    expect(existsSync(join(dir, relpath))).toBe(true)
  })

  test('a stray user file keeps the legacy dirs alive', () => {
    seedLegacy(dir, 'cospec-propose')
    writeFileSync(join(dir, '.codex/skills/cospec-propose/notes.md'), 'mine\n')
    writeFileSync(join(dir, '.codex/skills/README.md'), 'mine\n')
    migrateLegacySkills(dir, EMITTED, { dryRun: false, force: false })
    expect(existsSync(join(dir, '.codex/skills/cospec-propose/notes.md'))).toBe(true)
    expect(existsSync(join(dir, '.codex/skills/README.md'))).toBe(true)
    expect(existsSync(join(dir, '.codex/skills/cospec-propose/SKILL.md'))).toBe(false)
  })

  test('dryRun reports the same outcomes and touches nothing', () => {
    const removable = seedLegacy(dir, 'cospec-propose')
    const edited = seedLegacy(dir, 'cospec-apply-change', { edited: true })
    const before = inventory(join(dir, '.codex'))
    const results = migrateLegacySkills(dir, EMITTED, { dryRun: true, force: false })
    expect(results).toEqual([
      { path: edited, outcome: 'preserved-modified' },
      { path: removable, outcome: 'removed' },
    ])
    expect(inventory(join(dir, '.codex'))).toEqual(before)
  })
})
