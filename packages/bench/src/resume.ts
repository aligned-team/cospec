// Pure `--resume` support logic (see `run.ts`'s usage and `docs/bench.md`'s
// "Resuming a run" section), plus the analogous skip predicate `--judge-report`
// (`docs/bench.md`'s "Judge backfill" section) reuses. Kept in its own module —
// rather than inline in `run.ts` — because `run.ts` self-executes its `main()`
// on import (`process.exit(await main())` at the bottom), so nothing in it can
// be imported by a unit test without also running the whole harness. Everything
// here is a plain function over `Cell`/`CellResult` values: no filesystem, no
// subprocess, no LLM call — those live in `report.ts` (`readCellsJsonl`,
// `isStaleSchema`, `writeCellsJsonl`) and `review.ts`/`judge.ts` (`reviewDiff`,
// `judgeArtifacts`), which `run.ts` composes with this module's pure
// partitioning/predicate logic.

import { cellKey, type Cell } from './matrix.ts'
import type { CellResult } from './report.ts'

/** The set of `cellKey`s already present in a loaded report's rows — the cells `--resume` must skip. */
export function completedCellKeys(existing: readonly CellResult[]): Set<string> {
  return new Set(existing.map((r) => cellKey(r.cell)))
}

export interface ResumePlan {
  /** Cells not yet present in the loaded report — these actually get run. */
  toRun: Cell[]
  /** Cells already present — skipped entirely (never re-run, never re-scored mechanically). */
  skipped: Cell[]
}

/**
 * Split the FULL requested matrix (the same `expandMatrix` output a fresh run
 * would produce) into cells to run vs. cells to skip, by `cellKey` — which
 * includes the repeat index (`r1`/`r2`/…, see `matrix.ts`'s `cellKey`), so a
 * `--repeats 3` run resumes per-repeat, not per-scenario: repeat 1 and 2
 * already complete and repeat 3 missing correctly skips only the first two.
 */
export function partitionResumeCells(
  cells: readonly Cell[],
  existing: readonly CellResult[],
): ResumePlan {
  const completed = completedCellKeys(existing)
  const toRun: Cell[] = []
  const skipped: Cell[] = []
  for (const cell of cells) {
    if (completed.has(cellKey(cell))) {
      skipped.push(cell)
    } else {
      toRun.push(cell)
    }
  }
  return { toRun, skipped }
}

/**
 * True when an already-complete cell needs the adversarial review stage
 * backfilled onto it: it was scored (not skipped, has `mechanical`) but
 * carries no `reviewDefects` yet — review was off, or failed, on the
 * original invocation. False for a cell that already has `reviewDefects` —
 * `--resume --review` must never re-review an already-reviewed cell.
 */
export function needsReviewBackfill(result: CellResult): boolean {
  return (
    result.skipped === undefined &&
    result.mechanical !== undefined &&
    result.mechanical.reviewDefects === undefined
  )
}

/**
 * True when a PAST run's cell needs its quality judge backfilled from a
 * persisted artifact snapshot: it ran (not skipped) but its `quality` came
 * back exactly `null` — judge disabled, every sample failed (e.g. DeepSeek's
 * HTTP 402 on this benchmark's first full run), or nothing was there to judge
 * at the time. `--judge-report` (`run.ts`) rebuilds the judge input from
 * `snapshots/<cellKey>.json` for exactly this set. False once a cell already
 * carries a real `QualityScore` (`quality` is an object, not `null`) — a cell
 * `--judge-report` must never re-judge — and false for a skipped cell (never
 * had a `quality` field to begin with, so `undefined !== null` excludes it
 * without a separate `skipped` check, but the explicit check documents the
 * intent rather than relying on that coincidence).
 */
export function needsJudgeBackfill(result: CellResult): boolean {
  return result.skipped === undefined && result.quality === null
}
