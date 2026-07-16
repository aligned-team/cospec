// Report writers: per-cell JSONL (appended as cells finish), an aggregate JSON
// (raw rows + means over repeats), and a human-readable markdown summary table.
// Every object passes the redaction guard before it touches disk — reports carry
// counts, scores, rule ids, durations, and token/cost telemetry only, never a
// key, prompt, completion, or artifact body.

import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import type { AgentTelemetry } from './agent.ts'
import type { QualityScore } from './judge.ts'
import { cellKey, type Cell } from './matrix.ts'
import type { ArtifactSnapshot, MechanicalMetrics } from './mechanical.ts'
import { assertRedacted, redactText, type Sentinels } from './redact.ts'

export interface CellResult {
  cell: Cell
  scenarioType: string
  /** Set when the cell was skipped (missing auth, sandbox failure) rather than run. */
  skipped?: string
  telemetry?: AgentTelemetry
  mechanical?: MechanicalMetrics
  /** DeepSeek-judged quality, or null when the judge was unavailable/failed. */
  quality?: QualityScore | null
  /**
   * Set only when quality is null BECAUSE every judge sample failed (not when
   * the judge was simply disabled or there was nothing to judge). A short,
   * non-sensitive diagnostic (HTTP status / finish_reason / parse outcome) —
   * never the API key or a raw completion. See `judge.ts`'s `JudgeResult`.
   */
  judgeError?: string
}

export interface RunMeta {
  version: number
  startedAt: string
  claudeCodeVersion?: string
  judgeModel?: string
  judgeEnabled: boolean
  totalCells: number
  ranCells: number
  skippedCells: number
}

export async function ensureRunDir(runDir: string): Promise<void> {
  await mkdir(runDir, { recursive: true })
}

/** Append one guarded cell result as a JSONL row. */
export async function appendCellResult(
  runDir: string,
  result: CellResult,
  sentinels: Sentinels,
): Promise<void> {
  const guarded = assertRedacted(result, sentinels)
  await appendFile(join(runDir, 'cells.jsonl'), `${JSON.stringify(guarded)}\n`)
}

/**
 * Persist a REDACTED snapshot of one cell's change artifacts, before the
 * sandbox is torn down, so a scoring bug (mechanical or judge) can be
 * re-scored later without re-running the agent. Written under
 * `<runDir>/snapshots/<cellKey>.json`. `snapshot === undefined` (no change
 * ever produced) is a no-op — nothing to persist.
 */
export async function writeArtifactSnapshot(
  runDir: string,
  key: string,
  snapshot: ArtifactSnapshot | undefined,
  sentinels: Sentinels,
): Promise<void> {
  if (snapshot === undefined) return
  const redacted = {
    slug: snapshot.slug,
    dir: snapshot.dir,
    archived: snapshot.archived,
    files: Object.fromEntries(
      Object.entries(snapshot.files).map(([rel, text]) => [rel, redactText(text, sentinels)]),
    ),
  }
  const guarded = assertRedacted(redacted, sentinels)
  await mkdir(join(runDir, 'snapshots'), { recursive: true })
  await Bun.write(join(runDir, 'snapshots', `${key}.json`), `${JSON.stringify(guarded, null, 2)}\n`)
}

export async function writeAggregate(
  runDir: string,
  meta: RunMeta,
  results: readonly CellResult[],
  sentinels: Sentinels,
): Promise<string> {
  const report = assertRedacted({ meta, cells: results, aggregates: aggregate(results) }, sentinels)
  const path = join(runDir, 'aggregate.json')
  await Bun.write(path, `${JSON.stringify(report, null, 2)}\n`)
  return path
}

export interface AggregateRow {
  scenarioType: string
  arm: string
  model: string
  repeats: number
  meanQualityOverall: number | null
  meanDefects: number | null
  armNativeValidatePassRate: number | null
  taskCompletionRate: number
  meanDurationMs: number | null
  meanTotalCostUsd: number | null
  meanTokensInput: number | null
  meanTokensOutput: number | null
}

function mean(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v))
  return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length
}

function rate(bools: readonly (boolean | null)[]): number | null {
  const known = bools.filter((b): b is boolean => b !== null)
  return known.length === 0 ? null : known.filter(Boolean).length / known.length
}

function defectCount(m: MechanicalMetrics | undefined): number | null {
  if (m?.cospecValidate == null) return null
  return m.cospecValidate.errors + m.cospecValidate.warnings
}

/** Group cells by (type, arm, model) and reduce over repeats. */
export function aggregate(results: readonly CellResult[]): AggregateRow[] {
  const groups = new Map<string, CellResult[]>()
  for (const r of results) {
    if (r.skipped !== undefined) continue
    const key = `${r.scenarioType}|${r.cell.arm}|${r.cell.model}`
    const bucket = groups.get(key) ?? []
    bucket.push(r)
    groups.set(key, bucket)
  }

  const rows: AggregateRow[] = []
  for (const bucket of groups.values()) {
    const first = bucket[0]
    if (first === undefined) continue
    const qualities = bucket
      .map((r) => r.quality?.overall)
      .filter((v): v is number => typeof v === 'number')
    const defects = bucket
      .map((r) => defectCount(r.mechanical))
      .filter((v): v is number => v !== null)
    rows.push({
      scenarioType: first.scenarioType,
      arm: first.cell.arm,
      model: first.cell.model,
      repeats: bucket.length,
      meanQualityOverall: mean(qualities),
      meanDefects: defects.length === 0 ? null : mean(defects),
      armNativeValidatePassRate: rate(
        bucket.map((r) => r.mechanical?.armNativeValidatePass ?? null),
      ),
      taskCompletionRate:
        bucket.filter((r) => r.mechanical?.taskCompleted === true).length / bucket.length,
      meanDurationMs: mean(bucket.map((r) => r.telemetry?.durationMs ?? Number.NaN)),
      meanTotalCostUsd: mean(bucket.map((r) => r.telemetry?.totalCostUsd ?? Number.NaN)),
      meanTokensInput: mean(bucket.map((r) => r.telemetry?.usage?.inputTokens ?? Number.NaN)),
      meanTokensOutput: mean(bucket.map((r) => r.telemetry?.usage?.outputTokens ?? Number.NaN)),
    })
  }
  return rows.toSorted(
    (a, b) =>
      a.scenarioType.localeCompare(b.scenarioType) ||
      a.arm.localeCompare(b.arm) ||
      a.model.localeCompare(b.model),
  )
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? '—' : n.toFixed(digits)
}

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`
}

/** Human-readable markdown summary: one row per (type, arm, model). */
export async function writeMarkdown(
  runDir: string,
  meta: RunMeta,
  results: readonly CellResult[],
): Promise<string> {
  const rows = aggregate(results)
  const lines: string[] = [
    '# cospec vs openspec — benchmark summary',
    '',
    `- run: ${meta.startedAt}`,
    `- claude code: ${meta.claudeCodeVersion ?? 'unknown'}`,
    `- judge: ${meta.judgeEnabled ? (meta.judgeModel ?? 'enabled') : 'disabled (no DEEPSEEK_API_KEY)'}`,
    `- cells: ${meta.ranCells} ran, ${meta.skippedCells} skipped, ${meta.totalCells} total`,
    '',
    '| type | arm | model | n | quality | defects | native-valid | task-done | dur(ms) | cost($) | tok-in | tok-out |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const r of rows) {
    lines.push(
      `| ${r.scenarioType} | ${r.arm} | ${r.model} | ${r.repeats} | ${fmt(r.meanQualityOverall)} | ${fmt(r.meanDefects, 1)} | ${pct(r.armNativeValidatePassRate)} | ${pct(r.taskCompletionRate)} | ${fmt(r.meanDurationMs, 0)} | ${fmt(r.meanTotalCostUsd, 4)} | ${fmt(r.meanTokensInput, 0)} | ${fmt(r.meanTokensOutput, 0)} |`,
    )
  }
  if (rows.length === 0) lines.push('', '_No cells ran._')
  lines.push('')
  const path = join(runDir, 'summary.md')
  await Bun.write(path, lines.join('\n'))
  return path
}

export { cellKey }
