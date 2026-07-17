// Statistics for repeated bench cells: numeric summaries (mean/min/max/stddev)
// and paired arm-vs-arm comparisons on MATCHED cells (same scenario id +
// model + repeat, one cospec cell and one openspec cell). Pure functions over
// CellResult-shaped data — no I/O, no subprocess — so every function here is
// unit-testable against synthetic rows.
//
// Why this exists: with `--repeats` defaulting to 1, most cell groups have
// n=1 per arm, which cannot support any variance or significance claim. This
// module says so explicitly (`distinguishable: false`, an n=1 verdict string)
// rather than rendering a spurious "cospec wins" off a single sample per arm.

import type { Arm } from './matrix.ts'
import { confirmedReviewDefectCount, conformanceIssueCount } from './mechanical.ts'
import type { CellResult } from './report.ts'

export interface NumericSummary {
  n: number
  mean: number
  min: number
  max: number
  /** Sample stddev (n-1 denominator); null when n < 2 — never fabricated as 0. */
  stddev: number | null
}

/** Mean/min/max/stddev over finite numbers. null on an empty/all-non-finite input. */
export function summarizeNumeric(values: readonly number[]): NumericSummary | null {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return null
  const n = finite.length
  const mean = finite.reduce((a, b) => a + b, 0) / n
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const stddev = n < 2 ? null : Math.sqrt(finite.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1))
  return { n, mean, min, max, stddev }
}

/** True when two inclusive ranges overlap — the "spread crosses the tie line" check. */
export function rangesOverlap(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.max(a[0], b[0]) <= Math.min(a[1], b[1])
}

/** n-choose-k, computed iteratively (no factorial overflow) — n here is always a small cell count. */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 0; i < k; i += 1) result = (result * (n - i)) / (i + 1)
  return result
}

/**
 * Two-sided exact sign-test p-value for `wins` successes out of `n` decided
 * (non-tied) trials under H0: P(win) = 0.5 — i.e. the two arms are equally
 * likely to win a matched pair on this metric. Returns null when n < 2: a
 * single decided pair carries no statistical information about which arm is
 * systematically better, so no p-value is reported (never fabricated as 1 or
 * 0).
 */
export function signTestPValue(wins: number, n: number): number | null {
  if (n < 2) return null
  const k = Math.min(wins, n - wins)
  let tail = 0
  for (let i = 0; i <= k; i += 1) tail += choose(n, i) * 0.5 ** n
  return Math.min(1, 2 * tail)
}

export type PairedMetric = 'cost' | 'duration' | 'conformanceIssues' | 'reviewDefects'

export const PAIRED_METRICS: readonly PairedMetric[] = [
  'cost',
  'duration',
  'conformanceIssues',
  'reviewDefects',
]

export interface PairedMetricComparison {
  metric: PairedMetric
  /** Matched pairs with a defined value on both sides for this metric. */
  pairs: number
  cospecWins: number
  openspecWins: number
  ties: number
  cospecSummary: NumericSummary | null
  openspecSummary: NumericSummary | null
  /** null when fewer than 2 decided (non-tied) pairs — see signTestPValue. */
  signTestPValue: number | null
  /**
   * true only when there are >=2 pairs AND the two arms' [min,max] ranges do
   * NOT overlap — i.e. every cospec value beat every openspec value or vice
   * versa. false (never a spurious win) whenever pairs < 2 or the ranges
   * cross the tie line.
   */
  distinguishable: boolean
  /** Human-readable one-line summary, always states n and never overclaims at n=1. */
  verdict: string
}

export interface PairedComparisonGroup {
  /** Grouping/display identity — see `report.ts`'s `CellResult.scenarioId` doc comment. */
  scenarioId: string
  model: string
  metrics: PairedMetricComparison[]
}

interface MatchedPair {
  cospec: number
  openspec: number
}

/** Lower is better for every metric this module compares (cost, duration, conformance issues). */
function metricValue(metric: PairedMetric, r: CellResult): number | undefined {
  switch (metric) {
    case 'cost':
      return r.telemetry?.totalCostUsd
    case 'duration':
      return r.telemetry?.durationMs
    case 'conformanceIssues': {
      const v = conformanceIssueCount(r.mechanical)
      return v === null ? undefined : v
    }
    case 'reviewDefects': {
      const v = confirmedReviewDefectCount(r.mechanical)
      return v === null ? undefined : v
    }
  }
}

function compareMetric(
  metric: PairedMetric,
  pairs: readonly MatchedPair[],
): PairedMetricComparison {
  let cospecWins = 0
  let openspecWins = 0
  let ties = 0
  for (const p of pairs) {
    if (p.cospec < p.openspec) cospecWins += 1
    else if (p.openspec < p.cospec) openspecWins += 1
    else ties += 1
  }
  const decided = cospecWins + openspecWins
  const cospecSummary = summarizeNumeric(pairs.map((p) => p.cospec))
  const openspecSummary = summarizeNumeric(pairs.map((p) => p.openspec))
  const pValue = signTestPValue(cospecWins, decided)

  let distinguishable = false
  let verdict: string
  if (pairs.length === 0) {
    verdict = 'no matched pairs'
  } else if (pairs.length < 2) {
    verdict = 'n=1 — no significance claim'
  } else if (
    cospecSummary !== null &&
    openspecSummary !== null &&
    rangesOverlap(
      [cospecSummary.min, cospecSummary.max],
      [openspecSummary.min, openspecSummary.max],
    )
  ) {
    verdict = `not distinguishable at this n (n=${pairs.length}, ranges overlap)`
  } else {
    distinguishable = true
    const leader =
      cospecWins > openspecWins ? 'cospec' : openspecWins > cospecWins ? 'openspec' : 'tie'
    const pStr = pValue === null ? 'n/a' : pValue.toFixed(3)
    verdict = `${leader} wins ${Math.max(cospecWins, openspecWins)}/${decided} (sign test p=${pStr})`
  }

  return {
    metric,
    pairs: pairs.length,
    cospecWins,
    openspecWins,
    ties,
    cospecSummary,
    openspecSummary,
    signTestPValue: pValue,
    distinguishable,
    verdict,
  }
}

/**
 * Paired per-(scenarioId, model) win/loss comparison between the `cospec`
 * and `openspec` arms on MATCHED cells — same scenario id + model + repeat,
 * both arms present and neither skipped. `conformanceIssues` compares
 * `schemaConformance` counts (cospec's own rubric — see mechanical.ts) and
 * `reviewDefects` compares confirmed adversarial-review defect counts (see
 * review.ts), each once populated on both sides; both are null-guarded, so a
 * metric with no matched pairs (e.g. review never ran) renders no row.
 */
export function pairedComparisons(results: readonly CellResult[]): PairedComparisonGroup[] {
  const groups = new Map<string, Map<number, Partial<Record<Arm, CellResult>>>>()
  for (const r of results) {
    if (r.skipped !== undefined) continue
    const groupKey = `${r.scenarioId}|${r.cell.model}`
    const byRepeat = groups.get(groupKey) ?? new Map<number, Partial<Record<Arm, CellResult>>>()
    const slot = byRepeat.get(r.cell.repeat) ?? {}
    slot[r.cell.arm] = r
    byRepeat.set(r.cell.repeat, slot)
    groups.set(groupKey, byRepeat)
  }

  const out: PairedComparisonGroup[] = []
  for (const [groupKey, byRepeat] of groups) {
    const [scenarioId = '', model = ''] = groupKey.split('|')
    const metrics = PAIRED_METRICS.map((metric) => {
      const pairs: MatchedPair[] = []
      for (const slot of byRepeat.values()) {
        if (slot.cospec === undefined || slot.openspec === undefined) continue
        const cospecValue = metricValue(metric, slot.cospec)
        const openspecValue = metricValue(metric, slot.openspec)
        if (cospecValue === undefined || openspecValue === undefined) continue
        pairs.push({ cospec: cospecValue, openspec: openspecValue })
      }
      return compareMetric(metric, pairs)
    })
    out.push({ scenarioId, model, metrics })
  }
  return out.toSorted(
    (a, b) => a.scenarioId.localeCompare(b.scenarioId) || a.model.localeCompare(b.model),
  )
}

const METRIC_LABEL: Record<PairedMetric, string> = {
  cost: 'cost($)',
  duration: 'duration(ms)',
  conformanceIssues: 'conformance issues',
  reviewDefects: 'review defects',
}

/**
 * Render `pairedComparisons`' output as a markdown section. Renders sensibly
 * at n=1 (every row states "n=1 — no significance claim" rather than a bare
 * "—"), and when there are no matched pairs at all.
 */
export function renderPairedComparisonMarkdown(groups: readonly PairedComparisonGroup[]): string[] {
  const lines: string[] = [
    '## Paired comparison (cospec vs openspec, matched cells)',
    '',
    'Matches cells with the same scenario id + model + repeat; skipped cells are',
    'excluded. Lower is better for every metric below. `conformance issues` is',
    "cospec's own post-hoc schema-conformance rubric applied to BOTH arms (see the",
    "summary table's `conformance*` column) — not a defect count. A group is",
    '"not distinguishable at this n" whenever the two arms\' value ranges overlap,',
    'or there are fewer than 2 matched pairs — this harness never asserts a winner',
    'off a single repeat.',
    '',
  ]

  if (groups.length === 0) {
    lines.push(
      '_No matched pairs (need both arms present for the same scenario+model+repeat)._',
      '',
    )
    return lines
  }

  lines.push(
    '| scenario | model | metric | pairs | cospec wins | openspec wins | ties | verdict |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  )
  for (const group of groups) {
    for (const m of group.metrics) {
      if (m.pairs === 0) continue
      lines.push(
        `| ${group.scenarioId} | ${group.model} | ${METRIC_LABEL[m.metric]} | ${m.pairs} | ${m.cospecWins} | ${m.openspecWins} | ${m.ties} | ${m.verdict} |`,
      )
    }
  }
  if (lines[lines.length - 1] === '| --- | --- | --- | --- | --- | --- | --- | --- |') {
    lines.push(
      '',
      '_No matched pairs (need both arms present for the same scenario+model+repeat)._',
    )
  }
  lines.push('')
  return lines
}
