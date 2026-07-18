// Bench harness entry point — `mise run bench` / `mise run bench:smoke`.
//
// Expands the (scenario × arm × model × repeat) matrix, runs each cell in an
// isolated hermetic sandbox through real headless Claude Code (Agent SDK), scores
// mechanical metrics and an optional DeepSeek quality judge, and writes a
// gitignored report (JSONL + aggregate JSON + markdown table). Advisory only: it
// ALWAYS exits 0 and is never part of `mise run check`. Auth is inherited from
// the process env (session via CLAUDE_CONFIG_DIR; ANTHROPIC_API_KEY wins if set);
// a cell whose agent cannot authenticate is skipped gracefully.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALL_SCENARIOS, scenarioById } from '../scenarios/index.ts'
import { runAgent, type AgentTelemetry } from './agent.ts'
import { collectArtifactText, judgeArtifacts, type JudgeConfig } from './judge.ts'
import { cellKey, expandMatrix, parseArgs, type Cell, type MatrixFilters } from './matrix.ts'
import { resolveChange, scoreMechanical, snapshotChangeArtifacts } from './mechanical.ts'
import { publishFromReportDir, publishResults } from './publish.ts'
import { redactText, type Sentinels } from './redact.ts'
import {
  appendCellResult,
  ensureRunDir,
  isStaleSchema,
  readCellDiff,
  readCellsJsonl,
  writeAggregate,
  writeArtifactSnapshot,
  writeCellDiff,
  writeMarkdown,
  type CellResult,
  type RunMeta,
} from './report.ts'
import { needsReviewBackfill, partitionResumeCells } from './resume.ts'
import { defaultReviewRunner, reviewDiff } from './review.ts'
import { captureSandboxDiff, createArmSandbox, teardown } from './sandbox.ts'
import { buildSentinels } from './sentinels.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', 'scenarios')

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Run one cell end-to-end: sandbox → agent → diff capture → mechanical → judge → teardown. */
async function runCell(
  cell: Cell,
  judge: JudgeConfig | undefined,
  sentinels: Sentinels,
  runDir: string,
  review: boolean,
): Promise<CellResult> {
  const scenario = scenarioById(cell.scenarioId)
  if (scenario === undefined) {
    return { cell, scenarioId: cell.scenarioId, skipped: `no such scenario: ${cell.scenarioId}` }
  }
  const base: CellResult = { cell, scenarioId: scenario.id }
  const fixtureAbsDir = join(SCENARIOS_DIR, scenario.fixtureDir)

  let sandboxDir: string | undefined
  try {
    const sandbox = await createArmSandbox(REPO_ROOT, fixtureAbsDir, cell.arm)
    sandboxDir = sandbox.dir

    const telemetry: AgentTelemetry = await runAgent({
      sandboxDir: sandbox.dir,
      arm: cell.arm,
      model: cell.model,
      prompt: scenario.prompt,
      maxTurns: scenario.maxTurns,
    })
    base.telemetry = telemetry

    // A crash with no result message almost always means auth is unavailable —
    // skip gracefully rather than reporting a zeroed cell as if it ran.
    if (telemetry.crashed !== undefined && telemetry.resultSubtype === undefined) {
      return { ...base, skipped: `agent did not start (${telemetry.crashed})` }
    }

    // Capture + persist the code diff BEFORE mechanical scoring seeds
    // `hidden-tests/` into the sandbox, so the snapshot is purely the agent's
    // change. Redacted on disk; the same redacted text feeds any review.
    const rawDiff = await captureSandboxDiff(sandbox.dir)
    const diff = redactText(rawDiff, sentinels)
    await writeCellDiff(runDir, cellKey(cell), rawDiff, sentinels)

    base.mechanical = await scoreMechanical(REPO_ROOT, sandbox.dir, cell.arm, scenario)

    if (review) {
      try {
        base.mechanical.reviewDefects = await reviewDiff({
          diff,
          taskPrompt: scenario.prompt,
          runner: defaultReviewRunner,
        })
      } catch (err) {
        // A review failure (e.g. reviewer auth) must not lose the cell's already
        // scored mechanical/judge metrics — leave reviewDefects unset.
        console.warn(`  review failed for ${cellKey(cell)}: ${errMessage(err)}`)
      }
    }

    const change = await resolveChange(sandbox.dir)
    // Snapshot artifacts BEFORE teardown — see `finally` below — so this and
    // any future scoring bug can be re-scored offline without re-running the
    // (expensive, non-deterministic) agent.
    await writeArtifactSnapshot(
      runDir,
      cellKey(cell),
      await snapshotChangeArtifacts(sandbox.dir),
      sentinels,
    )

    if (judge !== undefined) {
      const text =
        change === undefined ? '' : await collectArtifactText(sandbox.dir, change.dir, sentinels)
      const judged = await judgeArtifacts(judge, text)
      base.quality = judged.quality
      if (judged.error !== undefined) base.judgeError = judged.error
    } else {
      base.quality = null
    }

    return base
  } catch (err) {
    return { ...base, skipped: `cell error: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    if (sandboxDir !== undefined) {
      await teardown({ dir: sandboxDir, arm: cell.arm })
    }
  }
}

/** Run cells through a bounded worker pool, preserving completion order. */
async function runPool(
  cells: readonly Cell[],
  concurrency: number,
  runOne: (cell: Cell, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      const cell = cells[index]
      if (cell === undefined) return
      await runOne(cell, index)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, cells.length) }, () => worker())
  await Promise.all(workers)
}

/**
 * Standalone `--review-report <dir>` mode: review every cell of a PAST run from
 * its persisted, redacted diffs (`snapshots/<cellKey>.diff`) without re-running
 * any benchmark agent, attach the confirmed-defect counts to each cell's
 * mechanical metrics, and rewrite that run's `aggregate.json` + `summary.md` in
 * place. A cell with no persisted diff (skipped, or a run predating diff
 * capture) is left untouched. Always returns 0 — this is advisory, like the run
 * itself.
 */
async function reviewPastRun(runDir: string): Promise<number> {
  const aggregatePath = join(runDir, 'aggregate.json')
  if (!(await Bun.file(aggregatePath).exists())) {
    console.error(`bench — no aggregate.json under ${runDir}`)
    return 2
  }
  const report = (await Bun.file(aggregatePath).json()) as { meta: RunMeta; cells: CellResult[] }
  const sentinels = buildSentinels()

  let reviewed = 0
  for (const cell of report.cells) {
    if (cell.skipped !== undefined || cell.mechanical === undefined) continue
    const key = cellKey(cell.cell)
    const diff = await readCellDiff(runDir, key)
    if (diff === undefined) continue
    const scenario = scenarioById(cell.cell.scenarioId)
    if (scenario === undefined) continue
    try {
      cell.mechanical.reviewDefects = await reviewDiff({
        diff,
        taskPrompt: scenario.prompt,
        runner: defaultReviewRunner,
      })
      reviewed += 1
      console.log(
        `  reviewed ${key} — found ${cell.mechanical.reviewDefects.found}, confirmed ${cell.mechanical.reviewDefects.confirmed}`,
      )
    } catch (err) {
      console.warn(`  review failed for ${key}: ${errMessage(err)}`)
    }
  }

  await writeAggregate(runDir, report.meta, report.cells, sentinels)
  const markdownPath = await writeMarkdown(runDir, report.meta, report.cells)
  console.log(`bench — reviewed ${reviewed} cell(s); rewrote ${aggregatePath} and ${markdownPath}`)
  return 0
}

/**
 * Standalone `--publish-from <dir>` mode: re-render the committed publish
 * artifacts (`packages/bench/RESULTS.md`, the README managed block) from an
 * EXISTING report dir's `aggregate.json`, with no agent re-run — works with
 * the merged-report layout produced by hand-merging several runs' cells
 * together (e.g. `packages/bench/reports/2026-07-16-full-run-merged/`).
 */
/**
 * `--resume`'s inline-review backfill: for every already-complete cell that
 * has no `reviewDefects` yet (mechanical scored, but review was off or failed
 * on the original run), review its persisted diff in place — mirroring
 * `reviewPastRun`'s per-cell logic — without re-running its agent. A cell
 * that already carries `reviewDefects` (point 3 of the task: "must not
 * re-review already-reviewed cells") or has no persisted diff is left
 * untouched.
 */
async function backfillReview(runDir: string, existing: readonly CellResult[]): Promise<number> {
  let backfilled = 0
  for (const r of existing) {
    if (!needsReviewBackfill(r) || r.mechanical === undefined) continue
    const key = cellKey(r.cell)
    const diff = await readCellDiff(runDir, key)
    if (diff === undefined) continue
    const scenario = scenarioById(r.cell.scenarioId)
    if (scenario === undefined) continue
    try {
      r.mechanical.reviewDefects = await reviewDiff({
        diff,
        taskPrompt: scenario.prompt,
        runner: defaultReviewRunner,
      })
      backfilled += 1
      console.log(
        `  reviewed ${key} (resume backfill) — found ${r.mechanical.reviewDefects.found}, confirmed ${r.mechanical.reviewDefects.confirmed}`,
      )
    } catch (err) {
      console.warn(`  review failed for ${key}: ${errMessage(err)}`)
    }
  }
  return backfilled
}

async function publishPastRun(runDir: string): Promise<number> {
  try {
    const { resultsPath, readmePath } = await publishFromReportDir({ repoRoot: REPO_ROOT, runDir })
    console.log(`bench — published ${resultsPath} and ${readmePath} from ${runDir}`)
    return 0
  } catch (err) {
    console.error(`bench — ${errMessage(err)}`)
    return 2
  }
}

async function main(): Promise<number> {
  let filters: MatrixFilters
  try {
    filters = parseArgs(Bun.argv.slice(2))
  } catch (err) {
    // A malformed invocation is a usage error (exit 2), distinct from the
    // advisory run itself which always exits 0. Failing hard on an unknown flag
    // avoids silently running the full, expensive matrix on a typo.
    console.error(`bench — ${err instanceof Error ? err.message : String(err)}`)
    return 2
  }
  if (filters.publishFrom !== undefined) {
    return publishPastRun(filters.publishFrom)
  }
  if (filters.reviewReport !== undefined) {
    return reviewPastRun(filters.reviewReport)
  }

  const availableIds = ALL_SCENARIOS.map((s) => s.id)

  if (filters.scenarios !== undefined) {
    const unknown = filters.scenarios.filter((id) => !availableIds.includes(id))
    for (const id of unknown) {
      console.warn(`bench — skipping unknown scenario: ${id}`)
    }
  }

  const cells = expandMatrix(availableIds, filters)
  if (cells.length === 0) {
    console.log('bench — no cells to run (check --scenario/--arm/--model filters).')
    return 0
  }

  // `--resume`: reuse an existing report dir instead of minting a new one.
  // Its `cells.jsonl` is the live source of already-complete cells — an
  // interrupted run has no `aggregate.json` yet, since that is only written
  // once at the very end of a full run.
  let runDir: string
  let existingResults: CellResult[] = []
  if (filters.resume !== undefined) {
    runDir = filters.resume
    try {
      existingResults = await readCellsJsonl(runDir)
    } catch (err) {
      console.error(`bench — ${errMessage(err)}`)
      return 2
    }
    if (isStaleSchema(existingResults)) {
      console.error(
        `bench — ${runDir} predates the scenarioId field on CellResult and cannot be resumed; ` +
          're-run the matrix (or --review-report a current-schema run) to produce fresh results.',
      )
      return 2
    }
  } else {
    const startedAt = new Date().toISOString()
    runDir = join(REPO_ROOT, 'packages', 'bench', 'reports', startedAt.replace(/[:.]/g, '-'))
    await ensureRunDir(runDir)
  }

  const { toRun: cellsToRun, skipped: skippedCells } = partitionResumeCells(cells, existingResults)
  if (filters.resume !== undefined) {
    console.log(
      `bench — resuming ${runDir}: skipped ${skippedCells.length} already-complete cell(s); ` +
        `${cellsToRun.length} to run`,
    )
    if (filters.review) {
      const backfilled = await backfillReview(runDir, existingResults)
      if (backfilled > 0) {
        console.log(`bench — backfilled review on ${backfilled} already-complete cell(s)`)
      }
    }
  }

  const deepseekKey = process.env['DEEPSEEK_API_KEY']
  const judgeEnabled = deepseekKey !== undefined && deepseekKey.trim().length > 0
  const judge: JudgeConfig | undefined = judgeEnabled
    ? {
        apiKey: deepseekKey,
        baseUrl: process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com',
        model: process.env['DEEPSEEK_MODEL_ID'] ?? 'deepseek-v4-flash',
        samples: 3,
      }
    : undefined
  if (!judgeEnabled) {
    console.log('bench — DEEPSEEK_API_KEY not set; quality judging disabled (quality: null).')
  }

  const sentinels = buildSentinels()
  const startedAt = new Date().toISOString()

  console.log(
    `bench — ${cellsToRun.length} cell(s) to run, concurrency ${filters.concurrency}; report ${runDir}`,
  )

  const freshResults: CellResult[] = Array.from({ length: cellsToRun.length })
  await runPool(cellsToRun, filters.concurrency, async (cell, index) => {
    const result = await runCell(cell, judge, sentinels, runDir, filters.review)
    freshResults[index] = result
    await appendCellResult(runDir, result, sentinels)
    const status =
      result.skipped !== undefined
        ? `SKIP (${result.skipped})`
        : `done (${result.telemetry?.resultSubtype ?? 'no-result'})`
    console.log(`  [${index + 1}/${cellsToRun.length}] ${cellKey(cell)} — ${status}`)
  })

  // The FULL set — pre-existing (resumed) rows plus this invocation's fresh
  // ones — is what aggregate.json/summary.md (and --publish) are rendered
  // from, so a resumed run's report always reads as one complete matrix.
  const results = [...existingResults, ...freshResults]
  const ran = results.filter((r) => r.skipped === undefined)
  const claudeCodeVersion = ran
    .map((r) => r.telemetry?.claudeCodeVersion)
    .find((v) => v !== undefined)
  const meta: RunMeta = {
    version: 1,
    startedAt,
    claudeCodeVersion,
    judgeModel: judge?.model,
    judgeEnabled,
    totalCells: cells.length,
    ranCells: ran.length,
    skippedCells: cells.length - ran.length,
  }

  const aggregatePath = await writeAggregate(runDir, meta, results, sentinels)
  const markdownPath = await writeMarkdown(runDir, meta, results)
  console.log(`bench — aggregate ${aggregatePath}`)
  console.log(`bench — summary ${markdownPath}`)

  if (filters.publish) {
    const { resultsPath, readmePath } = await publishResults({
      repoRoot: REPO_ROOT,
      meta,
      results,
      sentinels,
    })
    console.log(`bench — published ${resultsPath} and ${readmePath}`)
  }

  return 0
}

process.exit(await main())
