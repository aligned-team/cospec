import { describe, expect, test } from 'bun:test'

import {
  ARMS,
  cellKey,
  expandMatrix,
  MODELS,
  parseArgs,
  type Cell,
  type MatrixFilters,
} from '../../src/matrix.ts'

describe('parseArgs', () => {
  test('defaults: no filters, repeats=1, concurrency=2, smoke=false, review off', () => {
    const f = parseArgs([])
    expect(f.scenarios).toBeUndefined()
    expect(f.arms).toBeUndefined()
    expect(f.models).toBeUndefined()
    expect(f.repeats).toBe(1)
    expect(f.concurrency).toBe(2)
    expect(f.smoke).toBe(false)
    expect(f.hard).toBe(false)
    expect(f.review).toBe(false)
    expect(f.reviewReport).toBeUndefined()
    expect(f.publish).toBe(false)
    expect(f.publishFrom).toBeUndefined()
  })

  test('--publish sets the publish flag with no value', () => {
    const f = parseArgs(['--publish'])
    expect(f.publish).toBe(true)
  })

  test('--publish-from takes a directory value (both forms)', () => {
    expect(parseArgs(['--publish-from', 'reports/2026-01-01']).publishFrom).toBe(
      'reports/2026-01-01',
    )
    expect(parseArgs(['--publish-from=reports/x']).publishFrom).toBe('reports/x')
  })

  test('--publish-from throws when its value is missing', () => {
    expect(() => parseArgs(['--publish-from'])).toThrow(/missing value/)
  })

  test('--publish-from throws when combined with a cell-selecting flag', () => {
    expect(() => parseArgs(['--publish-from', 'reports/x', '--scenario', 'ci'])).toThrow(
      /--publish-from is standalone/,
    )
    expect(() => parseArgs(['--publish-from', 'reports/x', '--arm', 'cospec'])).toThrow(
      /--publish-from is standalone/,
    )
    expect(() => parseArgs(['--publish-from', 'reports/x', '--hard'])).toThrow(
      /--publish-from is standalone/,
    )
    expect(() => parseArgs(['--publish-from', 'reports/x', '--review'])).toThrow(
      /--publish-from is standalone/,
    )
  })

  test('--publish-from throws when combined with --publish', () => {
    expect(() => parseArgs(['--publish-from', 'reports/x', '--publish'])).toThrow(
      /--publish-from is standalone/,
    )
  })

  test('--publish-from throws when combined with --review-report', () => {
    expect(() =>
      parseArgs(['--publish-from', 'reports/x', '--review-report', 'reports/y']),
    ).toThrow(/cannot be combined with --review-report/)
  })

  test('--publish-from alone (no other flags) parses cleanly', () => {
    const f = parseArgs(['--publish-from', 'reports/x'])
    expect(f.publishFrom).toBe('reports/x')
    expect(f.publish).toBe(false)
  })

  test('--hard sets the hard flag with no value', () => {
    const f = parseArgs(['--hard'])
    expect(f.hard).toBe(true)
  })

  test('--review sets the inline-review flag with no value', () => {
    const f = parseArgs(['--review'])
    expect(f.review).toBe(true)
  })

  test('--review-report takes a directory value (both forms)', () => {
    expect(parseArgs(['--review-report', 'reports/2026-01-01']).reviewReport).toBe(
      'reports/2026-01-01',
    )
    expect(parseArgs(['--review-report=reports/x']).reviewReport).toBe('reports/x')
  })

  test('--review-report throws when its value is missing', () => {
    expect(() => parseArgs(['--review-report'])).toThrow(/missing value/)
  })

  test('accepts --flag value form', () => {
    const f = parseArgs(['--scenario', 'ci', '--arm', 'cospec', '--model', 'claude-sonnet-5'])
    expect(f.scenarios).toEqual(['ci'])
    expect(f.arms).toEqual(['cospec'])
    expect(f.models).toEqual(['claude-sonnet-5'])
  })

  test('accepts --flag=value form', () => {
    const f = parseArgs(['--scenario=ci', '--repeats=3', '--concurrency=4'])
    expect(f.scenarios).toEqual(['ci'])
    expect(f.repeats).toBe(3)
    expect(f.concurrency).toBe(4)
  })

  test('comma-splits a single flag value', () => {
    const f = parseArgs(['--arm', 'cospec,openspec', '--scenario', 'ci,feat'])
    expect(f.arms).toEqual(['cospec', 'openspec'])
    expect(f.scenarios).toEqual(['ci', 'feat'])
  })

  test('accumulates repeated flags', () => {
    const f = parseArgs(['--scenario', 'ci', '--scenario', 'feat'])
    expect(f.scenarios).toEqual(['ci', 'feat'])
  })

  test('trims whitespace and drops empty entries from comma-split values', () => {
    const f = parseArgs(['--scenario', ' ci , , feat '])
    expect(f.scenarios).toEqual(['ci', 'feat'])
  })

  test('--smoke sets the smoke flag with no value', () => {
    const f = parseArgs(['--smoke'])
    expect(f.smoke).toBe(true)
  })

  test('ignores a bare "--" token', () => {
    const f = parseArgs(['--', '--scenario', 'ci'])
    expect(f.scenarios).toEqual(['ci'])
  })

  test('throws on unknown flag', () => {
    expect(() => parseArgs(['--bogus', 'x'])).toThrow(/unknown flag/)
  })

  test('throws on unknown arm value', () => {
    expect(() => parseArgs(['--arm', 'nope'])).toThrow(/unknown arm/)
  })

  test('throws on unknown model value', () => {
    expect(() => parseArgs(['--model', 'nope'])).toThrow(/unknown model/)
  })

  test('throws on missing value for a flag', () => {
    expect(() => parseArgs(['--scenario'])).toThrow(/missing value/)
  })

  test('throws on non-integer --repeats', () => {
    expect(() => parseArgs(['--repeats', 'abc'])).toThrow(/--repeats/)
  })

  test('throws on --repeats < 1', () => {
    expect(() => parseArgs(['--repeats', '0'])).toThrow(/--repeats/)
  })

  test('throws on --concurrency < 1', () => {
    expect(() => parseArgs(['--concurrency', '0'])).toThrow(/--concurrency/)
  })
})

const SCENARIO_IDS = ['ci', 'feat', 'fix'] as const

function filters(overrides: Partial<MatrixFilters> = {}): MatrixFilters {
  return {
    repeats: 1,
    concurrency: 2,
    smoke: false,
    hard: false,
    review: false,
    publish: false,
    ...overrides,
  }
}

describe('expandMatrix', () => {
  test('cartesian product over full axes when no filters are set', () => {
    const cells = expandMatrix(SCENARIO_IDS, filters())
    expect(cells).toHaveLength(SCENARIO_IDS.length * ARMS.length * MODELS.length)
    // Spot-check one combination is present.
    expect(cells).toContainEqual({
      scenarioId: 'ci',
      arm: 'cospec',
      model: 'claude-sonnet-5',
      repeat: 1,
    })
  })

  test('repeats multiplies cell count and numbers repeats from 1', () => {
    const cells = expandMatrix(
      ['ci'],
      filters({ repeats: 3, models: ['claude-sonnet-5'], arms: ['cospec'] }),
    )
    expect(cells).toHaveLength(3)
    expect(cells.map((c) => c.repeat)).toEqual([1, 2, 3])
  })

  test('--scenario filter narrows to the requested scenario ids only', () => {
    const cells = expandMatrix(SCENARIO_IDS, filters({ scenarios: ['feat'] }))
    expect(new Set(cells.map((c) => c.scenarioId))).toEqual(new Set(['feat']))
  })

  test('--arm filter narrows the arm axis', () => {
    const cells = expandMatrix(SCENARIO_IDS, filters({ arms: ['cospec'] }))
    expect(cells.every((c) => c.arm === 'cospec')).toBe(true)
  })

  test('--model filter narrows the model axis', () => {
    const cells = expandMatrix(SCENARIO_IDS, filters({ models: ['claude-opus-4-8'] }))
    expect(cells.every((c) => c.model === 'claude-opus-4-8')).toBe(true)
  })

  test('the default (no --scenario) axis excludes -hard ids unless --hard is set', () => {
    const availableIds = ['ci', 'feat', 'feat-hard']
    const withoutHard = expandMatrix(availableIds, filters())
    expect(new Set(withoutHard.map((c) => c.scenarioId))).toEqual(new Set(['ci', 'feat']))

    const withHard = expandMatrix(availableIds, filters({ hard: true }))
    expect(new Set(withHard.map((c) => c.scenarioId))).toEqual(new Set(['ci', 'feat', 'feat-hard']))
  })

  test('an explicit --scenario feat-hard resolves regardless of --hard', () => {
    const availableIds = ['ci', 'feat', 'feat-hard']
    const cells = expandMatrix(availableIds, filters({ scenarios: ['feat-hard'] }))
    expect(new Set(cells.map((c) => c.scenarioId))).toEqual(new Set(['feat-hard']))
  })

  test('requested scenario ids not in availableIds are silently dropped', () => {
    const cells = expandMatrix(SCENARIO_IDS, filters({ scenarios: ['ci', 'nope'] }))
    expect(new Set(cells.map((c) => c.scenarioId))).toEqual(new Set(['ci']))
  })

  test('--smoke collapses to the single cheap cell, ignoring other filters', () => {
    const cells = expandMatrix(
      SCENARIO_IDS,
      filters({ smoke: true, arms: ['openspec'], repeats: 5 }),
    )
    expect(cells).toEqual([
      { scenarioId: 'ci', arm: 'cospec', model: 'claude-sonnet-5', repeat: 1 },
    ])
  })

  test('--smoke falls back to the first available id when "ci" is absent', () => {
    const cells = expandMatrix(['feat', 'fix'], filters({ smoke: true }))
    expect(cells).toEqual([
      { scenarioId: 'feat', arm: 'cospec', model: 'claude-sonnet-5', repeat: 1 },
    ])
  })

  test('returns an empty array when availableIds is empty (even with --smoke)', () => {
    expect(expandMatrix([], filters({ smoke: true }))).toEqual([])
    expect(expandMatrix([], filters())).toEqual([])
  })

  test('returns an empty array when every requested scenario id is unknown', () => {
    expect(expandMatrix(SCENARIO_IDS, filters({ scenarios: ['nope'] }))).toEqual([])
  })
})

describe('cellKey', () => {
  test('joins scenarioId, arm, model, and a zero-padded-free repeat with __', () => {
    const cell: Cell = { scenarioId: 'ci', arm: 'cospec', model: 'claude-sonnet-5', repeat: 2 }
    expect(cellKey(cell)).toBe('ci__cospec__claude-sonnet-5__r2')
  })
})
