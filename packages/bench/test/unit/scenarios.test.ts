import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { COSPEC_TYPES } from '../../../../apps/cli/src/core/rules/type-facts.ts'
import { scenarioById, SCENARIOS } from '../../scenarios/index.ts'

const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../scenarios')

describe('scenario registry integrity', () => {
  test('exactly 11 scenarios, one per cospec schema type', () => {
    expect(SCENARIOS).toHaveLength(11)
    expect(COSPEC_TYPES).toHaveLength(11)
  })

  test('ids are unique', () => {
    const ids = SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every cospec schema type is covered by exactly one scenario', () => {
    const types = SCENARIOS.map((s) => s.type).toSorted()
    expect(types).toEqual([...COSPEC_TYPES].toSorted())
  })

  test('scenarioById resolves every registered id and returns undefined otherwise', () => {
    for (const s of SCENARIOS) {
      expect(scenarioById(s.id)).toBe(s)
    }
    expect(scenarioById('not-a-real-scenario')).toBeUndefined()
  })

  test('every fixtureDir exists on disk relative to scenarios/', () => {
    for (const s of SCENARIOS) {
      const abs = join(SCENARIOS_DIR, s.fixtureDir)
      expect(existsSync(abs)).toBe(true)
    }
  })

  test('every prompt is non-empty and carries a BENCH- sentinel ref', () => {
    for (const s of SCENARIOS) {
      expect(s.prompt.trim().length).toBeGreaterThan(0)
      expect(s.prompt).toMatch(/BENCH-[A-Z0-9-]+/)
    }
  })

  test('every title is non-empty', () => {
    for (const s of SCENARIOS) {
      expect(s.title.trim().length).toBeGreaterThan(0)
    }
  })

  test('maxTurns is a positive integer for every scenario', () => {
    for (const s of SCENARIOS) {
      expect(Number.isInteger(s.maxTurns)).toBe(true)
      expect(s.maxTurns).toBeGreaterThan(0)
    }
  })

  test('completed is a function on every scenario', () => {
    for (const s of SCENARIOS) {
      expect(typeof s.completed).toBe('function')
    }
  })

  test('BENCH- sentinel refs are unique across scenarios (no accidental copy-paste)', () => {
    const refs = SCENARIOS.flatMap((s) => s.prompt.match(/BENCH-[A-Z0-9-]+/g) ?? [])
    expect(new Set(refs).size).toBe(refs.length)
  })
})
