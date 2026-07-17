// Results publishing: renders two COMMITTED (never gitignored) artifacts from
// a finished run's aggregate — `packages/bench/RESULTS.md` (the full
// human-friendly document) and a managed block in the root `README.md` (a
// compact top-line table + a link out to RESULTS.md). Both are point-in-time
// snapshots: they say what commit/branch/tree state produced them, not that
// the repo is continuously benchmarked.
//
// Rendering is intentionally NOT duplicated here: the per-scenario table,
// legend, "Repeat spread", and "Paired comparison" sections all come straight
// from `report.ts`'s `renderSummaryBody` (the same function `summary.md`
// uses) and `renderCompactArmModelMarkdown`/`aggregateByArmModel` (the
// coarser arm×model reduction, sharing `report.ts`'s `reduceGroup` so a
// "mean cost" can never quietly mean two different things in the two
// documents). This module only adds the provenance header and the
// README marker-block mechanics.

import { join } from 'node:path'

import type { Arm, BenchModel } from './matrix.ts'
import { MODEL_EFFORT } from './matrix.ts'
import { assertRedacted, type Sentinels } from './redact.ts'
import {
  aggregateByArmModel,
  renderCompactArmModelMarkdown,
  renderSummaryBody,
  type CellResult,
  type RunMeta,
} from './report.ts'
import { spawnIn } from './sandbox.ts'
import { buildSentinels } from './sentinels.ts'

export interface GitInfo {
  sha: string
  /** GitHub org/user derived from the `origin` remote URL at runtime — never hardcoded. */
  org: string
  repo: string
  /** Set only when HEAD is EXACTLY tagged (`git describe --tags --exact-match`). */
  tag?: string
  /** True when `git status --porcelain` reports any change (staged, unstaged, or untracked). */
  dirty: boolean
  branch: string
}

/**
 * Parse `org/repo` out of a GitHub remote URL, handling both the `https://` and
 * `git@github.com:` forms. Throws on a non-GitHub remote — provenance links
 * are GitHub-commit-URL shaped by design (see the module doc comment); a repo
 * hosted elsewhere would need a different provenance scheme, not a guess.
 */
export function parseGitHubRemote(url: string): { org: string; repo: string } {
  const cleaned = url.trim().replace(/\.git$/, '')
  const match = /github\.com[/:]([^/]+)\/([^/]+)$/.exec(cleaned)
  if (match === null) {
    throw new Error(`cannot derive org/repo from a non-GitHub remote url: ${url}`)
  }
  const [, org, repo] = match
  return { org: org ?? '', repo: repo ?? '' }
}

/** Collect the git provenance facts for `repoRoot` by spawning real `git` commands — never cached, never guessed. */
export async function collectGitInfo(repoRoot: string): Promise<GitInfo> {
  const sha = (await spawnIn(['git', 'rev-parse', 'HEAD'], repoRoot)).stdout.trim()
  const remoteUrl = (await spawnIn(['git', 'remote', 'get-url', 'origin'], repoRoot)).stdout.trim()
  const { org, repo } = parseGitHubRemote(remoteUrl)
  const tagResult = await spawnIn(['git', 'describe', '--tags', '--exact-match'], repoRoot)
  const tag = tagResult.exitCode === 0 ? tagResult.stdout.trim() : undefined
  const statusResult = await spawnIn(['git', 'status', '--porcelain'], repoRoot)
  const dirty = statusResult.stdout.trim().length > 0
  const branch = (await spawnIn(['git', 'branch', '--show-current'], repoRoot)).stdout.trim()
  return { sha, org, repo, tag, dirty, branch }
}

export function commitUrl(git: Pick<GitInfo, 'org' | 'repo' | 'sha'>): string {
  return `https://github.com/${git.org}/${git.repo}/commit/${git.sha}`
}

/** The highest `cell.repeat` seen across every (non-skipped) result — the `--repeats` value the run actually used. */
function maxRepeats(results: readonly CellResult[]): number {
  const repeats = results.map((r) => r.cell.repeat).filter((n) => Number.isFinite(n))
  return repeats.length === 0 ? 1 : Math.max(...repeats)
}

/** Distinct (model, effort) pairs actually present in the results, sorted by model id. */
function modelsUsed(results: readonly CellResult[]): { model: BenchModel; effort: string }[] {
  const models = new Set<BenchModel>()
  for (const r of results) models.add(r.cell.model)
  return [...models]
    .toSorted()
    .map((model) => ({ model, effort: MODEL_EFFORT[model] ?? 'unknown' }))
}

/** Distinct arms actually present in the results, sorted. */
function armsUsed(results: readonly CellResult[]): Arm[] {
  const arms = new Set<Arm>()
  for (const r of results) arms.add(r.cell.arm)
  return [...arms].toSorted()
}

export interface Provenance {
  git: GitInfo
  /** ISO timestamp of when the publish happened (NOT when the benchmark ran — see `renderProvenanceLines`). */
  generatedAt: string
  claudeCodeVersion?: string
  judgeEnabled: boolean
  judgeModel?: string
  totalCells: number
  ranCells: number
  skippedCells: number
  repeats: number
  arms: Arm[]
  modelEfforts: { model: BenchModel; effort: string }[]
}

export function buildProvenance(
  git: GitInfo,
  generatedAt: string,
  meta: RunMeta,
  results: readonly CellResult[],
): Provenance {
  return {
    git,
    generatedAt,
    claudeCodeVersion: meta.claudeCodeVersion,
    judgeEnabled: meta.judgeEnabled,
    judgeModel: meta.judgeModel,
    totalCells: meta.totalCells,
    ranCells: meta.ranCells,
    skippedCells: meta.skippedCells,
    repeats: maxRepeats(results),
    arms: armsUsed(results),
    modelEfforts: modelsUsed(results),
  }
}

/**
 * Render the shared provenance block used by both RESULTS.md and the README
 * block: commit (hyperlinked, tag noted if HEAD is exactly tagged), ISO date,
 * Claude Code version, model ids + efforts, cell/repeat counts, judge status —
 * and an explicit WARNING banner when the working tree was dirty or the
 * current branch isn't `main` at publish time. The banner does not block
 * publishing (the task requires "still publishes") — it is a disclosure, not a
 * gate: point-in-time honesty rather than a promise that every publish comes
 * from a clean release build.
 */
export function renderProvenanceLines(p: Provenance): string[] {
  const lines: string[] = []
  if (p.git.dirty || p.git.branch !== 'main') {
    const reasons = [
      p.git.dirty ? 'the working tree had uncommitted changes' : undefined,
      p.git.branch !== 'main'
        ? `the current branch was \`${p.git.branch}\` (not \`main\`)`
        : undefined,
    ].filter((r): r is string => r !== undefined)
    lines.push(
      `> **WARNING:** published while ${reasons.join(' and ')} — treat this as a` +
        ' point-in-time snapshot, not a release-verified result.',
      '',
    )
  }
  const commit = `[\`${p.git.sha.slice(0, 12)}\`](${commitUrl(p.git)})`
  lines.push(
    `- commit: ${commit}${p.git.tag !== undefined ? ` (tag \`${p.git.tag}\`)` : ''} on branch \`${p.git.branch}\``,
    `- published: ${p.generatedAt}`,
    `- claude code: ${p.claudeCodeVersion ?? 'unknown'}`,
    `- arms: ${p.arms.length === 0 ? 'none' : p.arms.join(', ')}`,
    `- models: ${p.modelEfforts.length === 0 ? 'none' : p.modelEfforts.map((m) => `${m.model}/${m.effort}`).join(', ')}`,
    `- cells: ${p.ranCells} ran, ${p.skippedCells} skipped, ${p.totalCells} total (repeats=${p.repeats})`,
    `- judge: ${p.judgeEnabled ? (p.judgeModel ?? 'enabled') : 'disabled (no DEEPSEEK_API_KEY)'}`,
  )
  return lines
}

/** Render `packages/bench/RESULTS.md`'s full content (provenance + the same table/legend/stats sections `summary.md` uses). */
export function renderResultsMarkdown(
  provenance: Provenance,
  results: readonly CellResult[],
): string {
  const lines: string[] = [
    '# cospec vs openspec — results',
    '',
    ...renderProvenanceLines(provenance),
    '',
    ...renderSummaryBody(results),
  ]
  return lines.join('\n')
}

/** Render the body placed BETWEEN the README's `bench:start`/`bench:end` markers (markers not included). */
export function renderReadmeBlock(provenance: Provenance, results: readonly CellResult[]): string {
  const lines: string[] = [
    '## Benchmark: cospec vs openspec',
    '',
    ...renderProvenanceLines(provenance),
    '',
    ...renderCompactArmModelMarkdown(aggregateByArmModel(results)),
    '',
    'Full per-scenario metrics, statistics, and the metric legend:',
    '[`packages/bench/RESULTS.md`](packages/bench/RESULTS.md).',
  ]
  return lines.join('\n')
}

const MARKER_START = '<!-- bench:start -->'
const MARKER_END = '<!-- bench:end -->'

/**
 * Idempotent replace of the `bench:start`/`bench:end` marker block in
 * `content` (mirrors `scripts/mise-tasks/agents/sync`'s CLAUDE.md shared-block
 * pattern: everything outside the markers is left untouched, and re-running
 * with the same `blockBody` is a no-op byte-for-byte). When the markers are
 * absent, the wrapped block is appended before the FIRST `## License` heading
 * (a sensible, stable insertion point per the task) — or at the end of the
 * file if there is no license section at all.
 */
export function replaceMarkerBlock(content: string, blockBody: string): string {
  const wrapped = `${MARKER_START}\n${blockBody}\n${MARKER_END}`
  const startIdx = content.indexOf(MARKER_START)
  const endIdx = content.indexOf(MARKER_END)
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx)
    const after = content.slice(endIdx + MARKER_END.length)
    return `${before}${wrapped}${after}`
  }

  const licenseMatch = /^#{1,6}\s+License\b.*$/m.exec(content)
  if (licenseMatch !== null) {
    const before = content.slice(0, licenseMatch.index).replace(/\n*$/, '\n\n')
    const after = content.slice(licenseMatch.index)
    return `${before}${wrapped}\n\n${after}`
  }

  const trimmed = content.replace(/\n*$/, '\n')
  return `${trimmed}\n${wrapped}\n`
}

export interface PublishInput {
  repoRoot: string
  meta: RunMeta
  results: readonly CellResult[]
  sentinels: Sentinels
  /** Injectable for tests — real publishing always omits this and collects live git info. */
  gitInfo?: GitInfo
  /** Injectable for tests — real publishing always omits this and uses the current time. */
  now?: () => Date
}

export interface PublishOutput {
  resultsPath: string
  readmePath: string
  provenance: Provenance
}

/**
 * Render and write both committed artifacts (`packages/bench/RESULTS.md`,
 * the README managed block), guarded by the redaction self-check the rest of
 * the harness uses — a publish must carry only counts, scores, and telemetry,
 * exactly like every other bench report artifact.
 */
export async function publishResults(input: PublishInput): Promise<PublishOutput> {
  const git = input.gitInfo ?? (await collectGitInfo(input.repoRoot))
  const generatedAt = (input.now?.() ?? new Date()).toISOString()
  const provenance = buildProvenance(git, generatedAt, input.meta, input.results)

  const resultsText = assertRedacted(
    renderResultsMarkdown(provenance, input.results),
    input.sentinels,
  )
  const resultsPath = join(input.repoRoot, 'packages', 'bench', 'RESULTS.md')
  await Bun.write(resultsPath, `${resultsText}\n`)

  const readmeBlock = assertRedacted(renderReadmeBlock(provenance, input.results), input.sentinels)
  const readmePath = join(input.repoRoot, 'README.md')
  const readmeFile = Bun.file(readmePath)
  const existing = (await readmeFile.exists()) ? await readmeFile.text() : ''
  const updated = replaceMarkerBlock(existing, readmeBlock)
  await Bun.write(readmePath, updated)

  return { resultsPath, readmePath, provenance }
}

export interface PublishFromReportDirInput {
  repoRoot: string
  runDir: string
  /** Injectable for tests. */
  gitInfo?: GitInfo
  now?: () => Date
}

/**
 * Standalone `--publish-from <dir>` entry point: read a PAST run's
 * `aggregate.json` back off disk (no agent re-run — works with the
 * merged-report layout, e.g. hand-merging several runs' `cells` together into
 * one dir) and publish from it. Throws with an actionable message rather than
 * publishing garbage when the dir has no `aggregate.json`, or predates the
 * `scenarioId` field on `CellResult` (pre-dates the `-hard` grouping fix in
 * `report.ts` — every cell would silently group under the literal string
 * "undefined" instead of its real scenario).
 */
export async function publishFromReportDir(
  input: PublishFromReportDirInput,
): Promise<PublishOutput> {
  const aggregatePath = join(input.runDir, 'aggregate.json')
  const file = Bun.file(aggregatePath)
  if (!(await file.exists())) {
    throw new Error(`no aggregate.json under ${input.runDir}`)
  }
  const report = (await file.json()) as { meta: RunMeta; cells: CellResult[] }
  const preScenarioId = report.cells.some(
    (c) => c.skipped === undefined && typeof c.scenarioId !== 'string',
  )
  if (preScenarioId) {
    throw new Error(
      `${input.runDir} predates the scenarioId field on CellResult and cannot be republished; ` +
        're-run the matrix (or --review-report a current-schema run) to publish fresh results.',
    )
  }
  return publishResults({
    repoRoot: input.repoRoot,
    meta: report.meta,
    results: report.cells,
    sentinels: buildSentinels(),
    gitInfo: input.gitInfo,
    now: input.now,
  })
}
