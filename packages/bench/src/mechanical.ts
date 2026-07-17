// Mechanical (authoritative) metrics scored post-hoc against a sandbox tree.
//
// These are the apples-to-apples signals the benchmark trusts, independent of
// any LLM judge:
//   (a) arm-native validation pass/fail — the tool's OWN validator on its OWN
//       output (cospec validate for the cospec arm, openspec validate for the
//       openspec arm) — this is each tool's own bar, not cospec's;
//   (b) SCHEMA CONFORMANCE — a post-hoc `cospec validate --json --strict` pass
//       over BOTH arms' trees (rule-id hit counts), plus artifact
//       proportionality (forbidden/missing artifacts) vs the scenario type's
//       DECLARED/REQUIRED sets. This is explicitly cospec's OWN opinionated
//       rubric applied after the fact to both arms — including the openspec
//       arm, which was never trying to satisfy it. It is NOT a defect count:
//       a low conformance score for the openspec arm says "this tree does not
//       match cospec's schema," not "this tree is broken." Report it only
//       alongside (a), never as a substitute for it;
//   (c) artifact presence/proportionality vs the scenario type's DECLARED set,
//       read from apps/cli's canon type-facts (never hardcoded here) — part of
//       (b)'s schema-conformance rubric;
//   (d) apply-gate observance / archive integrity where the workflow reached
//       them (filesystem-observable);
//   (e) fixture task completion (the scenario's own predicate);
//   (f) ESCAPED DEFECTS — a per-scenario held-out `bun:test` suite the agent
//       never sees (`packages/bench/scenarios/hidden/<id>/`, outside every
//       fixtureDir so `sandbox.ts`'s `createArmSandbox` never seeds it), run
//       against the finished sandbox tree after the agent stops. This is the
//       benchmark's PRIMARY defect metric: unlike (b)'s schema conformance
//       (cospec's own rubric, applied post-hoc to both arms), a hidden-test
//       failure means the produced code itself does not do what the prompt
//       asked, mechanically and identically for both arms — see
//       `docs/bench.md`'s "Escaped defects" section;
//   (g) PLANTED BUGS — an optional latent defect seeded ADJACENT to (never
//       inside) a scenario's task subject (`packages/bench/scenarios/planted/
//       <id>/`, same never-seeded discipline as (f)), scored via its own
//       held-out detector into `MechanicalMetrics.plantedBugCaught`. Measures
//       whether a workflow's verification discipline surfaces a nearby defect
//       the agent was never asked to fix — deliberately NOT folded into (f)'s
//       tally, since the plant is not the task the prompt asked about; see
//       `docs/bench.md`'s "Planted bugs" section.

import { cp, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ARTIFACT_FILES,
  type ArtifactId,
  type CospecType,
  TYPE_ARTIFACTS,
} from '../../../apps/cli/src/core/rules/type-facts.ts'
import type { Scenario } from '../scenarios/types.ts'
import type { Arm } from './matrix.ts'
import { openspecBin, readSandboxFile, sandboxExists, spawnIn } from './sandbox.ts'

export interface ResolvedChange {
  slug: string
  dir: string
  archived: boolean
}

/** Rule-id hit counts from a `cospec validate --json` pass. Not a "defect" tally — see MechanicalMetrics.schemaConformance. */
export interface ConformanceCounts {
  errors: number
  warnings: number
  byRule: Record<string, number>
}

/** Pass/fail summary from one `bun test` run of a scenario's held-out hidden suite. */
export interface HiddenTestResult {
  /** pass + fail (bun's own counts — see `parseBunTestSummary`). */
  total: number
  failed: number
}

/**
 * Adversarial-review outcome for one cell (see `src/review.ts`): how many unique
 * correctness findings the arm-blind reviewer runs raised against the cell's
 * persisted code diff (`found`), and how many survived the per-finding
 * refutation pass (`confirmed`). `confirmed` is the counted defect signal — it
 * measures bugs that slipped through the workflow into the produced code,
 * scored identically and arm-blind for both arms. Populated only when review
 * ran (`--review` inline, or the `--review-report` standalone pass); absent
 * otherwise, since review is off by default (it spawns extra agents).
 */
export interface ReviewDefects {
  found: number
  confirmed: number
}

/**
 * Count of confirmed adversarial-review defects for a cell — the raw number
 * behind the review-defect metric (see `MechanicalMetrics.reviewDefects`). null
 * when review did not run for this cell (never fabricated as 0, which would read
 * as "reviewed and clean").
 */
export function confirmedReviewDefectCount(m: MechanicalMetrics | undefined): number | null {
  return m?.reviewDefects == null ? null : m.reviewDefects.confirmed
}

export interface MechanicalMetrics {
  /** true/false/null — null when no change was produced to validate. */
  changeProduced: boolean
  changeArchived: boolean
  /** cospec arm: schema stamp from .openspec.yaml; openspec arm: undefined (no typed schema). */
  stampedSchema?: string
  /**
   * ARM-NATIVE validation: the tool validating its OWN output against its OWN
   * rules (cospec validate for the cospec arm, openspec validate for the
   * openspec arm). This is each tool's own bar — distinct from, and not to be
   * conflated with, `schemaConformance` below. null when no change.
   */
  armNativeValidatePass: boolean | null
  /**
   * SCHEMA CONFORMANCE (cospec's own rubric, applied post-hoc): a
   * `cospec validate --json --strict` pass over THIS arm's tree, yielding
   * rule-id hit counts. cospec's own arm is trying to satisfy this rubric by
   * construction; the openspec arm was never trying to and has no typed
   * schema, so a nonzero count there is expected, not a "defect" the openspec
   * arm failed to avoid. null when unparseable/no change.
   */
  schemaConformance: ConformanceCounts | null
  /** Files present under the change dir (excludes .openspec.yaml), for proportionality. */
  artifactFiles: string[]
  /**
   * Files present that the scenario type does NOT declare, per cospec's own
   * declared-artifact set (over-production against cospec's rubric — part of
   * schema conformance, not a defect measure).
   */
  forbiddenArtifacts: string[]
  /**
   * Declared files the change is missing, per cospec's own apply-required set
   * (under-production against cospec's rubric — part of schema conformance,
   * not a defect measure).
   */
  missingRequiredArtifacts: string[]
  /** All tasks checked off (tasks.md has [x] and no [ ]). null when tasks.md absent. */
  tasksAllChecked: boolean | null
  /** The fixture's requested code change actually landed. */
  taskCompleted: boolean
  /**
   * The scenario's held-out hidden-test result (see `scoreHiddenTests`) — the
   * PRIMARY defect metric, mechanical and identical for both arms. null when
   * the scenario has no `scenarios/hidden/<id>/` suite yet, or its `bun test`
   * summary line could not be parsed (never fabricated as `{total: 0, failed: 0}`).
   */
  hiddenTests: HiddenTestResult | null
  /**
   * Confirmed adversarial-review defects (see `src/review.ts`). Optional and
   * absent by default — set only when review ran (`--review` inline, or the
   * `--review-report` standalone pass), never scored inside `scoreMechanical`
   * (which has no diff or reviewer runner). `undefined`/`null` both mean "not
   * reviewed"; a populated `{found, confirmed}` carries the counts.
   */
  reviewDefects?: ReviewDefects | null
  /**
   * Whether this scenario's optional planted latent bug (see
   * `Scenario.plantedBug`, `scorePlantedBug`) was noticed and fixed by the
   * agent's workflow — a defect ADJACENT to the task subject, never mentioned
   * by the prompt. null for scenarios with no plant (`Scenario.plantedBug`
   * undefined), or when the detector's `bun test` summary could not be
   * parsed — never fabricated as `false`, which would misreport "present and
   * unfixed" for a scenario that was never seeded with one. Deliberately
   * separate from `hiddenTests`/`escapedDefectRate`: an unfixed plant is not
   * an escaped defect (it is not what the task prompt asked about) and must
   * not double-count against that tally.
   */
  plantedBugCaught: boolean | null
}

/**
 * Sum of errors+warnings from `MechanicalMetrics.schemaConformance` — the raw
 * count behind the schema-conformance metric (cospec's own rubric, applied
 * post-hoc to both arms). Not a defect count — see `schemaConformance`'s doc
 * comment above. null when the metric itself is null (no change / unparseable).
 */
export function conformanceIssueCount(m: MechanicalMetrics | undefined): number | null {
  if (m?.schemaConformance == null) return null
  return m.schemaConformance.errors + m.schemaConformance.warnings
}

/**
 * Fraction of the scenario's held-out hidden tests that FAILED — the primary,
 * tool-neutral defect measure (see `MechanicalMetrics.hiddenTests`). null when
 * hidden tests weren't scored (no suite yet, or an unparseable `bun test` run)
 * or the suite reported zero total tests (nothing to divide by).
 */
export function escapedDefectRate(m: MechanicalMetrics | undefined): number | null {
  if (m?.hiddenTests == null || m.hiddenTests.total === 0) return null
  return m.hiddenTests.failed / m.hiddenTests.total
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/** The single active change slug, or undefined if none / ambiguous. */
async function activeChange(sandbox: string): Promise<string | undefined> {
  const changesDir = join(sandbox, 'openspec/changes')
  if (!(await exists(changesDir))) return undefined
  const entries = await readdir(changesDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory() && e.name !== 'archive').map((e) => e.name)
  return dirs.length === 1 ? dirs[0] : undefined
}

async function archiveDirs(sandbox: string): Promise<string[]> {
  const dir = join(sandbox, 'openspec/changes/archive')
  if (!(await exists(dir))) return []
  const entries = await readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/**
 * The scenario's change, active or already archived. Both arms lay changes under
 * openspec/changes/<slug>; archive moves them to openspec/changes/archive/
 * <date>-<slug>, so scoring must follow either. The sandbox starts empty, so any
 * change present is the agent's.
 */
export async function resolveChange(sandbox: string): Promise<ResolvedChange | undefined> {
  const active = await activeChange(sandbox)
  if (active !== undefined) {
    return { slug: active, dir: `openspec/changes/${active}`, archived: false }
  }
  const matches = (await archiveDirs(sandbox))
    .map((name) => ({ name, m: /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(name) }))
    .filter((x): x is { name: string; m: RegExpExecArray } => x.m !== null)
  const last = matches[matches.length - 1]
  const slug = last?.m[1]
  if (last === undefined || slug === undefined) return undefined
  return { slug, dir: `openspec/changes/archive/${last.name}`, archived: true }
}

/** Relative artifact paths under a change dir (excludes .openspec.yaml). */
export async function changeFiles(sandbox: string, changeDir: string): Promise<string[]> {
  const base = join(sandbox, changeDir)
  if (!(await exists(base))) return []
  const out: string[] = []
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.name === '.openspec.yaml') continue
      const rel = prefix === '' ? e.name : `${prefix}/${e.name}`
      if (e.isDirectory()) await walk(join(dir, e.name), rel)
      else out.push(rel)
    }
  }
  await walk(base, '')
  return out.toSorted()
}

/**
 * Non-`specs` file names a type DECLARES, from canon type-facts (never
 * hardcoded). `specs` is matched by directory prefix (`specs/`) instead of a
 * fixed file name, so it is excluded here.
 */
export function declaredArtifactFiles(type: CospecType): ReadonlySet<string> {
  const declared = TYPE_ARTIFACTS[type].declared.filter(
    (id): id is Exclude<ArtifactId, 'specs'> => id !== 'specs',
  )
  return new Set(declared.map((id) => ARTIFACT_FILES[id]))
}

/**
 * Non-`specs` file names a type REQUIRES (its `apply.requires` floor) — the set
 * whose absence is under-production. Distinct from the DECLARED set: an artifact
 * a type declares but does not require (e.g. `verification.md` for `ci`) is
 * optional, so omitting it is not "missing".
 */
export function requiredArtifactFiles(type: CospecType): ReadonlySet<string> {
  const required = TYPE_ARTIFACTS[type].applyRequires.filter(
    (id): id is Exclude<ArtifactId, 'specs'> => id !== 'specs',
  )
  return new Set(required.map((id) => ARTIFACT_FILES[id]))
}

function typeDeclaresSpecs(type: CospecType): boolean {
  return TYPE_ARTIFACTS[type].declared.includes('specs')
}

function typeRequiresSpecs(type: CospecType): boolean {
  return TYPE_ARTIFACTS[type].applyRequires.includes('specs')
}

interface CospecValidateJson {
  items?: { issues?: { level?: string; rule?: string }[] }[]
  summary?: { errors?: number; warnings?: number; byRule?: Record<string, number> }
}

/**
 * Parse a `cospec validate --json` stdout body (the frozen
 * `{items, summary:{errors,warnings,byRule}}` shape from
 * `apps/cli/src/core/report.ts`'s `toJson`) into rule-id counts — the raw data
 * behind the `schemaConformance` metric. Tolerant: a non-JSON body (e.g. an
 * openspec-arm tree with no cospec schema stamp) or a body missing
 * `summary.byRule` resolves to null/derived-from-items rather than throwing.
 * Falls back to counting `items[].issues[].rule` when `byRule` is
 * absent/empty, so an older or hand-built report shape still yields counts.
 * Exported (pure, no I/O) so rule-id parsing is unit-testable against fixture
 * JSON without spawning the real CLI.
 */
export function parseSchemaConformanceJson(stdout: string): ConformanceCounts | null {
  try {
    const parsed = JSON.parse(stdout) as CospecValidateJson
    const byRule: Record<string, number> = { ...parsed.summary?.byRule }
    if (Object.keys(byRule).length === 0 && Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        for (const issue of item.issues ?? []) {
          if (issue.rule !== undefined) byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1
        }
      }
    }
    return {
      errors: parsed.summary?.errors ?? 0,
      warnings: parsed.summary?.warnings ?? 0,
      byRule,
    }
  } catch {
    return null
  }
}

/**
 * Run the WORKING-TREE cospec validate --json --strict for one slug and parse
 * rule-id counts via `parseSchemaConformanceJson`.
 */
async function schemaConformanceCounts(
  repoRoot: string,
  sandbox: string,
  slug: string,
): Promise<ConformanceCounts | null> {
  const res = await spawnIn(
    [
      'bun',
      'run',
      join(repoRoot, 'apps/cli/src/index.ts'),
      '--',
      'validate',
      slug,
      '--strict',
      '--json',
    ],
    sandbox,
  )
  return parseSchemaConformanceJson(res.stdout)
}

/**
 * Post-hoc `cospec validate` for an ARCHIVED change. `cospec validate <slug>`
 * only resolves ACTIVE changes by exact id (`resolveChange` in
 * `apps/cli/src/core/change.ts` joins the id onto `openspec/changes/`, never
 * `openspec/changes/archive/`), so pointing it at an archived slug in the real
 * sandbox fails with "unknown item" (stderr, exit 1, empty stdout) — that is
 * the `schemaConformance: null` bug for archived cells (this field was named
 * `cospecValidate` at the time the bug was found and fixed; see task 6.6 in
 * this change's `tasks.md` — renamed to `schemaConformance` by task #6).
 *
 * Fix: copy the archived change dir into a disposable scratch repo,
 * `cospec init`'d fresh, at `openspec/changes/<slug>/` (the ACTIVE slot), then
 * validate there. A fresh scratch repo — rather than re-using the sandbox's
 * own `openspec/changes/<slug>` active slot — avoids a spurious
 * already-archived/duplicate-slug conflict, since the sandbox's own
 * `openspec/changes/archive/<date>-<slug>` entry still exists alongside it.
 */
export async function schemaConformanceArchivedCounts(
  repoRoot: string,
  sandbox: string,
  change: ResolvedChange,
): Promise<ConformanceCounts | null> {
  const scratch = await mkdtemp(join(tmpdir(), 'cospec-bench-archived-validate-'))
  try {
    const init = await spawnIn(
      ['bun', 'run', join(repoRoot, 'apps/cli/src/index.ts'), '--', 'init', '.', '--yes'],
      scratch,
    )
    if (init.exitCode !== 0) return null

    const dest = join(scratch, 'openspec/changes', change.slug)
    await cp(join(sandbox, change.dir), dest, { recursive: true })

    const res = await spawnIn(
      [
        'bun',
        'run',
        join(repoRoot, 'apps/cli/src/index.ts'),
        '--',
        'validate',
        change.slug,
        '--strict',
        '--json',
      ],
      scratch,
    )
    return parseSchemaConformanceJson(res.stdout)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/** Arm-native validation: cospec arm uses the working-tree CLI, openspec arm the pinned binary. */
async function armNativeValidate(
  repoRoot: string,
  sandbox: string,
  arm: Arm,
  slug: string,
): Promise<boolean> {
  const argv =
    arm === 'cospec'
      ? ['bun', 'run', join(repoRoot, 'apps/cli/src/index.ts'), '--', 'validate', slug, '--strict']
      : ['bun', 'run', openspecBin(repoRoot), '--', 'validate', slug, '--strict']
  const res = await spawnIn(argv, sandbox)
  return res.exitCode === 0
}

async function changeSchema(sandbox: string, changeDir: string): Promise<string | undefined> {
  const text = await readSandboxFile(sandbox, `${changeDir}/.openspec.yaml`)
  return text === undefined ? undefined : /^schema:\s*(\S+)/m.exec(text)?.[1]
}

/**
 * Parse bun's own `bun test` summary line (` N pass` / ` N fail`, on stderr in
 * practice, but callers pass in the combined stdout+stderr so this doesn't
 * care which stream it landed on) into a `HiddenTestResult`. Tolerant: returns
 * null rather than a fabricated `{total: 0, failed: 0}` when either count is
 * missing (e.g. bun crashed before printing a summary at all). A file that
 * fails to import at all (missing export, missing module) still prints a
 * parseable summary — bun counts it as a failed test, not a silent zero; see
 * this repo's `test/unit/hidden.test.ts` for a reproduction.
 */
export function parseBunTestSummary(text: string): HiddenTestResult | null {
  const passMatch = /(\d+)\s+pass\b/.exec(text)
  const failMatch = /(\d+)\s+fail\b/.exec(text)
  if (passMatch?.[1] === undefined || failMatch?.[1] === undefined) return null
  const passed = Number.parseInt(passMatch[1], 10)
  const failed = Number.parseInt(failMatch[1], 10)
  return { total: passed + failed, failed }
}

const HIDDEN_TESTS_DIRNAME = 'hidden-tests'

/**
 * Copy the scenario's held-out hidden-test suite
 * (`packages/bench/scenarios/hidden/<scenarioId>/` — never seeded into the
 * agent's sandbox, see `sandbox.ts`'s `createArmSandbox`) into the FINISHED
 * sandbox at `<sandbox>/hidden-tests/`, then run `bun test .` there against
 * whatever tree the agent produced. Scored identically for both arms — this
 * is the benchmark's mechanical, tool-neutral escaped-defect signal. Returns
 * null when the scenario has no hidden suite yet, or the `bun test` summary
 * could not be parsed. Removes `<sandbox>/hidden-tests/` again before
 * returning (success or failure) — `scoreMechanical` runs this BEFORE
 * `taskCompleted`, and every scenario's own `completed` predicate spawns a
 * bare, unscoped `bun test` at the sandbox root; a leftover `hidden-tests/`
 * directory would otherwise be picked up by that later scan and corrupt the
 * completion signal with foreign test cases (caught via a live smoke run —
 * see this change's tasks.md).
 */
export async function scoreHiddenTests(
  repoRoot: string,
  sandbox: string,
  scenarioId: string,
): Promise<HiddenTestResult | null> {
  const hiddenDir = join(repoRoot, 'packages/bench/scenarios/hidden', scenarioId)
  if (!(await exists(hiddenDir))) return null

  const dest = join(sandbox, HIDDEN_TESTS_DIRNAME)
  await cp(hiddenDir, dest, { recursive: true })

  try {
    const res = await spawnIn(['bun', 'test', '.'], dest)
    return parseBunTestSummary(`${res.stdout}\n${res.stderr}`)
  } finally {
    await rm(dest, { recursive: true, force: true })
  }
}

const PLANTED_CHECK_DIRNAME = 'planted-check'

/**
 * Copy the scenario's optional planted-bug detector
 * (`packages/bench/scenarios/planted/<scenarioId>/` — never seeded into the
 * agent's sandbox, same discipline as `scenarios/hidden/`) into the FINISHED
 * sandbox at `<sandbox>/planted-check/`, then run `bun test .` there against
 * whatever tree the agent produced. Deliberately a SEPARATE `bun test`
 * invocation from `scoreHiddenTests`, so a plant is never folded into the
 * escaped-defect tally (see `MechanicalMetrics.plantedBugCaught`). Returns
 * null when the scenario declares no plant (`Scenario.plantedBug` undefined),
 * or the `bun test` summary could not be parsed; otherwise `true` iff the
 * detector reported zero failures (the plant was noticed and fixed). Removes
 * `<sandbox>/planted-check/` again before returning — same leftover-directory
 * hazard as `scoreHiddenTests` (a bare `bun test` from a scenario's own
 * `completed` predicate would otherwise pick up the detector's cases too).
 */
export async function scorePlantedBug(
  repoRoot: string,
  sandbox: string,
  scenario: Scenario,
): Promise<boolean | null> {
  if (scenario.plantedBug === undefined) return null

  const plantedDir = join(repoRoot, 'packages/bench/scenarios/planted', scenario.id)
  if (!(await exists(plantedDir))) return null

  const dest = join(sandbox, PLANTED_CHECK_DIRNAME)
  await cp(plantedDir, dest, { recursive: true })

  try {
    const res = await spawnIn(['bun', 'test', '.'], dest)
    const parsed = parseBunTestSummary(`${res.stdout}\n${res.stderr}`)
    return parsed === null ? null : parsed.failed === 0 && parsed.total > 0
  } finally {
    await rm(dest, { recursive: true, force: true })
  }
}

/** Score every mechanical metric for one finished cell. */
export async function scoreMechanical(
  repoRoot: string,
  sandbox: string,
  arm: Arm,
  scenario: Scenario,
): Promise<MechanicalMetrics> {
  const change = await resolveChange(sandbox)
  const hiddenTests = await scoreHiddenTests(repoRoot, sandbox, scenario.id)
  const plantedBugCaught = await scorePlantedBug(repoRoot, sandbox, scenario)

  if (change === undefined) {
    return {
      changeProduced: false,
      changeArchived: false,
      armNativeValidatePass: null,
      schemaConformance: null,
      artifactFiles: [],
      forbiddenArtifacts: [],
      missingRequiredArtifacts: [
        ...requiredArtifactFiles(scenario.type),
        ...(typeRequiresSpecs(scenario.type) ? ['specs/'] : []),
      ],
      tasksAllChecked: null,
      taskCompleted: await runCompletion(sandbox, scenario),
      hiddenTests,
      plantedBugCaught,
    }
  }

  const files = await changeFiles(sandbox, change.dir)
  const declared = declaredArtifactFiles(scenario.type)
  const required = requiredArtifactFiles(scenario.type)
  const topLevel = files.filter((f) => !f.includes('/'))
  const hasSpecs = files.some((f) => f.startsWith('specs/'))

  // Over-production: present files the type does not DECLARE.
  const forbidden = topLevel.filter((f) => f.endsWith('.md') && !declared.has(f))
  if (hasSpecs && !typeDeclaresSpecs(scenario.type)) forbidden.push('specs/')

  // Under-production: REQUIRED files (the apply floor) the change omits.
  const missing = [...required].filter((f) => !files.includes(f))
  if (typeRequiresSpecs(scenario.type) && !hasSpecs) missing.push('specs/')

  const tasks = await readSandboxFile(sandbox, `${change.dir}/tasks.md`)
  const tasksAllChecked =
    tasks === undefined ? null : /- \[x\] /i.test(tasks) && !/- \[ \] /.test(tasks)

  return {
    changeProduced: true,
    changeArchived: change.archived,
    stampedSchema: await changeSchema(sandbox, change.dir),
    armNativeValidatePass: change.archived
      ? true
      : await armNativeValidate(repoRoot, sandbox, arm, change.slug),
    schemaConformance: change.archived
      ? await schemaConformanceArchivedCounts(repoRoot, sandbox, change)
      : await schemaConformanceCounts(repoRoot, sandbox, change.slug),
    artifactFiles: files,
    forbiddenArtifacts: forbidden,
    missingRequiredArtifacts: missing,
    tasksAllChecked,
    taskCompleted: await runCompletion(sandbox, scenario),
    hiddenTests,
    plantedBugCaught,
  }
}

export interface ArtifactSnapshot {
  slug: string
  /** Sandbox-relative dir the change was resolved at (active or archived). */
  dir: string
  archived: boolean
  /** relative path (within `dir`) -> raw file text, UNREDACTED. Caller redacts before persisting. */
  files: Record<string, string>
}

/**
 * Snapshot a resolved change's artifact files verbatim, before the sandbox is
 * torn down — so a scoring bug (like the archived-schemaConformance bug this
 * fixes) can be re-scored later without re-running the agent. Returns
 * undefined when no change was ever produced. Callers MUST redact
 * (`redactText`/`assertRedacted`) before writing this to a report dir — the
 * text here is raw, unredacted file content.
 */
export async function snapshotChangeArtifacts(
  sandbox: string,
): Promise<ArtifactSnapshot | undefined> {
  const change = await resolveChange(sandbox)
  if (change === undefined) return undefined
  const relPaths = await changeFiles(sandbox, change.dir)
  const files: Record<string, string> = {}
  for (const rel of relPaths) {
    const text = await readSandboxFile(sandbox, `${change.dir}/${rel}`)
    if (text !== undefined) files[rel] = text
  }
  return { slug: change.slug, dir: change.dir, archived: change.archived, files }
}

async function runCompletion(sandbox: string, scenario: Scenario): Promise<boolean> {
  return scenario.completed({
    sandbox,
    readFile: (rel) => readSandboxFile(sandbox, rel),
    exists: (rel) => sandboxExists(sandbox, rel),
  })
}
