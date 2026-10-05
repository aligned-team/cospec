// Verification 3.5: the init receipt's closing block is each selected row's
// `setupNote` in selection order, then upstream's single IDE restart line when
// a selected row sets `requiresIdeRestart` (commands winning over skills, as
// upstream's `resolveIdeRestartSurface` decides). Fixture rows enter through
// the `table` seam only, never HARNESS_TABLE.

import { describe, expect, test } from 'bun:test'

import { setupNoteLines, sharedSkillsRootLines } from '../../../src/commands/init.ts'
import { HARNESS_NAMES, HARNESS_TABLE, type HarnessAdapter } from '../../../src/harness/adapters.ts'

const COMMANDS_LINE = 'Restart your IDE to refresh commands.'
const SKILLS_LINE = 'Restart your IDE to refresh skills.'

const IDE_WITH_COMMANDS: HarnessAdapter = {
  id: 'ide-cmds',
  displayName: 'Fixture IDE with commands',
  skillsDir: '.ide-cmds',
  commands: {
    dir: '.ide-cmds/commands',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.md',
    serializer: 'markdown',
    frontmatter: (w) => ({ description: w.description }),
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: true,
  detectionPaths: ['.ide-cmds'],
  setupNote: 'Fixture IDE: open the command palette once.',
}

const IDE_SKILLS_ONLY: HarnessAdapter = {
  id: 'ide-skills',
  displayName: 'Fixture IDE, skills only',
  skillsDir: '.ide-skills',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: true,
  detectionPaths: ['.ide-skills'],
  setupNote: 'Fixture skills IDE: skills load at startup.',
}

const BARE_IDE: HarnessAdapter = {
  id: 'ide-bare',
  displayName: 'Fixture IDE with no setup note',
  skillsDir: '.ide-bare',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: true,
  detectionPaths: ['.ide-bare'],
}

const TABLE: readonly HarnessAdapter[] = [
  ...HARNESS_TABLE,
  IDE_WITH_COMMANDS,
  IDE_SKILLS_ONLY,
  BARE_IDE,
]

function note(id: string): string {
  const row = HARNESS_TABLE.find((r) => r.id === id)
  if (row?.setupNote === undefined) throw new Error(`fixture: ${id} has no setupNote`)
  return row.setupNote
}

describe('init receipt setup notes (verification 3.5)', () => {
  test('a flagged row with commands, beside a real row: both notes, then one commands line', () => {
    expect(setupNoteLines(['claude', 'ide-cmds'], TABLE)).toEqual([
      note('claude'),
      IDE_WITH_COMMANDS.setupNote!,
      COMMANDS_LINE,
    ])
  })

  test('a flagged skills-only row, beside a real row: the restart line names skills', () => {
    expect(setupNoteLines(['ide-skills', 'codex'], TABLE)).toEqual([
      IDE_SKILLS_ONLY.setupNote!,
      note('codex'),
      SKILLS_LINE,
    ])
  })

  test('several flagged rows print exactly one restart line, commands winning', () => {
    const lines = setupNoteLines(['ide-skills', 'agents', 'ide-cmds'], TABLE)
    expect(lines).toEqual([
      IDE_SKILLS_ONLY.setupNote!,
      note('agents'),
      IDE_WITH_COMMANDS.setupNote!,
      COMMANDS_LINE,
    ])
    expect(lines.filter((l) => l.startsWith('Restart your IDE'))).toHaveLength(1)
  })

  test('a flagged row with no setupNote still drives the restart line', () => {
    expect(setupNoteLines(['opencode', 'ide-bare'], TABLE)).toEqual([note('opencode'), SKILLS_LINE])
  })

  test('the four real rows print their notes in selection order and no restart line', () => {
    const reversed = [...HARNESS_NAMES].toReversed()
    const lines = setupNoteLines(reversed)
    expect(lines).toEqual(reversed.map(note))
    expect(lines.some((l) => l.startsWith('Restart your IDE'))).toBe(false)
    for (const h of HARNESS_NAMES) expect(setupNoteLines([h])).toEqual([note(h)])
  })

  test('no selected harness prints nothing', () => {
    expect(setupNoteLines([])).toEqual([])
  })
})

const SHARED_LINE =
  '         skills for codex/agents share the .agents/skills root (identical files)'

/** A third tool reading the vendor-neutral `.agents/skills` root, as Zed does upstream. */
const SHARED_FIXTURE: HarnessAdapter = {
  id: 'shared-fixture',
  displayName: 'Fixture tool on the shared .agents root',
  skillsDir: '.agents',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: false,
  detectionPaths: ['.shared-fixture'],
}

describe('init receipt shared skills root line', () => {
  test("the four rows print today's line whenever codex or agents is selected", () => {
    expect(sharedSkillsRootLines(['codex'])).toEqual([SHARED_LINE])
    expect(sharedSkillsRootLines(['agents'])).toEqual([SHARED_LINE])
    expect(sharedSkillsRootLines(['agents', 'codex'])).toEqual([SHARED_LINE])
    expect(sharedSkillsRootLines([...HARNESS_NAMES])).toEqual([SHARED_LINE])
  })

  test('rows whose skills root no other row shares print no line', () => {
    expect(sharedSkillsRootLines(['claude'])).toEqual([])
    expect(sharedSkillsRootLines(['opencode', 'claude'])).toEqual([])
    expect(sharedSkillsRootLines([])).toEqual([])
  })

  test('a third row on the same resolved skills root joins the line, in table order', () => {
    const table = [...HARNESS_TABLE, SHARED_FIXTURE]
    const line =
      '         skills for codex/agents/shared-fixture share the .agents/skills root (identical files)'
    expect(sharedSkillsRootLines(['shared-fixture'], table)).toEqual([line])
    expect(sharedSkillsRootLines(['claude', 'codex'], table)).toEqual([line])
    expect(sharedSkillsRootLines(['claude'], table)).toEqual([])
  })

  test('two rows on another shared root print their own line, keyed on the root, not an id', () => {
    const left: HarnessAdapter = { ...SHARED_FIXTURE, id: 'left', skillsDir: '.pair' }
    const right: HarnessAdapter = { ...SHARED_FIXTURE, id: 'right', skillsDir: '.pair' }
    expect(sharedSkillsRootLines(['right'], [left, right])).toEqual([
      '         skills for left/right share the .pair/skills root (identical files)',
    ])
  })
})
