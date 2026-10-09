// Verification 3.5: the init receipt's closing block is each selected row's
// `setupNote` in selection order, then upstream's single IDE restart line when
// a selected row sets `requiresIdeRestart` (commands winning over skills, as
// upstream's `resolveIdeRestartSurface` decides). Fixture rows enter through
// the `table` seam only, never HARNESS_TABLE.

import { describe, expect, test } from 'bun:test'

import {
  receiptHintLines,
  setupNoteLines,
  sharedSkillsRootLines,
} from '../../../src/commands/init.ts'
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
  const row = (HARNESS_TABLE as readonly HarnessAdapter[]).find((r) => r.id === id)
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

  test('the four shipped rows print their notes in selection order and no restart line', () => {
    // Later rows may carry a restart line or no note; the pinned capture decides those.
    const shipped = ['claude', 'codex', 'opencode', 'agents'] as const
    const reversed = [...shipped].toReversed()
    const lines = setupNoteLines(reversed)
    expect(lines).toEqual(reversed.map(note))
    expect(lines.some((l) => l.startsWith('Restart your IDE'))).toBe(false)
    for (const h of shipped) expect(setupNoteLines([h])).toEqual([note(h)])
  })

  test('no selected harness prints nothing', () => {
    expect(setupNoteLines([])).toEqual([])
  })
})

const sharedLine = (writer: string): string =>
  `         skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for ${writer})`

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

const fixtureLine = (writer: string): string =>
  `         skills for codex/agents/antigravity/zed/shared-fixture share the .agents/skills root (one tree, written for ${writer})`

describe('init receipt shared skills root line', () => {
  test('the shipped rows name every row on the root and the one it was written for', () => {
    expect(sharedSkillsRootLines(['codex'], new Set(['codex']))).toEqual([sharedLine('codex')])
    expect(sharedSkillsRootLines(['agents'], new Set(['agents']))).toEqual([sharedLine('agents')])
    expect(sharedSkillsRootLines(['agents', 'codex'], new Set(['codex']))).toEqual([
      sharedLine('codex'),
    ])
    expect(sharedSkillsRootLines([...HARNESS_NAMES], new Set(['claude', 'codex']))).toEqual([
      sharedLine('codex'),
    ])
  })

  test('rows whose skills root no other row shares print no line', () => {
    expect(sharedSkillsRootLines(['claude'], new Set(['claude']))).toEqual([])
    expect(sharedSkillsRootLines(['opencode', 'claude'], new Set(['opencode', 'claude']))).toEqual(
      [],
    )
    expect(sharedSkillsRootLines([], new Set())).toEqual([])
  })

  test('a third row on the same resolved skills root joins the line, in table order', () => {
    const table = [...HARNESS_TABLE, SHARED_FIXTURE]
    expect(sharedSkillsRootLines(['shared-fixture'], new Set(['shared-fixture']), table)).toEqual([
      fixtureLine('shared-fixture'),
    ])
    expect(sharedSkillsRootLines(['claude', 'codex'], new Set(['claude', 'codex']), table)).toEqual(
      [fixtureLine('codex')],
    )
    expect(sharedSkillsRootLines(['claude'], new Set(['claude']), table)).toEqual([])
  })

  test('two rows on another shared root print their own line, keyed on the root, not an id', () => {
    const left: HarnessAdapter = { ...SHARED_FIXTURE, id: 'left', skillsDir: '.pair' }
    const right: HarnessAdapter = { ...SHARED_FIXTURE, id: 'right', skillsDir: '.pair' }
    expect(sharedSkillsRootLines(['right'], new Set(['right']), [left, right])).toEqual([
      '         skills for left/right share the .pair/skills root (one tree, written for right)',
    ])
  })

  test('a shared root selected with no writer named is an internal error', () => {
    expect(() => sharedSkillsRootLines(['codex'], new Set())).toThrow(
      /^internal: no writer for the \.agents\/skills root/,
    )
  })
})

// Verification 1.6 (harness-receipt-and-doctor-scope): the receipt's two
// closing hint lines are spelled through the first selected row's body dialect
// and invocation prefix, the same respelling its generated bodies get.
const hintLines = (propose: string): string[] => [
  `Try: ${propose} "feat: <what you want to build>"`,
  `Lightweight change? ${propose} "ci: fix release workflow" — 3 short artifacts.`,
]
const SHARED_PROPOSE = '$cospec-propose (Codex) or /cospec-propose (other agents)'

/** A flat-dialect tool whose users type `@` before a command, as Amazon Q's do. */
const AT_PREFIX_ROW: HarnessAdapter = {
  ...IDE_WITH_COMMANDS,
  id: 'at-cmds',
  skillsDir: '.at-cmds',
  commands: { ...IDE_WITH_COMMANDS.commands!, dir: '.at-cmds/commands' },
  invocationPrefix: '@',
  requiresIdeRestart: false,
  detectionPaths: ['.at-cmds'],
}

const SKILLS_ONLY: HarnessAdapter = {
  id: 'skills-only',
  displayName: 'Fixture Skills Tool',
  skillsDir: '.skills-only',
  invocationPrefix: '/',
  bodyDialect: 'skill',
  requiresIdeRestart: false,
  detectionPaths: ['.skills-only'],
}
const SKILL_PREFIX_ROW: HarnessAdapter = {
  ...SKILLS_ONLY,
  id: 'skill-prefix',
  skillInvocationPrefix: '/skill:',
}
const PROSE_ROW: HarnessAdapter = { ...SKILLS_ONLY, id: 'prose-row', bodyDialect: 'prose' }
/** Devin's shape: flat commands, but skills referenced by skill name. */
const SPLIT_DIALECT_ROW: HarnessAdapter = {
  ...AT_PREFIX_ROW,
  id: 'split-dialect',
  invocationPrefix: '/',
  skillDialect: 'skill',
}
const FIXTURES = [...HARNESS_TABLE, SKILLS_ONLY, SKILL_PREFIX_ROW, PROSE_ROW, SPLIT_DIALECT_ROW]

describe('init receipt hint follows the first selected row skill spelling', () => {
  test('a skill-dialect row names its skill behind `/`', () => {
    expect(receiptHintLines(['skills-only'], FIXTURES)).toEqual(hintLines('/cospec-propose'))
  })

  test('a `/skill:` row names its skill behind its prefix', () => {
    expect(receiptHintLines(['skill-prefix'], FIXTURES)).toEqual(hintLines('/skill:cospec-propose'))
  })

  test('a prose row asks the tool by name', () => {
    expect(receiptHintLines(['prose-row'], FIXTURES)).toEqual([
      'Try: ask Fixture Skills Tool to use the cospec-propose skill with "feat: <what you want to build>"',
      'Lightweight change? ask Fixture Skills Tool to use the cospec-propose skill with "ci: fix release workflow" — 3 short artifacts.',
    ])
  })

  test("a row whose skills differ from its commands is spelled by its skills' dialect", () => {
    // Its commands are `/cospec-<id>`; its skills `/cospec-<skill>`: the hint names the skill.
    expect(receiptHintLines(['split-dialect'], FIXTURES)).toEqual(hintLines('/cospec-propose'))
  })
})

describe('init receipt hint follows the first selected harness (verification 1.6)', () => {
  test('claude, all and the claude default keep the canonical /cospec:propose', () => {
    expect(receiptHintLines(['claude'])).toEqual(hintLines('/cospec:propose'))
    expect(receiptHintLines([...HARNESS_NAMES])).toEqual(hintLines('/cospec:propose'))
  })

  test('no selected harness keeps the canonical /cospec:propose', () => {
    expect(receiptHintLines([])).toEqual(hintLines('/cospec:propose'))
  })

  test('opencode names its flat /cospec-propose command', () => {
    expect(receiptHintLines(['opencode'])).toEqual(hintLines('/cospec-propose'))
  })

  test('codex and agents name the shared skill', () => {
    expect(receiptHintLines(['codex'])).toEqual(hintLines(SHARED_PROPOSE))
    expect(receiptHintLines(['agents'])).toEqual(hintLines(SHARED_PROPOSE))
  })

  test('the first id of an explicit list decides', () => {
    expect(receiptHintLines(['opencode', 'claude'])).toEqual(hintLines('/cospec-propose'))
  })

  test("a flat row's own invocation prefix is used", () => {
    expect(receiptHintLines(['at-cmds'], [...HARNESS_TABLE, AT_PREFIX_ROW])).toEqual(
      hintLines('@cospec-propose'),
    )
  })
})
