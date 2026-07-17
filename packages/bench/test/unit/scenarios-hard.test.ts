// Registry integrity for the opt-in `-hard` scenario variants (see
// `scenarios/index.ts`'s `HARD_SCENARIOS`) — deliberately a SEPARATE file
// from `scenarios.test.ts` so that file's "exactly 11, one per cospec type"
// invariant over `SCENARIOS` stays untouched: these extras live on
// `ALL_SCENARIOS` instead, and share a base cospec `type` with their regular
// counterpart by design (id != type is intentional — see `scenarios/types.ts`
// and this change's tasks.md).

import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALL_SCENARIOS, HARD_SCENARIOS, scenarioById, SCENARIOS } from '../../scenarios/index.ts'

const SCENARIOS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../scenarios')

const HEAVY_TYPES = ['feat', 'fix', 'perf', 'refactor', 'revert'] as const

describe('HARD_SCENARIOS registry integrity', () => {
  test('exactly 5 hard variants, one per heavy type', () => {
    expect(HARD_SCENARIOS).toHaveLength(5)
    expect(HARD_SCENARIOS.map((s) => s.type).toSorted()).toEqual([...HEAVY_TYPES].toSorted())
  })

  test('every hard variant id is suffixed -hard', () => {
    for (const s of HARD_SCENARIOS) {
      expect(s.id.endsWith('-hard')).toBe(true)
      expect(s.id).toBe(`${s.type}-hard`)
    }
  })

  test('a hard variant shares its base type with the regular scenario of the same type', () => {
    for (const hard of HARD_SCENARIOS) {
      const base = SCENARIOS.find((s) => s.type === hard.type)
      expect(base).toBeDefined()
      expect(base?.id).not.toBe(hard.id)
      expect(base?.type).toBe(hard.type)
    }
  })

  test("does NOT weaken SCENARIOS' own 11-core invariant", () => {
    expect(SCENARIOS).toHaveLength(11)
  })

  test('ALL_SCENARIOS is exactly SCENARIOS + HARD_SCENARIOS, ids unique across the union', () => {
    expect(ALL_SCENARIOS).toHaveLength(16)
    const ids = ALL_SCENARIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('scenarioById resolves both core and hard ids', () => {
    for (const s of ALL_SCENARIOS) expect(scenarioById(s.id)).toBe(s)
    expect(scenarioById('not-a-real-scenario')).toBeUndefined()
  })

  test('every hard variant fixtureDir exists on disk relative to scenarios/', () => {
    for (const s of HARD_SCENARIOS) {
      expect(existsSync(join(SCENARIOS_DIR, s.fixtureDir))).toBe(true)
    }
  })

  test('every hard variant has maxTurns 150 (higher ceiling for a multi-file task)', () => {
    for (const s of HARD_SCENARIOS) expect(s.maxTurns).toBe(150)
  })

  test('every hard variant has a non-empty prompt with a unique BENCH- sentinel ref', () => {
    for (const s of HARD_SCENARIOS) {
      expect(s.prompt.trim().length).toBeGreaterThan(0)
      expect(s.prompt).toMatch(/BENCH-[A-Z0-9-]+/)
    }
    const refs = ALL_SCENARIOS.flatMap((s) => s.prompt.match(/BENCH-[A-Z0-9-]+/g) ?? [])
    expect(new Set(refs).size).toBe(refs.length)
  })

  test('every hard variant has a non-empty title and a completed function', () => {
    for (const s of HARD_SCENARIOS) {
      expect(s.title.trim().length).toBeGreaterThan(0)
      expect(typeof s.completed).toBe('function')
    }
  })

  test('every hard variant declares its own plantedBug', () => {
    for (const s of HARD_SCENARIOS) {
      expect(s.plantedBug).toBeDefined()
      expect(s.plantedBug?.file.length).toBeGreaterThan(0)
      expect(s.plantedBug?.detector.length).toBeGreaterThan(0)
    }
  })
})
