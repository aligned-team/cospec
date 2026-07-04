// e2e eval entry point — `mise run eval:e2e` (DESIGN §8.4).
//
// Drives a small model (DeepSeek v4 Flash, native API) through the shipped skill
// bodies across three scenarios and scores structural outcomes with a fixed
// rubric. Advisory only: it is never in `mise run check` or required CI, and it
// ALWAYS exits 0 — a sub-threshold score prints a warning, it does not fail.
//
// Without a key it skips and exits 0 (research/eval-e2e.md §3.1 graceful-skip
// pattern). The key is read from the process environment (mise injects it from
// `.env.local` via `_.file`, redacted); this file never reads `.env.local`
// itself and never prints the key or any raw prompt/completion.

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createSandbox,
  formatTranscript,
  readFileOr,
  runCospec,
  teardown,
  type EvalContext,
  type Scenario,
} from './context.ts'
import { assertRedacted, type Sentinels } from './redact.ts'
import { ciScenario } from './scenarios/ci.ts'
import { featScenario } from './scenarios/feat.ts'
import { gateScenario } from './scenarios/gate.ts'
import {
  MAX_SCORE,
  PASS_THRESHOLD,
  scoreRubric,
  summarize,
  totalScore,
  type ScenarioResult,
} from './score.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')

const SCENARIOS: readonly Scenario[] = [featScenario, ciScenario, gateScenario]

// Fixture-unique markers embedded in each scenario prompt; if any survives into
// the report object the run fails rather than leaking raw content (§8.4).
const FIXTURE_SENTINELS: Sentinels = {
  featRef: 'EVAL-FEAT-7Q2',
  ciRef: 'EVAL-CI-4K9',
  gateRef: 'EVAL-GATE-2M5',
}

/**
 * System prompt = the actual rendered Claude skill bodies. Rendering them into a
 * throwaway repo means the eval tests the instructions cospec really ships.
 */
async function renderSkillBodies(): Promise<string> {
  const sandbox = await createSandbox(REPO_ROOT)
  try {
    const init = await runCospec(sandbox, REPO_ROOT, ['init', '.', '--harness', 'claude', '--yes'])
    if (init.exitCode !== 0) {
      throw new Error(
        `could not render skill bodies (cospec init --harness claude exit ${init.exitCode})`,
      )
    }
    const skills = [
      'cospec-propose',
      'cospec-apply-change',
      'cospec-archive-change',
      'cospec-continue-change',
    ]
    const parts: string[] = []
    for (const skill of skills) {
      const body = await readFileOr(sandbox, `.claude/skills/${skill}/SKILL.md`)
      if (body !== undefined) {
        parts.push(body)
      }
    }
    if (parts.length === 0) {
      throw new Error('no skill bodies were rendered')
    }
    return [
      'You are operating in a sandboxed repository via two tools: run_command',
      '(programs cospec, cat, ls) and write_file. Follow the cospec skill',
      'instructions below exactly. Obey every command exit code. Do not invent',
      'commands or bypass gates.',
      '',
      parts.join('\n\n---\n\n'),
    ].join('\n')
  } finally {
    await teardown(sandbox)
  }
}

async function writeReport(runDir: string, report: unknown): Promise<string> {
  await mkdir(runDir, { recursive: true })
  const path = join(runDir, 'report.json')
  await Bun.write(path, `${JSON.stringify(report, null, 2)}\n`)
  return path
}

async function main(): Promise<number> {
  const apiKey = process.env['DEEPSEEK_API_KEY']
  if (apiKey === undefined || apiKey.trim().length === 0) {
    console.log('eval:e2e — DEEPSEEK_API_KEY not set; skipping.')
    return 0
  }

  const model = process.env['DEEPSEEK_MODEL_ID'] ?? 'deepseek-v4-flash'
  const baseUrl = process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com'
  const sentinels: Sentinels = { ...FIXTURE_SENTINELS, apiKey }

  console.log(`eval:e2e — model ${model}; running ${SCENARIOS.length} scenarios…`)
  const started = Date.now()
  const systemPrompt = await renderSkillBodies()
  const ctx: EvalContext = { repoRoot: REPO_ROOT, apiKey, model, baseUrl, systemPrompt, sentinels }

  // One timestamped directory per run holds report.json plus a redacted
  // transcript per scenario. reports/ is gitignored, so this never commits.
  const runDir = join(
    REPO_ROOT,
    'e2e',
    'eval',
    'reports',
    new Date().toISOString().replace(/[:.]/g, '-'),
  )
  const transcriptDir = join(runDir, 'transcripts')
  await mkdir(transcriptDir, { recursive: true })

  const results: ScenarioResult[] = []
  for (const scenario of SCENARIOS) {
    const { turns, passed, transcript } = await scenario.execute(ctx)
    const md = formatTranscript(scenario.id, scenario.title, transcript, sentinels)
    await Bun.write(join(transcriptDir, `${scenario.id}.md`), md)
    const items = scoreRubric(scenario.rubric, passed)
    const result = summarize(scenario.id, scenario.title, turns, items)
    results.push(result)
    console.log(`  ${scenario.id}: ${result.earned}/${result.max} (${turns} turns)`)
  }

  const total = totalScore(results)
  const report = assertRedacted(
    {
      version: 1,
      model,
      durationMs: Date.now() - started,
      scenarios: results,
      total: total.earned,
      max: total.max,
      threshold: PASS_THRESHOLD,
      passed: total.earned >= PASS_THRESHOLD,
    },
    sentinels,
  )
  const reportPath = await writeReport(runDir, report)

  console.log(`eval:e2e — score ${total.earned}/${MAX_SCORE}; report ${reportPath}`)
  console.log(`eval:e2e — transcripts ${transcriptDir}`)
  if (total.earned < PASS_THRESHOLD) {
    console.warn(
      `eval:e2e — WARNING: score ${total.earned} is below the advisory threshold of ${PASS_THRESHOLD}. ` +
        'The instructions may be hard for a small model to follow; feed failures back into canon prose.',
    )
  }
  return 0
}

process.exit(await main())
