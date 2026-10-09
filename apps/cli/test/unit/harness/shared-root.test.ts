import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  availableHarnesses,
  isSharedSkillTargetActive,
  readSharedSkillTarget,
  reconcileSharedSkillTargets,
  resolveSharedSkillWriters,
  SHARED_TARGET_MARKER,
  sharedTargetMarkers,
} from '../../../src/harness/shared-root.ts'
import { row, SHARED_ROOT_TABLE as TABLE } from './shared-root-table.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cospec-shared-root-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function put(relpath: string, content = 'x\n'): void {
  mkdirSync(join(dir, relpath, '..'), { recursive: true })
  writeFileSync(join(dir, relpath), content)
}
const mark = (id: string): void => put(`.agents/skills/${SHARED_TARGET_MARKER}`, `${id}\n`)
const currentSkill = (): void => put('.agents/skills/cospec-explore/SKILL.md')
const rulesFile = (): void => put('.codex/rules/cospec.rules')
const legacyCodexSkill = (): void => put('.codex/skills/cospec-propose/SKILL.md')

const writers = (ids: string[]): string[] =>
  [...resolveSharedSkillWriters(dir, ids, TABLE)].toSorted()

describe('resolveSharedSkillWriters — upstream precedence', () => {
  test('a fresh root with all four selected is written for codex', () => {
    expect(writers(['zed', 'antigravity', 'agents', 'codex'])).toEqual(['codex'])
  })

  test('a row alone on its root is its own writer, whatever the marker says', () => {
    mark('agents')
    expect(writers(['claude', 'antigravity'])).toEqual(['antigravity', 'claude'])
  })

  test('a fresh root without codex falls to the first preferred row in table order', () => {
    expect(writers(['zed', 'agents'])).toEqual(['agents'])
  })

  test('skills-native rows are preferred over a row with a command surface', () => {
    expect(writers(['antigravity', 'zed'])).toEqual(['zed'])
  })

  test('with only command-surface rows selected the pool is every selected row', () => {
    const extra = [...TABLE, row('ag2', { ...TABLE[3]!, id: 'ag2' })]
    expect([...resolveSharedSkillWriters(dir, ['ag2', 'antigravity'], extra)]).toEqual([
      'antigravity',
    ])
  })

  test('the marker wins when it names a preferred selected row', () => {
    mark('zed')
    rulesFile()
    currentSkill()
    expect(writers(['codex', 'agents', 'zed'])).toEqual(['zed'])
  })

  test('a marker naming a row outside the preferred pool is passed over', () => {
    mark('antigravity')
    expect(writers(['antigravity', 'agents'])).toEqual(['agents'])
  })

  test('a marker naming an unselected row is passed over', () => {
    mark('zed')
    expect(writers(['codex', 'agents'])).toEqual(['codex'])
  })

  test("pre-marker evidence: codex's rules file means codex, before existing skills", () => {
    rulesFile()
    currentSkill()
    expect(writers(['agents', 'codex'])).toEqual(['codex'])
  })

  test('pre-marker evidence: a legacy .codex/skills cospec skill means codex', () => {
    legacyCodexSkill()
    currentSkill()
    expect(writers(['agents', 'codex'])).toEqual(['codex'])
  })

  test('an unmarked root already holding a cospec skill keeps agents', () => {
    currentSkill()
    expect(writers(['codex', 'agents'])).toEqual(['agents'])
  })

  test('existing skills without agents selected fall through to codex', () => {
    currentSkill()
    expect(writers(['zed', 'codex'])).toEqual(['codex'])
  })

  test('evidence for an unselected codex is passed over', () => {
    rulesFile()
    expect(writers(['zed', 'agents'])).toEqual(['agents'])
  })

  test('the marker is trimmed, and a blank one is no signal', () => {
    put(`.agents/skills/${SHARED_TARGET_MARKER}`, '  zed \n\n')
    expect(writers(['codex', 'zed'])).toEqual(['zed'])
    put(`.agents/skills/${SHARED_TARGET_MARKER}`, ' \n')
    expect(writers(['codex', 'zed'])).toEqual(['codex'])
  })
})

describe('readSharedSkillTarget', () => {
  test('a missing marker, or a missing root, reads as no signal', () => {
    expect(readSharedSkillTarget(dir, '.agents/skills')).toBeUndefined()
    mkdirSync(join(dir, '.agents/skills'), { recursive: true })
    expect(readSharedSkillTarget(dir, '.agents/skills')).toBeUndefined()
  })

  test('a directory at the marker path reads as no signal', () => {
    mkdirSync(join(dir, `.agents/skills/${SHARED_TARGET_MARKER}`), { recursive: true })
    expect(readSharedSkillTarget(dir, '.agents/skills')).toBeUndefined()
  })

  test('a marker reached through a link leaving the project is not read', () => {
    const outside = mkdtempSync(join(tmpdir(), 'cospec-shared-root-outside-'))
    try {
      writeFileSync(join(outside, SHARED_TARGET_MARKER), 'zed\n')
      symlinkSync(outside, join(dir, '.agents'))
      mkdirSync(join(outside, 'skills'))
      writeFileSync(join(outside, 'skills', SHARED_TARGET_MARKER), 'zed\n')
      expect(readSharedSkillTarget(dir, '.agents/skills')).toBeUndefined()
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('cospec never reads upstream’s .openspec-target', () => {
    put('.agents/skills/.openspec-target', 'zed\n')
    expect(readSharedSkillTarget(dir, '.agents/skills')).toBeUndefined()
    expect(writers(['codex', 'zed'])).toEqual(['codex'])
  })
})

describe('reconcileSharedSkillTargets / isSharedSkillTargetActive — upstream order', () => {
  const active = (): string[] =>
    TABLE.map((r) => r.id).filter((id) => isSharedSkillTargetActive(dir, id, TABLE))

  test('an empty root is the vendor-neutral agents target', () => {
    expect(active()).toEqual(['claude', 'agents'])
  })

  test('the marker names the one active row', () => {
    mark('zed')
    rulesFile()
    expect(active()).toEqual(['claude', 'zed'])
  })

  test("codex's pre-marker evidence makes codex active", () => {
    rulesFile()
    currentSkill()
    expect(active()).toEqual(['claude', 'codex'])
    rmSync(join(dir, '.codex'), { recursive: true })
    legacyCodexSkill()
    expect(active()).toEqual(['claude', 'codex'])
  })

  test('existing skills with no other evidence keep agents', () => {
    currentSkill()
    put('.agent/skills/cospec-propose/SKILL.md')
    expect(active()).toEqual(['claude', 'agents'])
  })

  test('a legacy tree is the writer when the root holds no skills yet', () => {
    put('.agent/skills/cospec-propose/SKILL.md')
    expect(active()).toEqual(['claude', 'antigravity'])
  })

  test('reconcile resolves the given rows only, in table order', () => {
    expect(reconcileSharedSkillTargets(dir, ['zed', 'codex'], TABLE)).toEqual(['codex'])
    mark('agents')
    expect(reconcileSharedSkillTargets(dir, ['zed', 'codex'], TABLE)).toEqual(['codex'])
    expect(reconcileSharedSkillTargets(dir, ['claude', 'zed'], TABLE)).toEqual(['claude', 'zed'])
  })
})

describe('sharedTargetMarkers', () => {
  test('a writer on a root the table shares gets the marker, even selected alone', () => {
    expect(sharedTargetMarkers(new Set(['codex']), TABLE)).toEqual([
      { relpath: `.agents/skills/${SHARED_TARGET_MARKER}`, content: 'codex\n' },
    ])
  })

  test('a writer alone on its root in the table gets none', () => {
    expect(sharedTargetMarkers(new Set(['claude']), TABLE)).toEqual([])
  })
})

describe('availableHarnesses — upstream getAvailableTools', () => {
  const available = (): string[] => availableHarnesses(dir, TABLE)

  test('a bare .agents/ selects nothing; an .agents/skills tree selects only its writer', () => {
    mkdirSync(join(dir, '.agents'))
    expect(available()).toEqual([])
    currentSkill()
    expect(available()).toEqual(['agents'])
    mark('codex')
    expect(available()).toEqual(['codex'])
  })

  test('a non-skills detection path selects its row whoever writes the shared root', () => {
    currentSkill()
    mkdirSync(join(dir, '.zed'))
    put('.agents/workflows/cospec-propose.md')
    expect(available()).toEqual(['agents', 'antigravity', 'zed'])
  })

  test("a legacy .codex/skills tree selects codex as the shared root's writer", () => {
    legacyCodexSkill()
    expect(available()).toEqual(['codex'])
  })
})
