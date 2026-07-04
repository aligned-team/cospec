import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import {
  type ArtifactState,
  composeAllTypes,
  composeSchema,
  composeTemplates,
  composeType,
  COSPEC_TYPES,
  getTypeInfo,
  type ProposalVariant,
  serializeSchema,
  TYPE_TABLE,
  validateComposedSchema,
} from '../../../src/core/schema-compose.ts'

const GOLDEN_DIR = join(import.meta.dir, 'golden')

function golden(type: string): string {
  return readFileSync(join(GOLDEN_DIR, `${type}.schema.yaml`), 'utf8')
}

/** The frozen DESIGN §3.2 matrix, asserted programmatically. */
interface MatrixRow {
  proposal: ProposalVariant
  specs: ArtifactState
  design: ArtifactState
  applyRequires: string[]
}

const MATRIX: Record<string, MatrixRow> = {
  feat: {
    proposal: 'full',
    specs: 'required',
    design: 'optional',
    applyRequires: ['proposal', 'blocking-changes', 'specs', 'tasks'],
  },
  fix: {
    proposal: 'full',
    specs: 'optional',
    design: 'optional',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  perf: {
    proposal: 'full',
    specs: 'optional',
    design: 'optional',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  refactor: {
    proposal: 'full',
    specs: 'optional',
    design: 'required',
    applyRequires: ['proposal', 'blocking-changes', 'design', 'tasks'],
  },
  revert: {
    proposal: 'full',
    specs: 'optional',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  build: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  ci: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  chore: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  docs: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  style: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  test: {
    proposal: 'lite',
    specs: 'forbidden',
    design: 'forbidden',
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
}

describe('canon coverage', () => {
  test('exactly the 11 conventional-commit types', () => {
    expect(([...COSPEC_TYPES] as string[]).toSorted()).toEqual(
      [
        'build',
        'chore',
        'ci',
        'docs',
        'feat',
        'fix',
        'perf',
        'refactor',
        'revert',
        'style',
        'test',
      ].toSorted(),
    )
    expect(COSPEC_TYPES).toHaveLength(11)
  })
})

describe('golden schema.yaml snapshots (11)', () => {
  for (const type of COSPEC_TYPES) {
    test(`${type} composes byte-for-byte to its committed golden`, () => {
      expect(composeType(type).schemaYaml).toBe(golden(type))
    })
  }

  test('serializeSchema round-trips through composeSchema', () => {
    for (const type of COSPEC_TYPES) {
      expect(serializeSchema(composeSchema(type))).toBe(golden(type))
    }
  })
})

describe('structural validity (openspec Zod shape)', () => {
  for (const type of COSPEC_TYPES) {
    test(`${type} golden parses to a valid schema shape`, () => {
      const doc = parse(golden(type)) as {
        name: string
        version: number
        description: string
        artifacts: {
          id: string
          generates: string
          template: string
          instruction: string
          requires: string[]
        }[]
        apply: { requires: string[]; tracks: string; instruction: string }
      }
      expect(doc.name).toBe(type)
      expect(doc.version).toBe(1)
      expect(typeof doc.description).toBe('string')
      expect(doc.artifacts.length).toBeGreaterThanOrEqual(1)
      const ids = new Set(doc.artifacts.map((a) => a.id))
      for (const a of doc.artifacts) {
        expect(a.generates.length).toBeGreaterThan(0)
        expect(a.template.length).toBeGreaterThan(0)
        expect(a.instruction.length).toBeGreaterThan(0)
        for (const r of a.requires) expect(ids.has(r)).toBe(true)
      }
      expect(doc.apply.requires.length).toBeGreaterThanOrEqual(1)
      for (const r of doc.apply.requires) expect(ids.has(r)).toBe(true)
      expect(doc.apply.tracks).toBe('tasks.md')
    })
  }

  test('validateComposedSchema accepts every composed type', () => {
    for (const type of COSPEC_TYPES) {
      expect(() => validateComposedSchema(composeSchema(type))).not.toThrow()
    }
  })

  test('validateComposedSchema rejects a cyclic requires graph', () => {
    const bad = composeSchema('feat')
    bad.artifacts[0]!.requires = ['tasks'] // proposal ← tasks ← ... ← proposal
    expect(() => validateComposedSchema(bad)).toThrow(/cyclic/)
  })

  test('validateComposedSchema rejects a dangling requires target', () => {
    const bad = composeSchema('feat')
    bad.artifacts[1]!.requires = ['ghost']
    expect(() => validateComposedSchema(bad)).toThrow(/does not exist/)
  })
})

describe('DESIGN §3.2 artifact matrix', () => {
  for (const type of COSPEC_TYPES) {
    test(`${type} matches the frozen matrix`, () => {
      const row = MATRIX[type]!
      const info = getTypeInfo(type)!
      const schema = composeSchema(type)
      const declared = schema.artifacts.map((a) => a.id)

      // proposal variant
      expect(info.proposalVariant).toBe(row.proposal)

      // declared set = non-forbidden artifacts, in canonical order
      const expectedDeclared = ['proposal', 'blocking-changes']
      if (row.specs !== 'forbidden') expectedDeclared.push('specs')
      if (row.design !== 'forbidden') expectedDeclared.push('design')
      expectedDeclared.push('tasks')
      expect(declared).toEqual(expectedDeclared)

      // forbidden set
      const expectedForbidden: string[] = []
      if (row.specs === 'forbidden') expectedForbidden.push('specs')
      if (row.design === 'forbidden') expectedForbidden.push('design')
      expect(([...info.forbiddenArtifacts] as string[]).toSorted()).toEqual(
        expectedForbidden.toSorted(),
      )

      // apply.requires
      expect(schema.apply.requires).toEqual(row.applyRequires)
      expect(info.requiredArtifacts).toEqual(row.applyRequires)
      expect(info.artifactCount).toBe(row.applyRequires.length)

      // optional = declared minus apply.requires
      const expectedOptional = expectedDeclared.filter((id) => !row.applyRequires.includes(id))
      expect(([...info.optionalArtifacts] as string[]).toSorted()).toEqual(
        expectedOptional.toSorted(),
      )

      // tasks.requires: proposal + specs(if required) + design(if required)
      const tasks = schema.artifacts.find((a) => a.id === 'tasks')!
      const expectedTasksReq = ['proposal']
      if (row.specs === 'required') expectedTasksReq.push('specs')
      if (row.design === 'required') expectedTasksReq.push('design')
      expect(tasks.requires).toEqual(expectedTasksReq)
    })
  }

  test('feat is the only type gated on specs (MF5)', () => {
    for (const type of COSPEC_TYPES) {
      const gated = composeSchema(type).apply.requires.includes('specs')
      expect(gated).toBe(type === 'feat')
    }
  })

  test('refactor is the only type gated on design', () => {
    for (const type of COSPEC_TYPES) {
      const gated = composeSchema(type).apply.requires.includes('design')
      expect(gated).toBe(type === 'refactor')
    }
  })
})

describe('templates', () => {
  for (const type of COSPEC_TYPES) {
    test(`${type} emits the template file for each declared artifact`, () => {
      const templates = composeTemplates(type)
      const row = MATRIX[type]!
      const expected = ['proposal.md', 'blocking-changes.md', 'tasks.md']
      if (row.specs !== 'forbidden') expected.push('spec.md')
      if (row.design !== 'forbidden') expected.push('design.md')
      expect(Object.keys(templates).toSorted()).toEqual(expected.toSorted())
      for (const body of Object.values(templates)) expect(body.length).toBeGreaterThan(0)

      // every schema template: reference has a corresponding file
      for (const a of composeSchema(type).artifacts) {
        expect(templates[a.template]).toBeDefined()
      }
    })
  }

  test('lite types get the 6-line lite proposal template; full types get the full one', () => {
    expect(composeTemplates('ci')['proposal.md']).toContain('<!-- One or two sentences. -->')
    expect(composeTemplates('feat')['proposal.md']).toContain('### New Capabilities')
  })
})

describe('single-source instruction sharing', () => {
  test('apply.instruction is identical across all 11 types', () => {
    const bodies = new Set(composeAllTypes().map((c) => c.schema.apply.instruction))
    expect(bodies.size).toBe(1)
    expect([...bodies][0]).toContain('cospec apply "<change>" --json')
  })

  test('the full blocking-changes instruction is shared verbatim by every full type', () => {
    const fullTypes = ['feat', 'fix', 'perf', 'refactor', 'revert']
    const bodies = new Set(
      fullTypes.map(
        (t) => composeSchema(t).artifacts.find((a) => a.id === 'blocking-changes')!.instruction,
      ),
    )
    expect(bodies.size).toBe(1)
    expect([...bodies][0]).toContain('PROCESS — do all of these before writing the artifact:')
  })

  test('lite blocking substitutes {{type}} and {{domain}} — never leaves a placeholder', () => {
    for (const t of ['build', 'chore', 'ci', 'docs', 'style', 'test']) {
      const instr = composeSchema(t).artifacts.find((a) => a.id === 'blocking-changes')!.instruction
      expect(instr).not.toContain('{{')
      expect(instr).toContain(`Most ${t} changes are independent.`)
    }
  })
})

describe('type table (frozen export)', () => {
  test('one row per type, in COSPEC_TYPES order', () => {
    expect(TYPE_TABLE.map((t) => t.type)).toEqual([...COSPEC_TYPES])
  })

  test('every row carries the three fields harness rendering consumes', () => {
    for (const row of TYPE_TABLE) {
      expect(typeof row.type).toBe('string')
      expect(row.description.length).toBeGreaterThan(0)
      expect(row.summary.length).toBeGreaterThan(0)
    }
  })

  test('descriptions and summaries match the canon type files', () => {
    const feat = getTypeInfo('feat')!
    expect(feat.description).toBe('A new feature — the full workflow')
    expect(feat.summary).toBe('proposal → blocking-changes, specs (+ design) → tasks')
    const ci = getTypeInfo('ci')!
    expect(ci.description).toBe('CI configuration and automation pipeline change')
    expect(ci.summary).toBe('proposal → blocking-changes → tasks (3 short artifacts)')
  })

  test('getTypeInfo returns undefined for a non-cospec type', () => {
    expect(getTypeInfo('wip')).toBeUndefined()
  })
})

describe('perf / revert special sections are reachable in prose', () => {
  test('perf proposal instruction requires ## Benchmarks', () => {
    expect(composeSchema('perf').artifacts[0]!.instruction).toContain('## Benchmarks')
  })

  test('revert proposal instruction requires ## Reverts', () => {
    expect(composeSchema('revert').artifacts[0]!.instruction).toContain('## Reverts')
  })
})
