// `cospec __complete` startup timing — `mise run bench:complete`, and the first
// step of `mise run bench:smoke`.
//
// A completion helper runs on every Tab press, so its startup is the one cospec
// latency a user feels directly. This times `cospec __complete changes` against
// this repo's own openspec/ tree and reports the median against a recorded
// budget. Advisory only: wall-clock numbers on shared CI runners are noisy, so
// an overrun is reported (stdout, and the GitHub step summary when present) and
// the process ALWAYS exits 0. The functional guarantee — lazy modules, no
// telemetry — is a unit test in apps/cli, not this.
//
// By default it times the source entry under the current bun. Set COSPEC_BIN to
// a compiled binary (`mise run build` → apps/cli/dist/cospec) to time what users
// actually run.

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Recorded median budget for one `__complete changes` call from the source
 * entry, in ms. Set from local and ubuntu-latest measurements of the 1.15.0
 * pin with headroom; revisit when the measured median moves, not per run.
 * COSPEC_COMPLETE_BUDGET_MS overrides it (e.g. a tighter budget for COSPEC_BIN).
 */
export const COMPLETE_BUDGET_MS = 1500

export const DEFAULT_RUNS = 20

export interface CompleteTiming {
  runs: number
  medianMs: number
  p95Ms: number
  minMs: number
  maxMs: number
  budgetMs: number
  overBudget: boolean
  /** Runs that exited nonzero; their time still counts (the user waited for it). */
  failures: number
}

function quantile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))
  return sorted[index] ?? Number.NaN
}

/** Median (mean of the two middle samples on even n), p95, min, max against a budget. */
export function summarizeTimings(
  samples: readonly number[],
  budgetMs: number,
  failures = 0,
): CompleteTiming | null {
  const sorted = samples.filter((s) => Number.isFinite(s)).toSorted((a, b) => a - b)
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  const medianMs =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? Number.NaN)
  return {
    runs: sorted.length,
    medianMs,
    p95Ms: quantile(sorted, 0.95),
    minMs: sorted[0] ?? Number.NaN,
    maxMs: sorted[sorted.length - 1] ?? Number.NaN,
    budgetMs,
    overBudget: medianMs > budgetMs,
    failures,
  }
}

export function renderTiming(t: CompleteTiming, target: string): string {
  const verdict = t.overBudget
    ? `OVER BUDGET by ${(t.medianMs - t.budgetMs).toFixed(0)} ms (advisory)`
    : 'within budget'
  const lines = [
    `### \`cospec __complete changes\` startup (${target})`,
    '',
    `| runs | median | p95 | min | max | budget | verdict |`,
    `| ---: | ---: | ---: | ---: | ---: | ---: | --- |`,
    `| ${t.runs} | ${t.medianMs.toFixed(0)} ms | ${t.p95Ms.toFixed(0)} ms | ${t.minMs.toFixed(0)} ms | ${t.maxMs.toFixed(0)} ms | ${t.budgetMs} ms | ${verdict} |`,
  ]
  if (t.failures > 0) lines.push('', `${t.failures} run(s) exited nonzero.`)
  return lines.join('\n')
}

async function main(): Promise<void> {
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
  const bin = process.env.COSPEC_BIN
  const command = bin
    ? [bin, '__complete', 'changes']
    : [process.execPath, join(repoRoot, 'apps/cli/src/index.ts'), '__complete', 'changes']
  const target = bin ? bin : 'source entry'
  const budgetEnv = Number(process.env.COSPEC_COMPLETE_BUDGET_MS)
  const budgetMs = Number.isFinite(budgetEnv) && budgetEnv > 0 ? budgetEnv : COMPLETE_BUDGET_MS
  const runsEnv = Number(process.env.COSPEC_COMPLETE_RUNS)
  const runs = Number.isInteger(runsEnv) && runsEnv > 0 ? runsEnv : DEFAULT_RUNS

  const spawnOnce = async (): Promise<{ ms: number; ok: boolean }> => {
    const start = performance.now()
    const proc = Bun.spawn(command, { cwd: repoRoot, stdout: 'ignore', stderr: 'ignore' })
    const code = await proc.exited
    return { ms: performance.now() - start, ok: code === 0 }
  }

  // One untimed warm-up so the first sample is not a cold filesystem cache.
  await spawnOnce()
  const samples: number[] = []
  let failures = 0
  for (let i = 0; i < runs; i++) {
    const { ms, ok } = await spawnOnce()
    samples.push(ms)
    if (!ok) failures++
  }

  const timing = summarizeTimings(samples, budgetMs, failures)
  if (timing === null) {
    console.log('__complete timing: no samples recorded')
    return
  }
  const report = renderTiming(timing, target)
  console.log(report)
  const summary = process.env.GITHUB_STEP_SUMMARY
  if (summary) appendFileSync(summary, `${report}\n`)
  if (timing.overBudget && process.env.GITHUB_ACTIONS === 'true') {
    console.log(
      `::warning::cospec __complete median ${timing.medianMs.toFixed(0)} ms exceeds the ${budgetMs} ms budget (advisory)`,
    )
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    // Advisory: report the failure but never fail the caller.
    console.log(
      `__complete timing could not run: ${error instanceof Error ? error.message : error}`,
    )
  }
}
