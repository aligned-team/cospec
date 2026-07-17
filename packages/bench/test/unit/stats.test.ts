import { describe, expect, test } from 'bun:test'

import type { AgentTelemetry } from '../../src/agent.ts'
import type { Cell } from '../../src/matrix.ts'
import type { MechanicalMetrics } from '../../src/mechanical.ts'
import type { CellResult } from '../../src/report.ts'
import {
  pairedComparisons,
  rangesOverlap,
  renderPairedComparisonMarkdown,
  signTestPValue,
  summarizeNumeric,
} from '../../src/stats.ts'

function cell(overrides: Partial<Cell> = {}): Cell {
  return { scenarioId: 'ci', arm: 'cospec', model: 'claude-sonnet-5', repeat: 1, ...overrides }
}

function telemetry(overrides: Partial<AgentTelemetry> = {}): AgentTelemetry {
  return {
    isError: false,
    durationMs: 1000,
    totalCostUsd: 0.01,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
    ...overrides,
  }
}

function mechanical(overrides: Partial<MechanicalMetrics> = {}): MechanicalMetrics {
  return {
    changeProduced: true,
    changeArchived: false,
    armNativeValidatePass: true,
    schemaConformance: { errors: 0, warnings: 0, byRule: {} },
    artifactFiles: [],
    forbiddenArtifacts: [],
    missingRequiredArtifacts: [],
    tasksAllChecked: true,
    taskCompleted: true,
    hiddenTests: null,
    plantedBugCaught: null,
    ...overrides,
  }
}

function result(overrides: Partial<CellResult> = {}): CellResult {
  return { cell: cell(), scenarioId: 'ci', ...overrides }
}

// ── summarizeNumeric ────────────────────────────────────────────────────────

describe('summarizeNumeric', () => {
  test('null on an empty input', () => {
    expect(summarizeNumeric([])).toBeNull()
  })

  test('null when every value is non-finite', () => {
    expect(summarizeNumeric([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull()
  })

  test('n=1: mean/min/max all equal the single value, stddev null', () => {
    expect(summarizeNumeric([42])).toEqual({ n: 1, mean: 42, min: 42, max: 42, stddev: null })
  })

  test('filters non-finite values out before summarizing', () => {
    expect(summarizeNumeric([10, Number.NaN, 20])).toEqual({
      n: 2,
      mean: 15,
      min: 10,
      max: 20,
      stddev: expect.any(Number),
    })
  })

  test('computes sample stddev (n-1 denominator) for n>1', () => {
    // values 2,4,4,4,5,5,7,9 — classic stddev-2 example, population stddev 2,
    // sample stddev sqrt(32/7) ≈ 2.1381
    const s = summarizeNumeric([2, 4, 4, 4, 5, 5, 7, 9])!
    expect(s.n).toBe(8)
    expect(s.mean).toBe(5)
    expect(s.min).toBe(2)
    expect(s.max).toBe(9)
    expect(s.stddev).toBeCloseTo(2.1381, 3)
  })

  test('stddev is 0 (not null) when n>1 but every value is identical', () => {
    expect(summarizeNumeric([3, 3, 3])).toEqual({ n: 3, mean: 3, min: 3, max: 3, stddev: 0 })
  })
})

// ── rangesOverlap ────────────────────────────────────────────────────────────

describe('rangesOverlap', () => {
  test('true for overlapping ranges', () => {
    expect(rangesOverlap([0, 10], [5, 15])).toBe(true)
  })

  test('true for touching boundaries (inclusive)', () => {
    expect(rangesOverlap([0, 5], [5, 10])).toBe(true)
  })

  test('false for disjoint ranges', () => {
    expect(rangesOverlap([0, 5], [6, 10])).toBe(false)
  })

  test('true when one range fully contains the other', () => {
    expect(rangesOverlap([0, 100], [40, 60])).toBe(true)
  })
})

// ── signTestPValue ───────────────────────────────────────────────────────────

describe('signTestPValue', () => {
  test('null when n < 2 (a single decided pair carries no significance)', () => {
    expect(signTestPValue(0, 0)).toBeNull()
    expect(signTestPValue(1, 1)).toBeNull()
  })

  test('symmetric: wins and n-wins give the same p-value', () => {
    expect(signTestPValue(3, 10)).toBeCloseTo(signTestPValue(7, 10)!, 10)
  })

  test('an even 50/50 split at small n is not significant (p=1)', () => {
    expect(signTestPValue(1, 2)).toBe(1)
  })

  test('a lopsided split at larger n is significant (p < 0.05)', () => {
    expect(signTestPValue(10, 10)).toBeLessThan(0.05)
  })

  test('never exceeds 1', () => {
    expect(signTestPValue(5, 10)).toBeLessThanOrEqual(1)
  })
})

// ── pairedComparisons ─────────────────────────────────────────────────────────

describe('pairedComparisons', () => {
  test('empty input yields no groups', () => {
    expect(pairedComparisons([])).toEqual([])
  })

  test('matches cospec/openspec cells sharing scenarioId+model+repeat and compares cost/duration', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.5, durationMs: 1000 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.8, durationMs: 1500 }),
        mechanical: mechanical({ schemaConformance: { errors: 1, warnings: 1, byRule: {} } }),
      }),
    ]
    const groups = pairedComparisons(results)
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    expect(group.scenarioId).toBe('ci')
    expect(group.model).toBe('claude-sonnet-5')

    const cost = group.metrics.find((m) => m.metric === 'cost')!
    expect(cost.pairs).toBe(1)
    expect(cost.cospecWins).toBe(1)
    expect(cost.openspecWins).toBe(0)
    // n=1 — never a significance claim, never "distinguishable".
    expect(cost.distinguishable).toBe(false)
    expect(cost.verdict).toBe('n=1 — no significance claim')

    const duration = group.metrics.find((m) => m.metric === 'duration')!
    expect(duration.cospecWins).toBe(1)

    const conformance = group.metrics.find((m) => m.metric === 'conformanceIssues')!
    expect(conformance.pairs).toBe(1)
    expect(conformance.cospecWins).toBe(1) // 0 issues < 2 issues
  })

  test('a `-hard` variant never pairs against its base scenario, even though both share a cospec type', () => {
    // feat-hard is `type: 'feat'` (see scenarios/feat-hard.ts) — matching by
    // the cospec type instead of the scenario id would wrongly cross-pair a
    // `feat` cell against a `feat-hard` cell of the opposite arm.
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec' }),
        scenarioId: 'feat',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'openspec' }),
        scenarioId: 'feat-hard',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
    ]
    const groups = pairedComparisons(results)
    expect(groups.map((g) => g.scenarioId).toSorted()).toEqual(['feat', 'feat-hard'])
    for (const group of groups) {
      for (const metric of group.metrics) expect(metric.pairs).toBe(0)
    }
  })

  test('compares reviewDefects (confirmed counts) once populated on both sides', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical({ reviewDefects: { found: 1, confirmed: 0 } }),
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical({ reviewDefects: { found: 3, confirmed: 2 } }),
      }),
    ]
    const review = pairedComparisons(results)[0]!.metrics.find((m) => m.metric === 'reviewDefects')!
    expect(review.pairs).toBe(1)
    expect(review.cospecWins).toBe(1) // 0 confirmed < 2 confirmed, lower is better
    expect(review.openspecWins).toBe(0)
  })

  test('reviewDefects has 0 pairs when review did not run (metric excluded from the table)', () => {
    const results: CellResult[] = [
      result({ cell: cell({ arm: 'cospec' }), telemetry: telemetry(), mechanical: mechanical() }),
      result({ cell: cell({ arm: 'openspec' }), telemetry: telemetry(), mechanical: mechanical() }),
    ]
    const review = pairedComparisons(results)[0]!.metrics.find((m) => m.metric === 'reviewDefects')!
    expect(review.pairs).toBe(0)
    expect(review.verdict).toBe('no matched pairs')
  })

  test('unmatched cells (only one arm present for a repeat) are excluded from pairs', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      // No openspec counterpart for repeat 1 — nothing to pair against.
    ]
    const groups = pairedComparisons(results)
    expect(groups).toHaveLength(1)
    for (const m of groups[0]!.metrics) {
      expect(m.pairs).toBe(0)
      expect(m.verdict).toBe('no matched pairs')
    }
  })

  test('skipped cells never enter a pair', () => {
    const results: CellResult[] = [
      result({ cell: cell({ arm: 'cospec' }), skipped: 'agent did not start' }),
      result({ cell: cell({ arm: 'openspec' }), telemetry: telemetry(), mechanical: mechanical() }),
    ]
    const groups = pairedComparisons(results)
    expect(groups).toHaveLength(1)
    for (const m of groups[0]!.metrics) expect(m.pairs).toBe(0)
  })

  test('a metric missing on one side of a pair (e.g. no mechanical data) excludes only that metric, not the whole pair', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.5 }),
        // No mechanical data -> conformanceIssueCount is null for this side.
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.9 }),
        mechanical: mechanical(),
      }),
    ]
    const groups = pairedComparisons(results)
    const cost = groups[0]!.metrics.find((m) => m.metric === 'cost')!
    const conformance = groups[0]!.metrics.find((m) => m.metric === 'conformanceIssues')!
    expect(cost.pairs).toBe(1)
    expect(conformance.pairs).toBe(0)
  })

  test('multiple repeats where cospec always wins on cost: distinguishable, verdict names cospec', () => {
    const results: CellResult[] = []
    for (let repeat = 1; repeat <= 3; repeat += 1) {
      results.push(
        result({
          cell: cell({ arm: 'cospec', repeat }),
          telemetry: telemetry({ totalCostUsd: 0.1 * repeat }),
          mechanical: mechanical(),
        }),
        result({
          cell: cell({ arm: 'openspec', repeat }),
          telemetry: telemetry({ totalCostUsd: 1 + 0.1 * repeat }),
          mechanical: mechanical(),
        }),
      )
    }
    const groups = pairedComparisons(results)
    const cost = groups[0]!.metrics.find((m) => m.metric === 'cost')!
    expect(cost.pairs).toBe(3)
    expect(cost.cospecWins).toBe(3)
    expect(cost.distinguishable).toBe(true)
    expect(cost.verdict).toContain('cospec wins')
  })

  test('overlapping ranges across repeats are flagged not distinguishable', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 1.0 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.5 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'cospec', repeat: 2 }),
        telemetry: telemetry({ totalCostUsd: 0.2 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 2 }),
        telemetry: telemetry({ totalCostUsd: 0.9 }),
        mechanical: mechanical(),
      }),
    ]
    const groups = pairedComparisons(results)
    const cost = groups[0]!.metrics.find((m) => m.metric === 'cost')!
    expect(cost.pairs).toBe(2)
    expect(cost.cospecWins).toBe(1)
    expect(cost.openspecWins).toBe(1)
    expect(cost.distinguishable).toBe(false)
    expect(cost.verdict).toContain('not distinguishable at this n')
  })

  test('groups are sorted by scenarioId then model', () => {
    const results: CellResult[] = [
      result({
        scenarioId: 'feat',
        cell: cell({ arm: 'cospec', model: 'claude-opus-4-8' }),
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        scenarioId: 'feat',
        cell: cell({ arm: 'openspec', model: 'claude-opus-4-8' }),
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        scenarioId: 'ci',
        cell: cell({ arm: 'cospec', model: 'claude-sonnet-5' }),
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        scenarioId: 'ci',
        cell: cell({ arm: 'openspec', model: 'claude-sonnet-5' }),
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
    ]
    const groups = pairedComparisons(results)
    expect(groups.map((g) => `${g.scenarioId}|${g.model}`)).toEqual([
      'ci|claude-sonnet-5',
      'feat|claude-opus-4-8',
    ])
  })
})

// ── renderPairedComparisonMarkdown ────────────────────────────────────────────

describe('renderPairedComparisonMarkdown', () => {
  test('states "no matched pairs" when there are no groups', () => {
    const lines = renderPairedComparisonMarkdown([])
    expect(lines.join('\n')).toContain('No matched pairs')
  })

  test('renders a header, and only metric rows that have >=1 pair', () => {
    const results: CellResult[] = [
      result({
        cell: cell({ arm: 'cospec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.5 }),
      }),
      result({
        cell: cell({ arm: 'openspec', repeat: 1 }),
        telemetry: telemetry({ totalCostUsd: 0.9 }),
      }),
    ]
    const lines = renderPairedComparisonMarkdown(pairedComparisons(results))
    const text = lines.join('\n')
    expect(text).toContain('## Paired comparison (cospec vs openspec, matched cells)')
    expect(text).toContain('cost($)')
    expect(text).toContain('duration(ms)')
    // No mechanical data on either side -> conformanceIssues has 0 pairs -> no table row for it
    // (the legend prose above the table mentions the phrase, so check the table row specifically).
    expect(text).not.toContain('| conformance issues |')
  })

  test('n=1 rows show the no-significance-claim verdict verbatim', () => {
    const results: CellResult[] = [
      result({ cell: cell({ arm: 'cospec' }), telemetry: telemetry({ totalCostUsd: 0.5 }) }),
      result({ cell: cell({ arm: 'openspec' }), telemetry: telemetry({ totalCostUsd: 0.9 }) }),
    ]
    const text = renderPairedComparisonMarkdown(pairedComparisons(results)).join('\n')
    expect(text).toContain('n=1 — no significance claim')
  })
})
