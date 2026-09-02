import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { AgentTelemetry } from '../../src/agent.ts'
import type { Cell } from '../../src/matrix.ts'
import type { ArtifactSnapshot, MechanicalMetrics } from '../../src/mechanical.ts'
import {
  aggregate,
  appendCellResult,
  ensureRunDir,
  isStaleSchema,
  readCellDiff,
  readCellsJsonl,
  writeAggregate,
  writeArtifactSnapshot,
  writeCellDiff,
  writeCellsJsonl,
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
    schemaConformance: { errors: 1, warnings: 2, byRule: {} },
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

function result(overrides: Partial<CellResult> = {}): CellResult {
  return { cell: cell(), scenarioId: 'ci', ...overrides }
}

const NO_SENTINELS = {}

function snapshot(overrides: Partial<ArtifactSnapshot> = {}): ArtifactSnapshot {
  return {
    slug: 'add-widget',
    dir: 'openspec/changes/archive/2026-01-01-add-widget',
    archived: true,
    files: { 'proposal.md': '## Why\n\nreasons\n' },
    ...overrides,
  }
}

describe('aggregate — resumed run (old + new rows merged)', () => {
  test('a resumed run merges old + new results into one complete-matrix aggregate', () => {
    // Simulates what run.ts does at the end of a --resume invocation:
    // `[...existingResults, ...freshResults]` fed straight into `aggregate`.
    const existingResults = [
      result({
        cell: cell({ scenarioId: 'build', repeat: 1 }),
        scenarioId: 'build',
        telemetry: telemetry({ durationMs: 1000 }),
        mechanical: mechanical({ taskCompleted: true }),
      }),
    ]
    const freshResults = [
      result({
        cell: cell({ scenarioId: 'feat', repeat: 1 }),
        scenarioId: 'feat',
        telemetry: telemetry({ durationMs: 3000 }),
        mechanical: mechanical({ taskCompleted: false }),
      }),
    ]
    const rows = aggregate([...existingResults, ...freshResults])
    expect(rows.map((r) => r.scenarioId)).toEqual(['build', 'feat'])
    const build = rows.find((r) => r.scenarioId === 'build')!
    expect(build.meanDurationMs).toBe(1000)
    expect(build.taskCompletionRate).toBe(1)
    const feat = rows.find((r) => r.scenarioId === 'feat')!
    expect(feat.meanDurationMs).toBe(3000)
    expect(feat.taskCompletionRate).toBe(0)
  })
})

describe('aggregate', () => {
  test('groups by (scenarioId, arm, model) and reduces over repeats', () => {
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
    expect(row.scenarioId).toBe('ci')
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
        scenarioId: 'feat',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'cospec' }),
        scenarioId: 'ci',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ model: 'claude-opus-4-8' }),
        scenarioId: 'ci',
        telemetry: telemetry(),
        mechanical: mechanical(),
      }),
    ])
    expect(rows).toHaveLength(3)
    // Sorted by scenarioId then arm then model.
    expect(rows.map((r) => `${r.scenarioId}|${r.arm}|${r.model}`)).toEqual([
      'ci|cospec|claude-opus-4-8',
      'ci|cospec|claude-sonnet-5',
      'feat|openspec|claude-sonnet-5',
    ])
  })

  test("a `-hard` variant never merges into its base scenario's row, even though both share a cospec type", () => {
    // feat-hard is `type: 'feat'` (see scenarios/feat-hard.ts) — grouping by
    // the cospec type instead of the scenario id would silently merge these
    // two into one row whenever both run in the same matrix (e.g. `--hard`
    // without narrowing to just the hard ids).
    const rows = aggregate([
      result({
        cell: cell(),
        scenarioId: 'feat',
        telemetry: telemetry({ durationMs: 1000 }),
        mechanical: mechanical({ taskCompleted: true }),
      }),
      result({
        cell: cell(),
        scenarioId: 'feat-hard',
        telemetry: telemetry({ durationMs: 9000 }),
        mechanical: mechanical({ taskCompleted: false }),
      }),
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.scenarioId).toSorted()).toEqual(['feat', 'feat-hard'])
    const feat = rows.find((r) => r.scenarioId === 'feat')!
    const featHard = rows.find((r) => r.scenarioId === 'feat-hard')!
    expect(feat.repeats).toBe(1)
    expect(featHard.repeats).toBe(1)
    expect(feat.meanDurationMs).toBe(1000)
    expect(featHard.meanDurationMs).toBe(9000)
  })

  test('meanQualityOverall / meanConformanceIssues are null when no cell in the group has that data', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ schemaConformance: null }),
        quality: null,
      }),
    ])
    expect(rows[0]!.meanQualityOverall).toBeNull()
    expect(rows[0]!.meanConformanceIssues).toBeNull()
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

  test('meanConformanceIssues sums errors+warnings from schemaConformance', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ schemaConformance: { errors: 2, warnings: 3, byRule: {} } }),
      }),
    ])
    expect(rows[0]!.meanConformanceIssues).toBe(5)
  })

  test('meanConfirmedReviewDefects is null when no cell was reviewed', () => {
    const rows = aggregate([result({ telemetry: telemetry(), mechanical: mechanical() })])
    expect(rows[0]!.meanConfirmedReviewDefects).toBeNull()
  })

  test('meanConfirmedReviewDefects averages confirmed counts over reviewed repeats', () => {
    const rows = aggregate([
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical({ reviewDefects: { found: 3, confirmed: 2 } }),
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry(),
        mechanical: mechanical({ reviewDefects: { found: 1, confirmed: 0 } }),
      }),
    ])
    expect(rows[0]!.meanConfirmedReviewDefects).toBe(1)
  })

  test('meanEscapedDefects/meanHiddenTestsTotal are null when no cell scored hidden tests', () => {
    const rows = aggregate([
      result({ telemetry: telemetry(), mechanical: mechanical({ hiddenTests: null }) }),
    ])
    expect(rows[0]!.meanEscapedDefects).toBeNull()
    expect(rows[0]!.meanHiddenTestsTotal).toBeNull()
  })

  test('meanEscapedDefects/meanHiddenTestsTotal average the failed/total hidden-test counts', () => {
    const rows = aggregate([
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical({ hiddenTests: { total: 6, failed: 2 } }),
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry(),
        mechanical: mechanical({ hiddenTests: { total: 6, failed: 0 } }),
      }),
    ])
    expect(rows[0]!.meanEscapedDefects).toBe(1)
    expect(rows[0]!.meanHiddenTestsTotal).toBe(6)
  })

  test('plantedBugCaughtRate is null when no cell scored a plant (undefined scenario plant, or null result)', () => {
    const rows = aggregate([
      result({ telemetry: telemetry(), mechanical: mechanical({ plantedBugCaught: null }) }),
    ])
    expect(rows[0]!.plantedBugCaughtRate).toBeNull()
  })

  test('plantedBugCaughtRate is the fraction of repeats that caught the plant', () => {
    const rows = aggregate([
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry(),
        mechanical: mechanical({ plantedBugCaught: true }),
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry(),
        mechanical: mechanical({ plantedBugCaught: false }),
      }),
    ])
    expect(rows[0]!.plantedBugCaughtRate).toBe(0.5)
  })

  test('empty input yields an empty array', () => {
    expect(aggregate([])).toEqual([])
  })

  test('durationSummary/costSummary are a full NumericSummary; n=1 has null stddev', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry({ durationMs: 1000, totalCostUsd: 0.5 }),
        mechanical: mechanical(),
      }),
    ])
    expect(rows[0]!.durationSummary).toEqual({
      n: 1,
      mean: 1000,
      min: 1000,
      max: 1000,
      stddev: null,
    })
    expect(rows[0]!.costSummary).toEqual({ n: 1, mean: 0.5, min: 0.5, max: 0.5, stddev: null })
  })

  test('durationSummary/costSummary reflect real spread across repeats (n>1)', () => {
    const rows = aggregate([
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry({ durationMs: 1000, totalCostUsd: 0.1 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry({ durationMs: 3000, totalCostUsd: 0.3 }),
        mechanical: mechanical(),
      }),
    ])
    const row = rows[0]!
    expect(row.durationSummary?.n).toBe(2)
    expect(row.durationSummary?.min).toBe(1000)
    expect(row.durationSummary?.max).toBe(3000)
    expect(row.durationSummary?.mean).toBe(2000)
    expect(row.durationSummary?.stddev).not.toBeNull()
    expect(row.costSummary?.min).toBe(0.1)
    expect(row.costSummary?.max).toBe(0.3)
  })

  test('tokensInSummary/tokensOutSummary are populated from telemetry usage', () => {
    const rows = aggregate([
      result({
        telemetry: telemetry({
          usage: {
            inputTokens: 10,
            outputTokens: 20,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        }),
        mechanical: mechanical(),
      }),
    ])
    expect(rows[0]!.tokensInSummary).toEqual({ n: 1, mean: 10, min: 10, max: 10, stddev: null })
    expect(rows[0]!.tokensOutSummary).toEqual({ n: 1, mean: 20, min: 20, max: 20, stddev: null })
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

  test('the main table header names conformance (not defects) and carries a rubric-caveat legend', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('conformance*')
    expect(text).not.toMatch(/\|\s*defects\s*\|/)
    expect(text).toContain("cospec's OWN opinionated rubric applied to")
    expect(text).toContain('NOT a defect measure')
    expect(text).toContain(
      'native-valid = each arm validating its OWN output with its OWN validator',
    )
  })

  test('the main table carries an "escaped‡" column reporting failed/total hidden tests', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ hiddenTests: { total: 6, failed: 2 } }),
      }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('escaped‡')
    expect(text).toContain('2.0/6.0')
    expect(text).toContain('PRIMARY, tool-neutral')
  })

  test('the "escaped‡" cell renders a dash when hidden tests were not scored', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical({ hiddenTests: null }) }),
    ])
    const text = await Bun.file(path).text()
    const row = text.split('\n').find((l) => l.startsWith('| ci | cospec |'))
    expect(row).toBeDefined()
    expect(row?.split('|').map((c) => c.trim())[8]).toBe('—')
  })

  test('the main table carries a "review§" column reporting mean confirmed review defects', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({
        telemetry: telemetry(),
        mechanical: mechanical({ reviewDefects: { found: 3, confirmed: 2 } }),
      }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('review§')
    expect(text).toContain('ARM-BLIND reviewer')
    const row = text.split('\n').find((l) => l.startsWith('| ci | cospec |'))
    // Column index 9 (1-based between pipes): quality|conformance|native|escaped|review.
    expect(row?.split('|').map((c) => c.trim())[9]).toBe('2.0')
  })

  test('the "review§" cell renders a dash when review did not run for the group', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const text = await Bun.file(path).text()
    const row = text.split('\n').find((l) => l.startsWith('| ci | cospec |'))
    expect(row?.split('|').map((c) => c.trim())[9]).toBe('—')
  })

  test('the main table carries a "plant¶" column reporting the planted-bug-caught rate', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical({ plantedBugCaught: true }) }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('plant¶')
    expect(text).toContain('ADJACENT to')
    const row = text.split('\n').find((l) => l.startsWith('| ci | cospec |'))
    // Column index 10 (1-based between pipes): quality|conformance|native|escaped|review|plant.
    expect(row?.split('|').map((c) => c.trim())[10]).toBe('100%')
  })

  test('the "plant¶" cell renders a dash when the scenario has no plant', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical({ plantedBugCaught: null }) }),
    ])
    const text = await Bun.file(path).text()
    const row = text.split('\n').find((l) => l.startsWith('| ci | cospec |'))
    expect(row?.split('|').map((c) => c.trim())[10]).toBe('—')
  })

  test('"Repeat spread" section states there is nothing to spread when every group has n=1', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, meta, [
      result({ telemetry: telemetry(), mechanical: mechanical() }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('## Repeat spread (n>1 only)')
    expect(text).toContain('_No group has more than one repeat — nothing to spread over._')
  })

  test('"Repeat spread" section renders min/max/stddev when a group has repeats>1', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, { ...meta, ranCells: 2, totalCells: 2 }, [
      result({
        cell: cell({ repeat: 1 }),
        telemetry: telemetry({ durationMs: 1000, totalCostUsd: 0.1 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ repeat: 2 }),
        telemetry: telemetry({ durationMs: 3000, totalCostUsd: 0.3 }),
        mechanical: mechanical(),
      }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('## Repeat spread (n>1 only)')
    expect(text).toContain('| ci | cospec | claude-sonnet-5 | 2 |')
    expect(text).toContain('1000/3000')
  })

  test('carries a "Paired comparison" section wired from pairedComparisons', async () => {
    const runDir = makeRunDir()
    const path = await writeMarkdown(runDir, { ...meta, ranCells: 2, totalCells: 2 }, [
      result({
        cell: cell({ arm: 'cospec' }),
        telemetry: telemetry({ totalCostUsd: 0.1 }),
        mechanical: mechanical(),
      }),
      result({
        cell: cell({ arm: 'openspec' }),
        telemetry: telemetry({ totalCostUsd: 0.9 }),
        mechanical: mechanical(),
      }),
    ])
    const text = await Bun.file(path).text()
    expect(text).toContain('## Paired comparison (cospec vs openspec, matched cells)')
    expect(text).toContain('n=1 — no significance claim')
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
    expect(row.scenarioId).toBe('ci')
  })

  test('judgeError is written verbatim — a judge failure is never invisible', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await appendCellResult(
      runDir,
      result({
        telemetry: telemetry(),
        mechanical: mechanical(),
        quality: null,
        judgeError: '3 sample(s) failed: http 402 x3',
      }),
      NO_SENTINELS,
    )
    const text = await Bun.file(join(runDir, 'cells.jsonl')).text()
    const row = JSON.parse(text.trim().split('\n')[0]!)
    expect(row.quality).toBeNull()
    expect(row.judgeError).toBe('3 sample(s) failed: http 402 x3')
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

describe('writeCellDiff / readCellDiff', () => {
  test('round-trips a diff to snapshots/<key>.diff and reads it back', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    const diff = 'diff --git a/x.ts b/x.ts\n+export const n = 1\n'
    await writeCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1', diff, NO_SENTINELS)
    const readBack = await readCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1')
    expect(readBack).toBe(diff)
  })

  test('an empty (whitespace-only) diff is a no-op — nothing is written', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1', '   \n', NO_SENTINELS)
    expect(await readCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1')).toBeUndefined()
  })

  test('readCellDiff returns undefined for a missing key', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    expect(await readCellDiff(runDir, 'nope__cospec__claude-sonnet-5__r1')).toBeUndefined()
  })

  test('redacts sentinel values in the diff before persisting', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeCellDiff(
      runDir,
      'ci__cospec__claude-sonnet-5__r1',
      '+const ref = "BENCH-SECRET-TOKEN"\n',
      { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' },
    )
    const readBack = await readCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1')
    expect(readBack).toContain('[REDACTED:ref:ci:BENCH-SECRET-TOKEN]')
    expect(readBack).not.toContain('"BENCH-SECRET-TOKEN"')
  })

  test('caps an oversized diff and appends a truncation marker', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    const huge = `+${'x'.repeat(300_000)}\n`
    await writeCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1', huge, NO_SENTINELS)
    const readBack = await readCellDiff(runDir, 'ci__cospec__claude-sonnet-5__r1')
    expect(readBack!.length).toBeLessThan(huge.length)
    expect(readBack).toContain('[... diff truncated for report ...]')
  })
})

describe('writeArtifactSnapshot', () => {
  test('is a no-op when snapshot is undefined (no change was ever produced)', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeArtifactSnapshot(runDir, 'ci__cospec__claude-sonnet-5__r1', undefined, NO_SENTINELS)
    const { readdir } = await import('node:fs/promises')
    await expect(readdir(join(runDir, 'snapshots')).catch(() => [])).resolves.toEqual([])
  })

  test('writes slug, resolved dir, and files to snapshots/<key>.json', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeArtifactSnapshot(runDir, 'ci__cospec__claude-sonnet-5__r1', snapshot(), NO_SENTINELS)
    const parsed = JSON.parse(
      await Bun.file(join(runDir, 'snapshots', 'ci__cospec__claude-sonnet-5__r1.json')).text(),
    )
    expect(parsed).toEqual({
      slug: 'add-widget',
      dir: 'openspec/changes/archive/2026-01-01-add-widget',
      archived: true,
      files: { 'proposal.md': '## Why\n\nreasons\n' },
    })
  })

  test('redacts sentinel values found inside artifact file text', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeArtifactSnapshot(
      runDir,
      'ci__cospec__claude-sonnet-5__r1',
      snapshot({ files: { 'proposal.md': 'ref BENCH-SECRET-TOKEN appears here\n' } }),
      { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' },
    )
    const text = await Bun.file(
      join(runDir, 'snapshots', 'ci__cospec__claude-sonnet-5__r1.json'),
    ).text()
    // The raw ref is gone from its original spot; only the substitution
    // marker remains there (which, by construction here, embeds the label —
    // see redact.ts's REDACTED_MARKER comment for why that is not itself a
    // leak).
    expect(text).toContain('ref [REDACTED:ref:ci:BENCH-SECRET-TOKEN] appears here')
  })

  test('throws if a sentinel somehow survives redaction (self-check)', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    // A sentinel appearing in `slug`/`dir` (not passed through redactText) is
    // exactly the case the assertRedacted self-check exists to catch.
    await expect(
      writeArtifactSnapshot(
        runDir,
        'ci__cospec__claude-sonnet-5__r1',
        snapshot({ slug: 'BENCH-SECRET-TOKEN' }),
        { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' },
      ),
    ).rejects.toThrow(/redaction self-check failed/)
  })
})

describe('readCellsJsonl', () => {
  test('reads back every appended row as a CellResult, in append order', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    const first = result({ cell: cell({ scenarioId: 'ci', repeat: 1 }) })
    const second = result({ cell: cell({ scenarioId: 'feat', repeat: 1 }) })
    await appendCellResult(runDir, first, NO_SENTINELS)
    await appendCellResult(runDir, second, NO_SENTINELS)
    const rows = await readCellsJsonl(runDir)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.cell.scenarioId).toBe('ci')
    expect(rows[1]!.cell.scenarioId).toBe('feat')
  })

  test('throws an actionable error when the dir has no cells.jsonl', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await expect(readCellsJsonl(runDir)).rejects.toThrow(/no cells\.jsonl under/)
  })

  test('throws when a row is not valid JSON', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await Bun.write(join(runDir, 'cells.jsonl'), '{"cell": {}}\nnot json\n')
    await expect(readCellsJsonl(runDir)).rejects.toThrow(/not valid JSON/)
  })

  test('ignores trailing blank lines', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await appendCellResult(runDir, result(), NO_SENTINELS)
    const existing = await Bun.file(join(runDir, 'cells.jsonl')).text()
    await Bun.write(join(runDir, 'cells.jsonl'), `${existing}\n\n`)
    const rows = await readCellsJsonl(runDir)
    expect(rows).toHaveLength(1)
  })
})

describe('writeCellsJsonl — the --judge-report row-update path', () => {
  test('overwrites cells.jsonl so readCellsJsonl reads the updated rows back', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    // Simulate the original (pre-backfill) state, exactly as a live run would
    // have appended it: null quality with a judge failure diagnostic.
    const original = [
      result({
        cell: cell({ scenarioId: 'ci' }),
        telemetry: telemetry(),
        mechanical: mechanical(),
        quality: null,
        judgeError: '3 sample(s) failed: http 402 x3',
      }),
      result({
        cell: cell({ scenarioId: 'feat', repeat: 2 }),
        scenarioId: 'feat',
        telemetry: telemetry(),
        mechanical: mechanical(),
        quality: null,
        judgeError: '3 sample(s) failed: http 402 x3',
      }),
    ]
    for (const r of original) await appendCellResult(runDir, r, NO_SENTINELS)

    // `--judge-report` loads, mutates in place (backfills the first row,
    // clearing its judgeError; leaves the second's failure as-is), then
    // rewrites the whole file.
    const loaded = await readCellsJsonl(runDir)
    loaded[0]!.quality = {
      completeness: 3,
      internalConsistency: 2,
      ambiguity: 2,
      verifiability: 3,
      traceability: 2,
      overall: 2.4,
      samples: 3,
    }
    delete loaded[0]!.judgeError

    await writeCellsJsonl(runDir, loaded, NO_SENTINELS)

    const rows = await readCellsJsonl(runDir)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.scenarioId).toBe('ci')
    expect(rows[0]!.quality).not.toBeNull()
    expect(rows[0]!.quality?.overall).toBeCloseTo(2.4, 5)
    expect(rows[0]!.judgeError).toBeUndefined()
    // The untouched row is preserved byte-for-byte in outcome.
    expect(rows[1]!.scenarioId).toBe('feat')
    expect(rows[1]!.quality).toBeNull()
    expect(rows[1]!.judgeError).toBe('3 sample(s) failed: http 402 x3')
  })

  test('an empty result set writes an empty file rather than throwing', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    await writeCellsJsonl(runDir, [], NO_SENTINELS)
    const text = await Bun.file(join(runDir, 'cells.jsonl')).text()
    expect(text).toBe('')
  })

  test('throws when a sentinel leaks into a row — same redaction guard as appendCellResult', async () => {
    const runDir = makeRunDir()
    await ensureRunDir(runDir)
    const leaking = result({ skipped: 'BENCH-SECRET-TOKEN failed to start' })
    await expect(
      writeCellsJsonl(runDir, [leaking], { 'ref:ci:BENCH-SECRET-TOKEN': 'BENCH-SECRET-TOKEN' }),
    ).rejects.toThrow(/redaction self-check failed/)
  })
})

describe('isStaleSchema', () => {
  test('false for current-schema rows (scenarioId present on every non-skipped cell)', () => {
    const skippedNoScenario = { cell: cell(), skipped: 'x' } as unknown as CellResult
    expect(isStaleSchema([result(), skippedNoScenario])).toBe(false)
  })

  test('true when a non-skipped row predates the scenarioId field', () => {
    const stale = { cell: cell() } as unknown as CellResult
    expect(isStaleSchema([stale])).toBe(true)
  })

  test('a skipped row missing scenarioId does not count as stale', () => {
    const skippedOnly = { cell: cell(), skipped: 'agent did not start' } as unknown as CellResult
    expect(isStaleSchema([skippedOnly])).toBe(false)
  })
})
