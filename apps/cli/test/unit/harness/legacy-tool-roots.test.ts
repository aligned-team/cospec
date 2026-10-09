// The port of the pinned binary's `migrateLegacyToolDirs` (design decision 9), through the
// `table` seam: antigravity's `.agent` root is exercised here because its row lands in task 8.3.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  buildOpencodeCommandFrontmatter,
  type HarnessAdapter,
} from '../../../src/harness/adapters.ts'
import {
  canAskLegacyConsent,
  consentLegacyMoves,
  legacyMoveLines,
  moveLegacyToolRoots,
} from '../../../src/harness/legacy-skills.ts'
import { row } from './shared-root-table.ts'

const TABLE: readonly HarnessAdapter[] = [
  row('kimi', {
    skillsDir: '.kimi-code',
    legacyToolRoots: [{ root: '.kimi', needsConsent: false }],
    detectionPaths: ['.kimi-code', '.kimi'],
  }),
  row('devin', {
    skillsDir: '.devin',
    legacyToolRoots: [{ root: '.windsurf', needsConsent: true }],
    detectionPaths: ['.devin', '.windsurf'],
    commands: {
      dir: '.devin/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
  }),
  row('antigravity', {
    legacySkillsDirs: ['.agent'],
    legacyToolRoots: [{ root: '.agent', needsConsent: false, timing: 'after-generation' }],
    commands: {
      dir: '.agents/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
  }),
]

const skill = (version: string, body = 'Body.\n'): string =>
  `---\nname: openspec-propose\nmetadata:\n  author: openspec\n  generatedBy: "${version}"\n---\n\n${body}`

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cospec-legacy-roots-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function put(rel: string, text: string): void {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}
const has = (rel: string): boolean => existsSync(join(dir, rel))
const read = (rel: string): string => readFileSync(join(dir, rel), 'utf8')

describe('moveLegacyToolRoots', () => {
  test('without a tool list, only roots needing no consent move', () => {
    put('.kimi/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    put('.windsurf/workflows/opsx-apply.md', 'opsx apply\n')
    const moves = moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      dryRun: false,
      table: TABLE,
    })
    expect(moves.map((m) => m.toolId)).toEqual(['kimi'])
    expect(has('.kimi')).toBe(false)
    expect(has('.kimi-code/skills/openspec-propose/SKILL.md')).toBe(true)
    expect(has('.windsurf/workflows/opsx-apply.md')).toBe(true)
  })

  test('a dry run reports every root, consent-gated ones included, and moves nothing', () => {
    put('.kimi/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    put('.windsurf/workflows/opsx-apply.md', 'opsx apply\n')
    const moves = moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      dryRun: true,
      table: TABLE,
    })
    expect(moves.map((m) => [m.toolId, m.skillDirs, m.commandFiles])).toEqual([
      ['kimi', 1, 0],
      ['devin', 0, 1],
    ])
    expect(has('.kimi/skills/openspec-propose/SKILL.md')).toBe(true)
  })

  test('only OpenSpec-named files move; a user skill and an unknown command stay', () => {
    put('.windsurf/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    put('.windsurf/skills/openspec-propose/notes.md', 'mine\n')
    put('.windsurf/skills/my-skill/SKILL.md', 'mine\n')
    put('.windsurf/workflows/opsx-mine.md', 'mine\n')
    moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      toolIds: ['devin'],
      dryRun: false,
      table: TABLE,
    })
    expect(has('.devin/skills/openspec-propose/SKILL.md')).toBe(true)
    expect(has('.windsurf/skills/openspec-propose/notes.md')).toBe(true)
    expect(has('.windsurf/skills/my-skill/SKILL.md')).toBe(true)
    expect(has('.windsurf/workflows/opsx-mine.md')).toBe(true)
  })

  test('an identical destination drops the legacy copy; a generatedBy-only difference too', () => {
    put('.kimi/skills/openspec-propose/SKILL.md', skill('1.12.0'))
    put('.kimi-code/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    const [move] = moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      dryRun: false,
      table: TABLE,
    })
    expect(move!.entries).toEqual([
      {
        path: '.kimi/skills/openspec-propose/SKILL.md',
        outcome: 'removed',
        to: '.kimi-code/skills/openspec-propose/SKILL.md',
      },
    ])
    expect(read('.kimi-code/skills/openspec-propose/SKILL.md')).toBe(skill('1.13.1'))
    expect(has('.kimi')).toBe(false)
  })

  test('a differing destination keeps both and is reported', () => {
    put('.kimi/skills/openspec-propose/SKILL.md', skill('1.13.1', 'Mine.\n'))
    put('.kimi-code/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    const moves = moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      dryRun: false,
      table: TABLE,
    })
    expect(moves[0]!.keptInPlace).toBe(1)
    expect(read('.kimi/skills/openspec-propose/SKILL.md')).toBe(skill('1.13.1', 'Mine.\n'))
    expect(legacyMoveLines(moves, false)).toEqual([
      'Left 1 file in .kimi/ that differs from the copy in .kimi-code/. Nothing was ' +
        'overwritten — compare the two and delete the .kimi/ copy once you have kept ' +
        'anything you customized.',
    ])
  })

  test('a legacy root symlinked to the current one is never treated as a duplicate', () => {
    put('.kimi-code/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    symlinkSync(join(dir, '.kimi-code'), join(dir, '.kimi'))
    expect(
      moveLegacyToolRoots(dir, { timing: 'before-generation', dryRun: false, table: TABLE }),
    ).toEqual([])
    expect(read('.kimi-code/skills/openspec-propose/SKILL.md')).toBe(skill('1.13.1'))
  })

  test('after generation, a file moves only once cospec emitted its replacement', () => {
    put('.agent/skills/openspec-propose/SKILL.md', skill('1.13.1'))
    put('.agent/skills/openspec-explore/SKILL.md', skill('1.13.1'))
    put('.agent/workflows/opsx-propose.md', 'propose\n')
    put('.agent/workflows/opsx-explore.md', 'explore\n')
    const emitted = new Set([
      '.agents/skills/cospec-propose/SKILL.md',
      '.agents/workflows/cospec-propose.md',
    ])
    const before = moveLegacyToolRoots(dir, {
      timing: 'before-generation',
      toolIds: ['antigravity'],
      dryRun: false,
      table: TABLE,
    })
    expect(before).toEqual([])
    const [move] = moveLegacyToolRoots(dir, {
      timing: 'after-generation',
      toolIds: ['antigravity'],
      emitted,
      dryRun: false,
      table: TABLE,
    })
    expect([move!.skillDirs, move!.commandFiles]).toEqual([1, 1])
    expect(has('.agents/skills/openspec-propose/SKILL.md')).toBe(true)
    expect(has('.agents/workflows/opsx-propose.md')).toBe(true)
    expect(has('.agent/skills/openspec-explore/SKILL.md')).toBe(true)
    expect(has('.agent/workflows/opsx-explore.md')).toBe(true)
  })

  test('a tool not in the list is left alone', () => {
    put('.windsurf/workflows/opsx-apply.md', 'opsx apply\n')
    expect(
      moveLegacyToolRoots(dir, {
        timing: 'before-generation',
        toolIds: ['kimi'],
        dryRun: false,
        table: TABLE,
      }),
    ).toEqual([])
  })
})

describe('update consent', () => {
  test('asked only on a terminal, without --json and without --force', () => {
    const base = { stdinIsTTY: true, stdoutIsTTY: true, json: false, force: false }
    expect(canAskLegacyConsent(base)).toBe(true)
    expect(canAskLegacyConsent({ ...base, stdinIsTTY: false })).toBe(false)
    expect(canAskLegacyConsent({ ...base, stdoutIsTTY: false })).toBe(false)
    expect(canAskLegacyConsent({ ...base, json: true })).toBe(false)
    expect(canAskLegacyConsent({ ...base, force: true })).toBe(false)
  })

  test('"no" leaves .windsurf in place and reports it', () => {
    put('.windsurf/workflows/opsx-apply.md', 'opsx apply\n')
    const asked: string[] = []
    const moves = consentLegacyMoves(dir, {
      interactive: true,
      ask: (question) => {
        asked.push(question)
        return false
      },
      table: TABLE,
    })
    expect(asked).toEqual(['Move 1 command from .windsurf/ to .devin/?'])
    expect(has('.windsurf/workflows/opsx-apply.md')).toBe(true)
    expect(moves[0]!.declined).toBe(true)
    expect(moves[0]!.entries).toEqual([
      {
        path: '.windsurf/workflows/opsx-apply.md',
        outcome: 'declined',
        to: '.devin/workflows/opsx-apply.md',
      },
    ])
    expect(legacyMoveLines(moves, false)).toEqual([
      'Left in place: 1 command in .windsurf/ stays where it is until you move it. ' +
        'You will be asked again next run.',
    ])
  })

  test('without a terminal it moves without asking', () => {
    put('.windsurf/workflows/opsx-apply.md', 'opsx apply\n')
    const moves = consentLegacyMoves(dir, {
      interactive: false,
      ask: () => {
        throw new Error('must not ask')
      },
      table: TABLE,
    })
    expect(has('.devin/workflows/opsx-apply.md')).toBe(true)
    expect(legacyMoveLines(moves, false)).toEqual(['Migrated 1 command: .windsurf → .devin'])
  })
})
