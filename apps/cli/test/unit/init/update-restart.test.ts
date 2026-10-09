// The update receipt's IDE restart line: upstream's `formatIdeRestart` over
// the detected harnesses' rows. Fixture rows enter through the `table` seam
// only; the four shipped rows never set `requiresIdeRestart`.

import { describe, expect, test } from 'bun:test'

import { updateRestartLine } from '../../../src/commands/update.ts'
import { HARNESS_TABLE, type HarnessAdapter } from '../../../src/harness/adapters.ts'
import { ideRestartLine } from '../../../src/harness/delivery.ts'

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
}

const IDE_SKILLS_ONLY: HarnessAdapter = {
  id: 'ide-skills',
  displayName: 'Fixture IDE, skills only',
  skillsDir: '.ide-skills',
  invocationPrefix: '/',
  bodyDialect: 'shared',
  requiresIdeRestart: true,
  detectionPaths: ['.ide-skills'],
}

const TABLE: readonly HarnessAdapter[] = [...HARNESS_TABLE, IDE_WITH_COMMANDS, IDE_SKILLS_ONLY]

describe('update receipt restart line', () => {
  test('fires for a flagged row, naming commands when it has them', () => {
    expect(updateRestartLine(['claude', 'ide-cmds'], TABLE)).toBe(COMMANDS_LINE)
    expect(updateRestartLine(['ide-skills'], TABLE)).toBe(SKILLS_LINE)
  })

  test('never fires for the four shipped rows', () => {
    const shipped = ['claude', 'codex', 'opencode', 'agents'] as const
    expect(updateRestartLine([...shipped])).toBeUndefined()
    const rows = (HARNESS_TABLE as readonly HarnessAdapter[]).filter((r) =>
      (shipped as readonly string[]).includes(r.id),
    )
    expect(ideRestartLine(rows)).toBeUndefined()
  })
})

describe('restart line under delivery', () => {
  test('commands win only when the delivery writes commands for a flagged row', () => {
    expect(updateRestartLine(['ide-cmds'], TABLE, 'both')).toBe(COMMANDS_LINE)
    expect(updateRestartLine(['ide-cmds'], TABLE, 'commands')).toBe(COMMANDS_LINE)
    expect(updateRestartLine(['ide-cmds'], TABLE, 'skills')).toBe(SKILLS_LINE)
  })

  test('a skills-only flagged row writes nothing under commands, so no line', () => {
    expect(updateRestartLine(['ide-skills'], TABLE, 'commands')).toBeUndefined()
    expect(updateRestartLine(['ide-skills'], TABLE, 'skills')).toBe(SKILLS_LINE)
  })

  test('a flagged row with commands is not outvoted by an unflagged one', () => {
    expect(updateRestartLine(['claude', 'ide-skills'], TABLE, 'commands')).toBeUndefined()
  })
})
