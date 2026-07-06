import { describe, expect, test } from 'bun:test'

import {
  ARTIFACT_IDS,
  COSPEC_TYPES,
  enforcedApplyRequires,
  introducedAt,
  TYPE_ARTIFACTS,
} from '../../../src/core/rules/type-facts.ts'

// DESIGN §5 (migration) + disagreement G: enforcement keys on a per-(artifact,
// type) introducedAt table vs the change's stamped schemaVersion, applied as a
// uniform monotonic version filter — never content-derived promotion.

const V2_TYPES = ['feat', 'fix', 'perf', 'refactor'] as const

describe('introducedAt table', () => {
  test('verification is v2 for feat/fix/perf/refactor and v1 everywhere else', () => {
    for (const type of COSPEC_TYPES) {
      const expected = (V2_TYPES as readonly string[]).includes(type) ? 2 : 1
      expect(introducedAt('verification', type)).toBe(expected)
    }
  })

  test('every other artifact has existed since v1', () => {
    for (const type of COSPEC_TYPES) {
      for (const id of ARTIFACT_IDS) {
        if (id === 'verification') continue
        expect(introducedAt(id, type)).toBe(1)
      }
    }
  })

  test('all introducedAt values are monotonic positive integers ≤ 2', () => {
    for (const type of COSPEC_TYPES) {
      for (const id of ARTIFACT_IDS) {
        const v = introducedAt(id, type)
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(2)
      }
    }
  })
})

describe('enforcedApplyRequires — the monotonic version filter', () => {
  test('a v1 change drops verification from enforcement', () => {
    for (const type of V2_TYPES) {
      expect(enforcedApplyRequires(type, 1)).not.toContain('verification')
      // everything else in the static set is retained.
      const expected = TYPE_ARTIFACTS[type].applyRequires.filter((a) => a !== 'verification')
      expect(enforcedApplyRequires(type, 1)).toEqual(expected)
    }
  })

  test('a v2 change keeps verification enforced', () => {
    for (const type of V2_TYPES) {
      expect(enforcedApplyRequires(type, 2)).toContain('verification')
      expect(enforcedApplyRequires(type, 2)).toEqual(TYPE_ARTIFACTS[type].applyRequires)
    }
  })

  test('types that never gate on verification are version-independent', () => {
    for (const type of COSPEC_TYPES) {
      if ((V2_TYPES as readonly string[]).includes(type)) continue
      expect(enforcedApplyRequires(type, 1)).toEqual(TYPE_ARTIFACTS[type].applyRequires)
      expect(enforcedApplyRequires(type, 2)).toEqual(TYPE_ARTIFACTS[type].applyRequires)
    }
  })

  test('the filter is always a subset of the static matrix, never a superset', () => {
    for (const type of COSPEC_TYPES) {
      for (const version of [1, 2, 3]) {
        for (const id of enforcedApplyRequires(type, version)) {
          expect(TYPE_ARTIFACTS[type].applyRequires).toContain(id)
        }
      }
    }
  })
})
