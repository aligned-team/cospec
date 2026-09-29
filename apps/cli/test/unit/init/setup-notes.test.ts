// Verification 3.5: the init receipt's closing block is each selected row's
// `setupNote` in selection order, then upstream's single IDE restart line when
// a selected row sets `requiresIdeRestart` (commands winning over skills, as
// upstream's `resolveIdeRestartSurface` decides). Fixture rows enter through
// the `table` seam only, never HARNESS_TABLE.

import { describe, expect, test } from 'bun:test'

import { setupNoteLines } from '../../../src/commands/init.ts'
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
