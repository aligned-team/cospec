import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentTelemetry } from '../../src/agent.ts'
import type { Cell } from '../../src/matrix.ts'
import type { MechanicalMetrics } from '../../src/mechanical.ts'
import {
  aggregate,
  appendCellResult,
  ensureRunDir,
  writeAggregate,
  writeMarkdown,
  type CellResult,
  type RunMeta,
} from '../../src/report.ts'

const roots: string[] = []

function makeRunDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-bench-report-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

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
    cospecValidate: { errors: 1, warnings: 2, byRule: {} },
    artifactFiles: ['proposal.md'],
    forbiddenArtifacts: [],
    missingRequiredArtifacts: [],
    tasksAllChecked: true,
    taskCompleted: true,
    ...overrides,
  }
}

function result(overrides: Partial<CellResult> = {}): CellResult {
  return { cell: cell(), scenarioType: 'ci', ...overrides }
}

const NO_SENTINELS = {}

describe('aggregate', () => {
  test('groups by (scenarioType, arm, model) and reduces over repeats', () => {
    const rows = aggregate([
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry({ durationMs: 1000, totalCostUsd: 0.01 }),
        mechanical: mechanical({ taskCompleted: true }),
        quality: {
          completeness: 3,
          internalConsistency: 3,
          ambiguity: 3,
          verifiability: 3,
          traceability: 3,
          overall: 3,
          samples: 3,
        },
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry({ durationMs: 2000, totalCostUsd: 0.02 }),
        mechanical: mechanical({ taskCompleted: false }),
        quality: {
          completeness: 1,
          internalConsistency: 1,
          ambiguity: 1,
          verifiability: 1,
          traceability: 1,
          overall: 1,
          samples: 3,
        },
      }),
    ])
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.scenarioType).toBe('ci')
    expect(row.arm).toBe('cospec')
    expect(row.model).toBe('claude-sonnet-5')
    expect(row.repeats).toBe(2)
    expect(row.meanQualityOverall).toBe(2)
    expect(row.taskCompletionRate).toBe(0.5)
    expect(row.meanDurationMs).toBe(1500)
    expect(row.meanTotalCostUsd).toBe(0.015)
  })

  test('excludes skipped cells from every group', () => {
    const rows = aggregate([
      result({ skipped: 'agent did not start' }),
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.repeats).toBe(1)
  })

  test('separates distinct (type, arm, model) combinations into separate rows, sorted', () => {
    const rows = aggregate([
      result({
        cell: cell({ arm: 'openspec' }),
        scenarioType: 'feat',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'cospec' }),
        scenarioType: 'ci',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ model: 'claude-opus-4-8' }),
        scenarioType: 'ci',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
    ])
    expect(rows).toHaveLength(3)
    // Sorted by scenarioType then arm then model.
    expect(rows.map((r) => `${r.scenarioType}|${r.arm}|${r.model}`)).toEqual([
      'ci|cospec|claude-opus-4-8',
      'ci|cospec|claude-sonnet-5',
      'feat|openspec|claude-sonnet-5',
    ])
  })

  test('meanQualityOverall / meanDefects are null when no cell in the group has that data', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ cospecValidate: null }),
        quality: null,
      }),
    ])
    expect(rows[0]!.meanQualityOverall).toBeNull()
    expect(rows[0]!.meanDefects).toBeNull()
  })

  test('armNativeValidatePassRate ignores null entries and averages known booleans', () => {
    const rows = aggregate([
      result({ telemetry: telemetry(), mechanical: mechanical({ armNativeValidatePass: true }) }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry(),
        mechanical: mechanical({ armNativeValidatePass: false }),
      }),
      result({
        cell: cell({ repeat: 3 }),
        telemetry: telemetry(),
        mechanical: mechanical({ armNativeValidatePass: null }),
      }),
    ])
    expect(rows[0]!.armNativeValidatePassRate).toBe(0.5)
  })

  test('meanDefects sums errors+warnings from cospecValidate', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ cospecValidate: { errors: 2, warnings: 3, byRule: {} } }),
      }),
    ])
    expect(rows[0]!.meanDefects).toBe(5)
  })

  test('empty input yields an empty array', () => {
    expect(aggregate([])).toEqual([])
  })
})

describe('writeMarkdown', () => {
  const meta: RunMeta = {
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    judgeEnabled: false,
    totalCells: 1,
    ranCells: 1,
    skippedCells: 0,
  }

  test('writes a header, run metadata, and one table row per group', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('# cospec vs openspec — benchmark summary')
    expect(text).toContain('judge: disabled (no DEEPSEEK_API_KEY)')
    expect(text).toContain('| ci | cospec | claude-sonnet-5 | 1 |')
  })

  test('reports "No cells ran" when the result set is empty', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [])
    const text = await Bun.file(path).text()
    expect(text).toContain('_No cells ran._')
  })

  test('shows the judge model when enabled', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(
      runDir,
      { ...meta, judgeEnabled: true, judgeModel: 'deepseek-v4-flash' },
      [],
    )
    const text = await Bun.file(path).text()
    expect(text).toContain('judge: deepseek-v4-flash')
  })
})

describe('ensureRunDir + appendCellResult + writeAggregate — redaction guard', () => {
  const meta: RunMeta = {
    version: 1,
    startedAt: '2026-01-01T00:00:00.000Z',
    judgeEnabled: false,
    totalCells: 1,
    ranCells: 1,
    skippedCells: 0,
  }

  test('appendCellResult writes a JSONL row when nothing leaks', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await appendCellResult(
      runDir,
      result({ telemetry: telemetry(), mechanical: mechanical() }),
      NO_SENTINELS,
    )
    const text = await Bun.file(join(runDir, 'cells.jsonl')).text()
    const row = JSON.parse(text.trim().split('\n')[0]!)
    expect(row.scenarioType).toBe('ci')
  })

  test('appendCellResult throws when a sentinel value leaks into the row', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    const leaking = result({ skipped: 'BENCH-SECRET-TOKEN failed to start' })
    await expect(
      appendCellResult(runDir, leaking, { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' }),
    ).rejects.toThrow(/redaction self-check failed/)
  })

  test('writeAggregate writes meta + cells + aggregates and returns the path', async () => {
    const runDir = makeRunDir()
    const results = [result({ telemetry: telemetry(), mechanical: mechanical() })]
    const path = await writeAggregate(runDir, meta, results, NO_SENTINELS)
    const parsed = JSON.parse(await Bun.file(path).text())
    expect(parsed.meta.version).toBe(1)
    expect(parsed.cells).toHaveLength(1)
    expect(parsed.aggregates).toHaveLength(1)
  })

  test('writeAggregate throws when a sentinel leaks', async () => {
    const runDir = makeRunDir()
    const results = [result({ skipped: 'contains SUPER-SECRET-KEY inline' })]
    await expect(
      writeAggregate(runDir, meta, results, { key: 'SUPER-SECRET-KEY' }),
    ).rejects.toThrow(/redaction self-check failed/)
  })
})
