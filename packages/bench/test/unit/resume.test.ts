import { describe, expect, test } from 'bun:test'

import type { AgentTelemetry } from '../../src/agent.ts'
import { expandMatrix, type Cell, type MatrixFilters } from '../../src/matrix.ts'
import type { MechanicalMetrics } from '../../src/mechanical.ts'
import type { CellResult } from '../../src/report.ts'
import {
  completedCellKeys,
  needsJudgeBackfill,
  needsReviewBackfill,
  partitionResumeCells,
} from '../../src/resume.ts'

function cell(overrides: Partial<Cell> = {}): Cell {
  return { scenarioId: 'ci', arm: 'cospec', model: 'claude-sonnet-5', repeat: 1, ...overrides }
}

function result(overrides: Partial<CellResult> = {}): CellResult {
  return { cell: cell(), scenarioId: 'ci', ...overrides }
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
    artifactFiles: ['proposal.md'],
    forbiddenArtifacts: [],
    missingRequiredArtifacts: [],
    tasksAllChecked: true,
    taskCompleted: true,
    hiddenTests: null,
    plantedBugCaught: null,
    ...overrides,
  }
}

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

describe('completedCellKeys', () => {
  test('collects the cellKey of every existing row, regardless of skipped status', () => {
    const keys = completedCellKeys([
      result({ cell: cell({ scenarioId: 'ci' }) }),
      result({ cell: cell({ scenarioId: 'feat' }), skipped: 'agent did not start' }),
    ])
    expect(keys).toEqual(
      new Set(['ci__cospec__claude-sonnet-5__r1', 'feat__cospec__claude-sonnet-5__r1']),
    )
  })
})

describe('partitionResumeCells', () => {
  test('skips a fixture cells.jsonl subset and runs only the missing cells', () => {
    // Mirrors the real partial run this task dry-verified against: a full
    // (scenario × arm × model × repeat) matrix where some (scenarioId, arm,
    // model) combinations completed every repeat and others are entirely
    // missing.
    const scenarios = ['build', 'feat', 'fix']
    const cells = expandMatrix(
      scenarios,
      filters({ repeats: 3, arms: ['cospec', 'openspec'], models: ['claude-sonnet-5'] }),
    )
    expect(cells).toHaveLength(scenarios.length * 2 * 3)

    // 'build' finished completely; 'feat' and 'fix' never started.
    const existing = expandMatrix(['build'], filters({ repeats: 3, arms: ['cospec', 'openspec'] }))
      .filter((c) => c.model === 'claude-sonnet-5')
      .map((c) => result({ cell: c }))

    const { toRun, skipped } = partitionResumeCells(cells, existing)
    expect(skipped).toHaveLength(6) // build × 2 arms × 3 repeats
    expect(toRun).toHaveLength(12) // feat + fix × 2 arms × 3 repeats
    expect(new Set(skipped.map((c) => c.scenarioId))).toEqual(new Set(['build']))
    expect(new Set(toRun.map((c) => c.scenarioId))).toEqual(new Set(['feat', 'fix']))
  })

  test('repeat identity: a partial run of one repeat resumes only the missing repeat, not the whole scenario', () => {
    const cells = expandMatrix(
      ['ci'],
      filters({ repeats: 3, arms: ['cospec'], models: ['claude-sonnet-5'] }),
    )
    const existing = [result({ cell: cell({ repeat: 1 }) }), result({ cell: cell({ repeat: 2 }) })]
    const { toRun, skipped } = partitionResumeCells(cells, existing)
    expect(skipped.map((c) => c.repeat)).toEqual([1, 2])
    expect(toRun.map((c) => c.repeat)).toEqual([3])
  })

  test('an empty existing set runs the full matrix (equivalent to a fresh run)', () => {
    const cells = expandMatrix(['ci', 'feat'], filters())
    const { toRun, skipped } = partitionResumeCells(cells, [])
    expect(toRun).toEqual(cells)
    expect(skipped).toEqual([])
  })

  test('every cell already complete runs nothing', () => {
    const cells = expandMatrix(['ci'], filters({ arms: ['cospec'] }))
    const existing = cells.map((c) => result({ cell: c }))
    const { toRun, skipped } = partitionResumeCells(cells, existing)
    expect(toRun).toEqual([])
    expect(skipped).toEqual(cells)
  })
})

describe('needsReviewBackfill', () => {
  test('true for a scored cell with no reviewDefects yet', () => {
    expect(needsReviewBackfill(result({ telemetry: telemetry(), mechanical: mechanical() }))).toBe(
      true,
    )
  })

  test('false once reviewDefects is already populated — never re-reviews a reviewed cell', () => {
    const reviewed = result({
      telemetry: telemetry(),
      mechanical: mechanical({ reviewDefects: { found: 1, confirmed: 0 } }),
    })
    expect(needsReviewBackfill(reviewed)).toBe(false)
  })

  test('false for a skipped cell (nothing was scored to review)', () => {
    expect(needsReviewBackfill(result({ skipped: 'agent did not start' }))).toBe(false)
  })

  test('false for a cell with no mechanical metrics at all', () => {
    expect(needsReviewBackfill(result())).toBe(false)
  })
})

describe('needsJudgeBackfill', () => {
  // The `--judge-report` skip-logic predicate: a cell is a backfill candidate
  // exactly when it ran and its quality is exactly `null` (judge disabled,
  // every sample failed, or nothing was there to judge at run time).

  test('true for a ran cell whose quality is exactly null', () => {
    expect(
      needsJudgeBackfill(
        result({ telemetry: telemetry(), mechanical: mechanical(), quality: null }),
      ),
    ).toBe(true)
  })

  test('true even when a judgeError diagnostic accompanies the null quality', () => {
    expect(
      needsJudgeBackfill(
        result({
          telemetry: telemetry(),
          mechanical: mechanical(),
          quality: null,
          judgeError: '3 sample(s) failed: http 402 x3',
        }),
      ),
    ).toBe(true)
  })

  test('false once a cell already carries a real quality score — never re-judges', () => {
    const scored = result({
      telemetry: telemetry(),
      mechanical: mechanical(),
      quality: {
        completeness: 3,
        internalConsistency: 3,
        ambiguity: 3,
        verifiability: 3,
        traceability: 3,
        overall: 3,
        samples: 3,
      },
    })
    expect(needsJudgeBackfill(scored)).toBe(false)
  })

  test('false for a skipped cell (never had a quality field to begin with)', () => {
    expect(needsJudgeBackfill(result({ skipped: 'agent did not start' }))).toBe(false)
  })

  test('false when quality is undefined (the judge was never even attempted for this row)', () => {
    expect(needsJudgeBackfill(result({ telemetry: telemetry(), mechanical: mechanical() }))).toBe(
      false,
    )
  })
})
