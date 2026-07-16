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

import { SCENARIOS, scenarioById } from '../scenarios/index.ts'
import { runAgent, type AgentTelemetry } from './agent.ts'
import { collectArtifactText, judgeArtifacts, type JudgeConfig } from './judge.ts'
import { cellKey, expandMatrix, parseArgs, type Cell, type MatrixFilters } from './matrix.ts'
import { resolveChange, scoreMechanical, snapshotChangeArtifacts } from './mechanical.ts'
import type { Sentinels } from './redact.ts'
import {
  appendCellResult,
  ensureRunDir,
  writeAggregate,
  writeArtifactSnapshot,
  writeMarkdown,
  type CellResult,
  type RunMeta,
} from './report.ts'
import { createArmSandbox, teardown } from './sandbox.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..', '..')
const SCENARIOS_DIR = join(HERE, '..', 'scenarios')

/** Fixture-unique refs embedded in scenario prompts, scrubbed from any report. */
function scenarioSentinels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of SCENARIOS) {
    for (const ref of s.prompt.match(/BENCH-[A-Z0-9-]+/g) ?? []) {
      out[`ref:${s.id}:${ref}`] = ref
    }
  }
  return out
}

/** Run one cell end-to-end: sandbox → agent → mechanical → judge → teardown. */
async function runCell(
  cell: Cell,
  judge: JudgeConfig | undefined,
  sentinels: Sentinels,
  runDir: string,
): Promise<CellResult> {
  const scenario = scenarioById(cell.scenarioId)
  if (scenario === undefined) {
    return { cell, scenarioType: 'unknown', skipped: `no such scenario: ${cell.scenarioId}` }
  }
  const base: CellResult = { cell, scenarioType: scenario.type }
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

    base.mechanical = await scoreMechanical(REPO_ROOT, sandbox.dir, cell.arm, scenario)

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
  const availableIds = SCENARIOS.map((s) => s.id)

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

  const sentinels: Sentinels = {
    ...scenarioSentinels(),
    ...(deepseekKey !== undefined ? { deepseekKey } : {}),
    ...(process.env['ANTHROPIC_API_KEY'] !== undefined
      ? { anthropicKey: process.env['ANTHROPIC_API_KEY'] }
      : {}),
  }

  const startedAt = new Date().toISOString()
  const runDir = join(REPO_ROOT, 'packages', 'bench', 'reports', startedAt.replace(/[:.]/g, '-'))
  await ensureRunDir(runDir)

  console.log(
    `bench — ${cells.length} cell(s), concurrency ${filters.concurrency}; report ${runDir}`,
  )

  const results: CellResult[] = Array.from({ length: cells.length })
  await runPool(cells, filters.concurrency, async (cell, index) => {
    const result = await runCell(cell, judge, sentinels, runDir)
    results[index] = result
    await appendCellResult(runDir, result, sentinels)
    const status =
      result.skipped !== undefined
        ? `SKIP (${result.skipped})`
        : `done (${result.telemetry?.resultSubtype ?? 'no-result'})`
    console.log(`  [${index + 1}/${cells.length}] ${cellKey(cell)} — ${status}`)
  })

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
  return 0
}

process.exit(await main())
