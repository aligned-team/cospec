// Delivery (workflow-profiles design D5): the four predicates of the pinned binary's
// `core/command-surface.js` restated over cospec's rows, the shared-root rule, the
// skills-only reference spelling, and the zero-artifact receipt line. Each row's capability is
// derived from its own data, so a row added later is classified here with no edit.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import {
  adapterFor,
  HARNESS_TABLE,
  type HarnessAdapter,
  transformBody,
} from '../../../src/harness/adapters.ts'
import {
  commandSurfaceCapability,
  DELIVERIES,
  type Delivery,
  shouldGenerateCommands,
  shouldGenerateSkills,
  shouldReconcileCommandFiles,
  shouldRemoveSkills,
  skillReferenceSpelling,
  skillsRootGenerated,
  zeroArtifactLine,
} from '../../../src/harness/delivery.ts'
import { readWorkflowManifest, skillByWorkflowId } from '../../../src/harness/render.ts'

const surface = (await import(join(openspecPackageDir(), 'dist/core/command-surface.js'))) as {
  resolveCommandSurfaceCapability: (toolId: string) => string
  shouldGenerateSkillsForTool: (toolId: string, delivery: Delivery) => boolean
  shouldRemoveSkillsForTool: (toolId: string, delivery: Delivery) => boolean
  shouldGenerateCommandsForTool: (toolId: string, delivery: Delivery) => boolean
  shouldReconcileCommandFilesForTool: (toolId: string, delivery: Delivery) => boolean
}

const { AI_TOOLS } = (await import(join(openspecPackageDir(), 'dist/core/config.js'))) as {
  AI_TOOLS: { value: string }[]
}
const UPSTREAM_IDS = new Set(AI_TOOLS.map((t) => t.value))
const ROWS: readonly HarnessAdapter[] = HARNESS_TABLE

const skillById = skillByWorkflowId(readWorkflowManifest())

/** Fixture rows, one per capability, never entered into HARNESS_TABLE. */
const FIXTURE_ADAPTER_BACKED: HarnessAdapter = {
  id: 'fixture-commands',
  displayName: 'Fixture Commands',
  skillsDir: '.fixture-commands',
  commands: {
    dir: '.fixture-commands/commands',
    namespacing: 'flat',
    file: 'cospec-{command}',
    extension: '.md',
    serializer: 'plain',
  },
  invocationPrefix: '/',
  bodyDialect: 'flat',
  requiresIdeRestart: false,
  detectionPaths: ['.fixture-commands'],
}
const FIXTURE_NONE: HarnessAdapter = {
  id: 'fixture-skills',
  displayName: 'Fixture Skills',
  skillsDir: '.fixture-skills',
  invocationPrefix: '/',
  bodyDialect: 'skill',
  requiresIdeRestart: false,
  detectionPaths: ['.fixture-skills'],
}

describe('capability', () => {
  test('every row is classified from its commands surface and codex', () => {
    for (const row of ROWS) {
      const expected =
        row.commands !== undefined
          ? 'adapter-backed'
          : row.id === 'codex'
            ? 'skills-invocable'
            : 'none'
      expect({ id: row.id, capability: commandSurfaceCapability(row) }).toEqual({
        id: row.id,
        capability: expected,
      })
    }
  })

  test('every row upstream knows has upstream capability', () => {
    for (const row of ROWS.filter((r) => UPSTREAM_IDS.has(r.id))) {
      expect({ id: row.id, capability: commandSurfaceCapability(row) }).toEqual({
        id: row.id,
        capability: surface.resolveCommandSurfaceCapability(row.id),
      })
    }
  })

  test('the three capabilities each have a shipped row', () => {
    const seen = new Set(ROWS.map(commandSurfaceCapability))
    expect([...seen].toSorted()).toEqual(['adapter-backed', 'none', 'skills-invocable'])
  })

  test('fixture rows classify by their data', () => {
    expect(commandSurfaceCapability(FIXTURE_ADAPTER_BACKED)).toBe('adapter-backed')
    expect(commandSurfaceCapability(FIXTURE_NONE)).toBe('none')
  })
})

describe('the four predicates', () => {
  test('DELIVERIES is the binary schema enum', () => {
    expect([...DELIVERIES].toSorted()).toEqual(['both', 'commands', 'skills'])
  })

  test('each predicate equals the binary over every upstream row and delivery', () => {
    for (const row of ROWS.filter((r) => UPSTREAM_IDS.has(r.id))) {
      for (const delivery of DELIVERIES) {
        expect({
          id: row.id,
          delivery,
          skills: shouldGenerateSkills(row, delivery),
          remove: shouldRemoveSkills(row, delivery),
          commands: shouldGenerateCommands(row, delivery),
          reconcile: shouldReconcileCommandFiles(row, delivery),
        }).toEqual({
          id: row.id,
          delivery,
          skills: surface.shouldGenerateSkillsForTool(row.id, delivery),
          remove: surface.shouldRemoveSkillsForTool(row.id, delivery),
          commands: surface.shouldGenerateCommandsForTool(row.id, delivery),
          reconcile: surface.shouldReconcileCommandFilesForTool(row.id, delivery),
        })
      }
    }
  })

  test('an adapter-backed fixture row', () => {
    const row = FIXTURE_ADAPTER_BACKED
    expect(
      DELIVERIES.map((d) => [d, shouldGenerateSkills(row, d), shouldGenerateCommands(row, d)]),
    ).toEqual([
      ['both', true, true],
      ['skills', true, false],
      ['commands', false, true],
    ])
    expect(shouldRemoveSkills(row, 'commands')).toBe(true)
    expect(shouldReconcileCommandFiles(row, 'skills')).toBe(true)
  })

  test('a skills-invocable row keeps its skills under commands', () => {
    const codex = adapterFor('codex')
    expect(shouldGenerateSkills(codex, 'commands')).toBe(true)
    expect(shouldRemoveSkills(codex, 'commands')).toBe(false)
    expect(shouldGenerateCommands(codex, 'both')).toBe(false)
  })

  test('a none fixture row gets nothing under commands', () => {
    expect(shouldGenerateSkills(FIXTURE_NONE, 'commands')).toBe(false)
    expect(shouldGenerateCommands(FIXTURE_NONE, 'commands')).toBe(false)
    expect(shouldRemoveSkills(FIXTURE_NONE, 'commands')).toBe(true)
  })
})

describe('shared skills root', () => {
  const codex = adapterFor('codex')
  const agents = adapterFor('agents')

  test('codex and agents share one root', () => {
    expect(codex.skillsDir).toBe(agents.skillsDir)
  })

  test('generated when any row sharing it generates skills', () => {
    expect(skillsRootGenerated([codex, agents], 'commands')).toBe(true)
    expect(skillsRootGenerated([agents, codex], 'commands')).toBe(true)
    expect(skillsRootGenerated([agents], 'commands')).toBe(false)
    expect(skillsRootGenerated([agents], 'skills')).toBe(true)
  })
})

describe('skillReferenceSpelling', () => {
  const spell = (row: HarnessAdapter): string => {
    const { dialect, prefix } = skillReferenceSpelling(row)
    return transformBody('use /cospec:apply now', dialect, skillById, prefix)
  }

  test('the default is /<skill>, for a canonical row', () => {
    expect(spell(adapterFor('claude'))).toBe('use /cospec-apply-change now')
  })

  test('the default is /<skill>, for a flat row', () => {
    expect(spell(adapterFor('cursor'))).toBe('use /cospec-apply-change now')
  })

  test('an @-prefixed row still gets the default slash, as upstream', () => {
    expect(spell(adapterFor('amazon-q'))).toBe('use /cospec-apply-change now')
  })

  test('the shared root stays dual-spelled', () => {
    expect(spell(adapterFor('codex'))).toBe(
      'use $cospec-apply-change (Codex) or /cospec-apply-change (other agents) now',
    )
  })

  test('Kimi Code keeps /skill:', () => {
    expect(spell(adapterFor('kimi'))).toBe('use /skill:cospec-apply-change now')
  })

  test('a natural-language tool with commands names the skill', () => {
    expect(spell(adapterFor('codeassistant'))).toBe('use the cospec-apply-change skill now')
  })

  test('a natural-language tool without commands names the skill', () => {
    expect(spell(adapterFor('rovodev'))).toBe('use the cospec-apply-change skill now')
  })

  test('a row whose skills already use skill references keeps them', () => {
    expect(spell(adapterFor('devin'))).toBe('use /cospec-apply-change now')
  })
})

describe('zeroArtifactLine', () => {
  const kimi = adapterFor('kimi')
  const rovodev = adapterFor('rovodev')
  const claude = adapterFor('claude')

  test('one row that gets nothing', () => {
    expect(zeroArtifactLine([claude, kimi], 'commands')).toBe(
      `No skills or commands were generated for ${kimi.displayName}: delivery is set to ` +
        "'commands' but it supports only skills. Run 'cospec config set delivery both' to " +
        'generate skills.',
    )
  })

  test('several rows that get nothing', () => {
    expect(zeroArtifactLine([kimi, rovodev], 'commands')).toBe(
      `No skills or commands were generated for ${kimi.displayName}, ${rovodev.displayName}: ` +
        "delivery is set to 'commands' but they support only skills. Run 'cospec config set " +
        "delivery both' to generate skills.",
    )
  })

  test('no line when every row gets something', () => {
    expect(zeroArtifactLine([claude, adapterFor('codex')], 'commands')).toBeUndefined()
    expect(zeroArtifactLine([kimi], 'both')).toBeUndefined()
    expect(zeroArtifactLine([kimi], 'skills')).toBeUndefined()
  })
})
