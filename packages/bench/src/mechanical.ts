// Mechanical (authoritative) metrics scored post-hoc against a sandbox tree.
//
// These are the apples-to-apples signals the benchmark trusts, independent of
// any LLM judge:
//   (a) arm-native validation pass/fail — the tool's own validator on its own
//       output;
//   (b) a post-hoc `cospec validate --json --strict` pass over BOTH arms' trees,
//       yielding rule-id hit counts (a shared rubric, with the caveat it is
//       cospec's own);
//   (c) artifact presence/proportionality vs the scenario type's DECLARED set,
//       read from apps/cli's canon type-facts (never hardcoded here);
//   (d) apply-gate observance / archive integrity where the workflow reached
//       them (filesystem-observable);
//   (e) fixture task completion (the scenario's own predicate).

import { readdir, stat } from 'node:fs/promises'
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

export interface RuleCounts {
  errors: number
  warnings: number
  byRule: Record<string, number>
}

export interface MechanicalMetrics {
  /** true/false/null — null when no change was produced to validate. */
  changeProduced: boolean
  changeArchived: boolean
  /** cospec arm: schema stamp from .openspec.yaml; openspec arm: undefined (no typed schema). */
  stampedSchema?: string
  /** Arm-native validation: the tool validating its own output. null when no change. */
  armNativeValidatePass: boolean | null
  /** Post-hoc cospec validate --json --strict counts over this arm's tree. null when unparseable/no change. */
  cospecValidate: RuleCounts | null
  /** Files present under the change dir (excludes .openspec.yaml), for proportionality. */
  artifactFiles: string[]
  /** Files present that the scenario type does NOT declare (over-production). */
  forbiddenArtifacts: string[]
  /** Declared files the change is missing (under-production). */
  missingRequiredArtifacts: string[]
  /** All tasks checked off (tasks.md has [x] and no [ ]). null when tasks.md absent. */
  tasksAllChecked: boolean | null
  /** The fixture's requested code change actually landed. */
  taskCompleted: boolean
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
async function changeFiles(sandbox: string, changeDir: string): Promise<string[]> {
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
 * `apps/cli/src/core/report.ts`'s `toJson`) into rule-id counts. Tolerant: a
 * non-JSON body (e.g. an openspec-arm tree with no cospec schema stamp) or a
 * body missing `summary.byRule` resolves to null/derived-from-items rather than
 * throwing. Falls back to counting `items[].issues[].rule` when `byRule` is
 * absent/empty, so an older or hand-built report shape still yields counts.
 * Exported (pure, no I/O) so rule-id parsing is unit-testable against fixture
 * JSON without spawning the real CLI.
 */
export function parseCospecValidateJson(stdout: string): RuleCounts | null {
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
 * rule-id counts via `parseCospecValidateJson`.
 */
async function cospecValidateCounts(
  repoRoot: string,
  sandbox: string,
  slug: string,
): Promise<RuleCounts | null> {
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
  return parseCospecValidateJson(res.stdout)
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

/** Score every mechanical metric for one finished cell. */
export async function scoreMechanical(
  repoRoot: string,
  sandbox: string,
  arm: Arm,
  scenario: Scenario,
): Promise<MechanicalMetrics> {
  const change = await resolveChange(sandbox)

  if (change === undefined) {
    return {
      changeProduced: false,
      changeArchived: false,
      armNativeValidatePass: null,
      cospecValidate: null,
      artifactFiles: [],
      forbiddenArtifacts: [],
      missingRequiredArtifacts: [
        ...requiredArtifactFiles(scenario.type),
        ...(typeRequiresSpecs(scenario.type) ? ['specs/'] : []),
      ],
      tasksAllChecked: null,
      taskCompleted: await runCompletion(sandbox, scenario),
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
    cospecValidate: change.archived
      ? null
      : await cospecValidateCounts(repoRoot, sandbox, change.slug),
    artifactFiles: files,
    forbiddenArtifacts: forbidden,
    missingRequiredArtifacts: missing,
    tasksAllChecked,
    taskCompleted: await runCompletion(sandbox, scenario),
  }
}

async function runCompletion(sandbox: string, scenario: Scenario): Promise<boolean> {
  return scenario.completed({
    sandbox,
    readFile: (rel) => readSandboxFile(sandbox, rel),
    exists: (rel) => sandboxExists(sandbox, rel),
  })
}
