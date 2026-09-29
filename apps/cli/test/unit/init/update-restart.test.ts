// The update receipt's IDE restart line: upstream's `formatIdeRestart` over
// the detected harnesses' rows. Fixture rows enter through the `table` seam
// only; the four shipped rows never set `requiresIdeRestart`.

import { describe, expect, test } from 'bun:test'

import { updateRestartLine } from '../../../src/commands/update.ts'
import {
  HARNESS_NAMES,
  HARNESS_TABLE,
  type HarnessAdapter,
  ideRestartLine,
} from '../../../src/harness/adapters.ts'

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

  test('never fires for the four real rows', () => {
    expect(updateRestartLine([...HARNESS_NAMES])).toBeUndefined()
    expect(ideRestartLine(HARNESS_TABLE)).toBeUndefined()
  })
})
