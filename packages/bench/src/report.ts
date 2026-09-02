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
import {
  confirmedReviewDefectCount,
  conformanceIssueCount,
  type ArtifactSnapshot,
  type MechanicalMetrics,
} from './mechanical.ts'
import { assertRedacted, redactText, type Sentinels } from './redact.ts'
import {
  pairedComparisons,
  renderPairedComparisonMarkdown,
  summarizeNumeric,
  type NumericSummary,
} from './stats.ts'

export interface CellResult {
  cell: Cell
  /**
   * The scenario's own `id` (NOT its cospec `type`) — grouping/display
   * identity for reports. Deliberately distinct from `type`: a `-hard`
   * variant (see `scenarios/index.ts`'s `HARD_SCENARIOS`) shares its base
   * type with the regular scenario of the same type (e.g. `feat-hard` is
   * `type: 'feat'`), so grouping by `type` would silently merge the two into
   * one aggregate row whenever both are run together (the common case once
   * `--hard` is used without narrowing to just the hard ids). `id` is unique
   * across every registered scenario, so it is always safe to group by.
   */
  scenarioId: string
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
 * Overwrite `<runDir>/cells.jsonl` wholesale with `results`, guarded by the
 * same redaction self-check `appendCellResult` uses. Unlike `appendCellResult`
 * (append-only, for a live run in progress), this is the update path
 * `--judge-report` (`run.ts`) needs after mutating already-written rows in
 * place — filling in a backfilled `quality`, clearing a stale `judgeError` —
 * having loaded them via `readCellsJsonl`. An empty `results` writes an empty
 * file rather than throwing.
 */
export async function writeCellsJsonl(
  runDir: string,
  results: readonly CellResult[],
  sentinels: Sentinels,
): Promise<void> {
  const lines = results.map((r) => JSON.stringify(assertRedacted(r, sentinels)))
  await Bun.write(join(runDir, 'cells.jsonl'), lines.length > 0 ? `${lines.join('\n')}\n` : '')
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

// Defensive ceiling on a persisted cell diff. A well-behaved change is a few
// KB; this only bites a runaway agent that rewrote huge files, where the tail is
// not worth persisting and could bloat the report dir.
const MAX_DIFF_CHARS = 200_000

/**
 * Persist one cell's captured code diff (see `captureSandboxDiff`), REDACTED and
 * size-capped, to `<runDir>/snapshots/<cellKey>.diff` — the input the
 * adversarial review stage (`src/review.ts`) consumes, inline during a run or
 * later via `--review-report`. An empty diff (agent changed nothing outside the
 * excluded dirs) is a no-op. Redaction runs BEFORE truncation so a size cut can
 * never bisect a sentinel and leave an unmatched fragment.
 */
export async function writeCellDiff(
  runDir: string,
  key: string,
  diff: string,
  sentinels: Sentinels,
): Promise<void> {
  if (diff.trim().length === 0) return
  const redacted = redactText(diff, sentinels)
  const capped =
    redacted.length > MAX_DIFF_CHARS
      ? `${redacted.slice(0, MAX_DIFF_CHARS)}\n\n[... diff truncated for report ...]`
      : redacted
  const guarded = assertRedacted(capped, sentinels)
  await mkdir(join(runDir, 'snapshots'), { recursive: true })
  await Bun.write(join(runDir, 'snapshots', `${key}.diff`), guarded)
}

/**
 * Read a run dir's per-cell JSONL rows back into `CellResult` objects — the
 * live source `--resume` computes its already-complete-cell set from (an
 * interrupted run may have no `aggregate.json` yet, since that is only
 * written once at the very end of a run). Throws an actionable error if the
 * file is missing or a row fails to parse, rather than resuming from a
 * silently-partial read.
 */
export async function readCellsJsonl(runDir: string): Promise<CellResult[]> {
  const path = join(runDir, 'cells.jsonl')
  const file = Bun.file(path)
  if (!(await file.exists())) {
    throw new Error(`no cells.jsonl under ${runDir} — --resume requires an existing report dir`)
  }
  const text = await file.text()
  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  const results: CellResult[] = []
  for (const [i, line] of lines.entries()) {
    try {
      results.push(JSON.parse(line) as CellResult)
    } catch {
      throw new Error(`${path}:${i + 1} is not valid JSON — cannot resume from a corrupt report`)
    }
  }
  return results
}

/**
 * True when any non-skipped row predates the `scenarioId` field on
 * `CellResult` (see its doc comment) — a report too old for `--resume` or
 * `--publish-from` to build on.
 */
export function isStaleSchema(cells: readonly CellResult[]): boolean {
  return cells.some((c) => c.skipped === undefined && typeof c.scenarioId !== 'string')
}

/** Read a persisted cell diff, or undefined when none was written (empty / never captured). */
export async function readCellDiff(runDir: string, key: string): Promise<string | undefined> {
  const path = join(runDir, 'snapshots', `${key}.diff`)
  const file = Bun.file(path)
  return (await file.exists()) ? file.text() : undefined
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
  /** Grouping/display identity — see `CellResult.scenarioId`'s doc comment. */
  scenarioId: string
  arm: string
  model: string
  repeats: number
  meanQualityOverall: number | null
  /**
   * Mean schema-conformance issue count (errors+warnings from a post-hoc
   * `cospec validate --json --strict` pass — see `MechanicalMetrics.schemaConformance`
   * in mechanical.ts). This is cospec's OWN opinionated rubric applied to BOTH
   * arms after the fact, NOT a defect measure — a nonzero count for the
   * openspec arm means "does not match cospec's schema," not "is broken." The
   * arm's own validator result is reported separately as
   * `armNativeValidatePassRate` — that is the actual pass/fail signal per tool.
   */
  meanConformanceIssues: number | null
  armNativeValidatePassRate: number | null
  taskCompletionRate: number
  /**
   * Mean FAILED count from the scenario's held-out hidden-test suite (see
   * `MechanicalMetrics.hiddenTests` in mechanical.ts) — the benchmark's PRIMARY
   * defect metric, mechanical, tool-neutral, and scored identically for both
   * arms. null when no cell in this group scored hidden tests (no suite yet /
   * unparseable `bun test` run), never fabricated as 0.
   */
  meanEscapedDefects: number | null
  /** Mean total hidden-test count over the same cells — context for the ratio above. */
  meanHiddenTestsTotal: number | null
  /**
   * Mean CONFIRMED adversarial-review defect count over repeats (see
   * `MechanicalMetrics.reviewDefects` / `src/review.ts`) — bugs an arm-blind
   * reviewer found in the produced diff that survived a refutation pass. null
   * when no cell in this group was reviewed (review is off by default), never
   * fabricated as 0.
   */
  meanConfirmedReviewDefects: number | null
  /**
   * Fraction of this group's cells that CAUGHT their scenario's planted
   * latent bug (see `MechanicalMetrics.plantedBugCaught` /
   * `scenarios/planted/<id>/`) — measures whether the workflow's
   * verification discipline surfaces a defect ADJACENT to the task, never
   * mentioned by the prompt. null when this scenario has no plant, or no cell
   * in this group scored it. Deliberately separate from `meanEscapedDefects`:
   * this is not a double-count of the primary defect signal.
   */
  plantedBugCaughtRate: number | null
  meanDurationMs: number | null
  meanTotalCostUsd: number | null
  meanTokensInput: number | null
  meanTokensOutput: number | null
  /**
   * Full mean/min/max/stddev over repeats (`stddev` null when repeats < 2 —
   * a single repeat has no variance to report). Redundant with the `mean*`
   * fields above at n=1 by construction; present so a run with `--repeats`>1
   * exposes spread instead of only a mean that hides it.
   */
  durationSummary: NumericSummary | null
  costSummary: NumericSummary | null
  tokensInSummary: NumericSummary | null
  tokensOutSummary: NumericSummary | null
}

function mean(values: readonly number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v))
  return finite.length === 0 ? null : finite.reduce((a, b) => a + b, 0) / finite.length
}

function rate(bools: readonly (boolean | null)[]): number | null {
  const known = bools.filter((b): b is boolean => b !== null)
  return known.length === 0 ? null : known.filter(Boolean).length / known.length
}

/** Every `AggregateRow` field EXCEPT the grouping/identity keys — the reduction shared by every grouping. */
type GroupStats = Omit<AggregateRow, 'scenarioId' | 'arm' | 'model'>

/** Reduce one bucket of same-group `CellResult`s over repeats. Grouping-agnostic — see `aggregate`/`aggregateByArmModel`. */
function reduceGroup(bucket: readonly CellResult[]): GroupStats {
  const qualities = bucket
    .map((r) => r.quality?.overall)
    .filter((v): v is number => typeof v === 'number')
  const conformanceIssues = bucket
    .map((r) => conformanceIssueCount(r.mechanical))
    .filter((v): v is number => v !== null)
  const hiddenFailed = bucket
    .map((r) => r.mechanical?.hiddenTests?.failed)
    .filter((v): v is number => typeof v === 'number')
  const hiddenTotal = bucket
    .map((r) => r.mechanical?.hiddenTests?.total)
    .filter((v): v is number => typeof v === 'number')
  const reviewConfirmed = bucket
    .map((r) => confirmedReviewDefectCount(r.mechanical))
    .filter((v): v is number => v !== null)
  return {
    repeats: bucket.length,
    meanQualityOverall: mean(qualities),
    meanConformanceIssues: conformanceIssues.length === 0 ? null : mean(conformanceIssues),
    armNativeValidatePassRate: rate(bucket.map((r) => r.mechanical?.armNativeValidatePass ?? null)),
    taskCompletionRate:
      bucket.filter((r) => r.mechanical?.taskCompleted === true).length / bucket.length,
    meanEscapedDefects: hiddenFailed.length === 0 ? null : mean(hiddenFailed),
    meanHiddenTestsTotal: hiddenTotal.length === 0 ? null : mean(hiddenTotal),
    meanConfirmedReviewDefects: reviewConfirmed.length === 0 ? null : mean(reviewConfirmed),
    plantedBugCaughtRate: rate(bucket.map((r) => r.mechanical?.plantedBugCaught ?? null)),
    meanDurationMs: mean(bucket.map((r) => r.telemetry?.durationMs ?? Number.NaN)),
    meanTotalCostUsd: mean(bucket.map((r) => r.telemetry?.totalCostUsd ?? Number.NaN)),
    meanTokensInput: mean(bucket.map((r) => r.telemetry?.usage?.inputTokens ?? Number.NaN)),
    meanTokensOutput: mean(bucket.map((r) => r.telemetry?.usage?.outputTokens ?? Number.NaN)),
    durationSummary: summarizeNumeric(bucket.map((r) => r.telemetry?.durationMs ?? Number.NaN)),
    costSummary: summarizeNumeric(bucket.map((r) => r.telemetry?.totalCostUsd ?? Number.NaN)),
    tokensInSummary: summarizeNumeric(
      bucket.map((r) => r.telemetry?.usage?.inputTokens ?? Number.NaN),
    ),
    tokensOutSummary: summarizeNumeric(
      bucket.map((r) => r.telemetry?.usage?.outputTokens ?? Number.NaN),
    ),
  }
}

/** Group cells by (scenarioId, arm, model) and reduce over repeats. */
export function aggregate(results: readonly CellResult[]): AggregateRow[] {
  const groups = new Map<string, CellResult[]>()
  for (const r of results) {
    if (r.skipped !== undefined) continue
    const key = `${r.scenarioId}|${r.cell.arm}|${r.cell.model}`
    const bucket = groups.get(key) ?? []
    bucket.push(r)
    groups.set(key, bucket)
  }

  const rows: AggregateRow[] = []
  for (const bucket of groups.values()) {
    const first = bucket[0]
    if (first === undefined) continue
    rows.push({
      scenarioId: first.scenarioId,
      arm: first.cell.arm,
      model: first.cell.model,
      ...reduceGroup(bucket),
    })
  }
  return rows.toSorted(
    (a, b) =>
      a.scenarioId.localeCompare(b.scenarioId) ||
      a.arm.localeCompare(b.arm) ||
      a.model.localeCompare(b.model),
  )
}

export interface ArmModelRow extends GroupStats {
  arm: string
  model: string
}

/**
 * Group cells by (arm, model) ONLY — collapsing every scenario into one
 * top-line row per arm×model, for the compact README summary (see
 * `publish.ts`). Reuses the exact same reduction as `aggregate` (`reduceGroup`)
 * so the two never drift into different definitions of "mean cost" etc.
 */
export function aggregateByArmModel(results: readonly CellResult[]): ArmModelRow[] {
  const groups = new Map<string, CellResult[]>()
  for (const r of results) {
    if (r.skipped !== undefined) continue
    const key = `${r.cell.arm}|${r.cell.model}`
    const bucket = groups.get(key) ?? []
    bucket.push(r)
    groups.set(key, bucket)
  }

  const rows: ArmModelRow[] = []
  for (const bucket of groups.values()) {
    const first = bucket[0]
    if (first === undefined) continue
    rows.push({ arm: first.cell.arm, model: first.cell.model, ...reduceGroup(bucket) })
  }
  return rows.toSorted((a, b) => a.arm.localeCompare(b.arm) || a.model.localeCompare(b.model))
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? '—' : n.toFixed(digits)
}

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n * 100)}%`
}

/** Renders a `NumericSummary` as "min/max (±stddev)"; stddev omitted when null (n < 2). */
function summaryCell(s: NumericSummary | null, digits: number): string {
  if (s === null) return '—'
  const range = `${s.min.toFixed(digits)}/${s.max.toFixed(digits)}`
  return s.stddev === null ? range : `${range} (±${s.stddev.toFixed(digits)})`
}

/** Renders the "escaped‡" column as "meanFailed/meanTotal"; a dash when hidden tests weren't scored. */
function escapedCell(r: GroupStats): string {
  if (r.meanEscapedDefects === null || r.meanHiddenTestsTotal === null) return '—'
  return `${fmt(r.meanEscapedDefects, 1)}/${fmt(r.meanHiddenTestsTotal, 1)}`
}

/** The "run:"/"claude code:"/"judge:"/"cells:" metadata block at the top of `summary.md`. */
export function renderRunMetaLines(meta: RunMeta): string[] {
  return [
    `- run: ${meta.startedAt}`,
    `- claude code: ${meta.claudeCodeVersion ?? 'unknown'}`,
    `- judge: ${meta.judgeEnabled ? (meta.judgeModel ?? 'enabled') : 'disabled (no DEEPSEEK_API_KEY)'}`,
    `- cells: ${meta.ranCells} ran, ${meta.skippedCells} skipped, ${meta.totalCells} total`,
  ]
}

/**
 * The main scenario × arm × model table, its legend/footnotes, the "Repeat
 * spread" section, and the "Paired comparison" section — everything in
 * `summary.md` BELOW the run-metadata block. Shared verbatim by `writeMarkdown`
 * (`summary.md`) and `publish.ts` (`RESULTS.md`), which differ only in their
 * title and provenance header — see that module's doc comment for why this is
 * factored out here rather than duplicated.
 */
export function renderSummaryBody(results: readonly CellResult[]): string[] {
  const rows = aggregate(results)
  const lines: string[] = [
    '| scenario | arm | model | n | quality | conformance* | native-valid† | escaped‡ | review§ | plant¶ | task-done | dur(ms) | cost($) | tok-in | tok-out |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const r of rows) {
    lines.push(
      `| ${r.scenarioId} | ${r.arm} | ${r.model} | ${r.repeats} | ${fmt(r.meanQualityOverall)} | ${fmt(r.meanConformanceIssues, 1)} | ${pct(r.armNativeValidatePassRate)} | ${escapedCell(r)} | ${fmt(r.meanConfirmedReviewDefects, 1)} | ${pct(r.plantedBugCaughtRate)} | ${pct(r.taskCompletionRate)} | ${fmt(r.meanDurationMs, 0)} | ${fmt(r.meanTotalCostUsd, 4)} | ${fmt(r.meanTokensInput, 0)} | ${fmt(r.meanTokensOutput, 0)} |`,
    )
  }
  if (rows.length === 0) lines.push('', '_No cells ran._')
  lines.push(
    '',
    '\\* conformance = mean schema-conformance issue count (errors+warnings) from a post-hoc',
    "  `cospec validate --json --strict` pass — cospec's OWN opinionated rubric applied to",
    '  BOTH arms after the fact. It is NOT a defect measure: a nonzero count for the openspec',
    '  arm means "does not match cospec\'s schema," not "is broken."',
    '† native-valid = each arm validating its OWN output with its OWN validator',
    '  (`cospec validate` for the cospec arm, `openspec validate` for the openspec arm) — the',
    '  actual pass/fail bar per tool, reported alongside conformance for contrast.',
    "‡ escaped = mean FAILED count / mean total count from the scenario's held-out hidden-test",
    '  suite (`scenarios/hidden/<id>/`, never seen by the agent) — the PRIMARY, tool-neutral',
    '  defect signal, scored identically for both arms; contrast with conformance*, which is',
    "  cospec's own rubric applied only post-hoc.",
    '§ review = mean CONFIRMED adversarial-review defect count — bugs an ARM-BLIND reviewer found',
    '  in the produced code diff that survived a refutation pass (see `src/review.ts`). A dash',
    '  means review did not run for this group (off by default; enable with `--review`, or run',
    '  `--review-report <dir>` over a past run). Reviewers never learn which arm produced a diff.',
    "¶ plant = share of cells that caught this scenario's PLANTED latent bug — a defect seeded",
    '  ADJACENT to (never inside) the task subject, never mentioned by the prompt (see',
    '  `scenarios/planted/<id>/`). A dash means this scenario has no plant. Measures whether the',
    "  workflow's verification discipline surfaces a nearby defect; distinct from escaped‡, which",
    '  is scored against the task the prompt actually asked for — a plant left unfixed is never',
    '  double-counted there.',
    '',
  )

  const spread = rows.filter((r) => r.repeats > 1)
  lines.push('## Repeat spread (n>1 only)', '')
  if (spread.length === 0) {
    lines.push('_No group has more than one repeat — nothing to spread over._', '')
  } else {
    lines.push(
      '| scenario | arm | model | n | duration(ms) min/max/stddev | cost($) min/max/stddev |',
      '| --- | --- | --- | --- | --- | --- |',
    )
    for (const r of spread) {
      lines.push(
        `| ${r.scenarioId} | ${r.arm} | ${r.model} | ${r.repeats} | ${summaryCell(r.durationSummary, 0)} | ${summaryCell(r.costSummary, 4)} |`,
      )
    }
    lines.push('')
  }

  lines.push(...renderPairedComparisonMarkdown(pairedComparisons(results)))
  return lines
}

/**
 * Compact top-line table — one row per (arm, model), collapsed across every
 * scenario — for the README managed block (see `publish.ts`). Deliberately a
 * small subset of `renderSummaryBody`'s columns: escaped defects, confirmed
 * review defects, planted-bug catch rate, mean cost, mean duration. Full
 * per-scenario detail and the metric legend live only in `RESULTS.md`, linked
 * from the README block rather than duplicated.
 */
export function renderCompactArmModelMarkdown(rows: readonly ArmModelRow[]): string[] {
  const lines: string[] = [
    '| arm | model | n | escaped‡ | review§ | plant¶ | cost($) | dur(ms) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ]
  for (const r of rows) {
    lines.push(
      `| ${r.arm} | ${r.model} | ${r.repeats} | ${escapedCell(r)} | ${fmt(r.meanConfirmedReviewDefects, 1)} | ${pct(r.plantedBugCaughtRate)} | ${fmt(r.meanTotalCostUsd, 4)} | ${fmt(r.meanDurationMs, 0)} |`,
    )
  }
  if (rows.length === 0) lines.push('', '_No cells ran._')
  return lines
}

/** Human-readable markdown summary: one row per (scenarioId, arm, model). */
export async function writeMarkdown(
  runDir: string,
  meta: RunMeta,
  results: readonly CellResult[],
): Promise<string> {
  const lines: string[] = [
    '# cospec vs openspec — benchmark summary',
    '',
    ...renderRunMetaLines(meta),
    '',
    ...renderSummaryBody(results),
  ]
  const path = join(runDir, 'summary.md')
  await Bun.write(path, lines.join('\n'))
  return path
}

export { cellKey }
