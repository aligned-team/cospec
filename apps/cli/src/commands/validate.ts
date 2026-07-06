// `cospec validate` — the composition algorithm (DESIGN §4.1). Runs cospec's
// rule families for cospec-typed changes, delegates to `openspec validate` for
// spec-bearing changes (merging its issues) and for legacy schemas, and adds
// cospec-only diagnostics over living specs. Openspec's hardcoded
// CHANGE_NO_DELTAS rule is never triggered for a change whose schema has no
// specs artifact (§4.1) — cospec only delegates when specs files exist.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import {
  archiveDir,
  isValidSchemaVersion,
  listChanges,
  openspecDir,
  resolveChange,
  resolveSchema,
} from '../core/change.ts'
import { parseLivingSpec } from '../core/deltas.ts'
import { spawnOpenspec } from '../core/openspec.ts'
import {
  exitCode as reportExitCode,
  renderHuman,
  renderJson,
  type ItemReport,
} from '../core/report.ts'
import { runChangeRules, specsRules } from '../core/rules/index.ts'
import type { Issue, IssueLevel } from '../core/rules/issue.ts'
import {
  nameKebabIssues,
  openspecYamlIssues,
  schemaClassificationIssues,
} from '../core/rules/meta.ts'
import {
  deriveSchemaInfo,
  type ArtifactSpec,
  type LoadedChange,
  type SchemaInfo,
  type ValidateContext,
} from '../core/rules/schema-info.ts'
import {
  ARTIFACT_GENERATES,
  enforcedApplyRequires,
  TYPE_ARTIFACTS,
  type ArtifactId,
  type CospecType,
} from '../core/rules/type-facts.ts'

// --- Change loading (filesystem → LoadedChange) ---------------------------

function listFilesRelative(dir: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const child = join(abs, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile()) out.push(relative(dir, child).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.toSorted()
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined
}

function loadOpenspecYaml(changeDir: string): LoadedChange['openspecYaml'] {
  const path = join(changeDir, '.openspec.yaml')
  if (!existsSync(path)) return { present: false, parseable: false }
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    return { present: true, parseable: false }
  }
  if (doc === null || typeof doc !== 'object') return { present: true, parseable: true }
  const record = doc as Record<string, unknown>
  const schema = typeof record.schema === 'string' ? record.schema : undefined
  const created = typeof record.created === 'string' ? record.created : undefined
  const rawSchemaVersion = record.schemaVersion
  // A present-but-non-positive-integer schemaVersion is reported via
  // schemaVersionInvalid (meta/openspec-yaml) but must not flow through as a
  // usable version — otherwise `?? 1` would keep the garbage and mis-filter
  // enforcedApplyRequires. Treat it as absent, matching readOpenspecYaml.
  const schemaVersion = isValidSchemaVersion(rawSchemaVersion) ? rawSchemaVersion : undefined
  const schemaVersionInvalid =
    rawSchemaVersion !== undefined && !isValidSchemaVersion(rawSchemaVersion)
  return { present: true, parseable: true, schema, created, schemaVersion, schemaVersionInvalid }
}

function loadChange(cwd: string, id: string, dir: string): LoadedChange {
  const files = existsSync(dir) ? listFilesRelative(dir) : []
  const designText = readIfExists(join(dir, 'design.md'))
  const deltaFiles = files
    .filter((f) => /^specs\/[^/]+\/.*\.md$/.test(f) || /^specs\/[^/]+\.md$/.test(f))
    .map((f) => {
      const rest = f.slice('specs/'.length)
      const capability = rest.split('/')[0] ?? ''
      return { path: f, capability, text: readFileSync(join(dir, f), 'utf8') }
    })

  const livingSpecs: LoadedChange['livingSpecs'] = new Map()
  for (const cap of new Set(deltaFiles.map((d) => d.capability))) {
    const livingPath = join(openspecDir(cwd), 'specs', cap, 'spec.md')
    if (existsSync(livingPath))
      livingSpecs.set(cap, parseLivingSpec(readFileSync(livingPath, 'utf8')))
  }

  return {
    id,
    openspecYaml: loadOpenspecYaml(dir),
    files,
    proposalText: readIfExists(join(dir, 'proposal.md')),
    blockersText: readIfExists(join(dir, 'blocking-changes.md')),
    tasksText: readIfExists(join(dir, 'tasks.md')),
    verificationText: readIfExists(join(dir, 'verification.md')),
    designExists: designText !== undefined,
    designText,
    deltaFiles,
    livingSpecs,
  }
}

/**
 * `applyRequires` is filtered through `enforcedApplyRequires` (DESIGN §5) so a
 * change stamped (or defaulted to) `schemaVersion` 1 is never flagged for an
 * artifact introduced at v2 — applied here so both `verification/missing` and
 * `change/artifact-missing` grandfather identically at validate, apply, and
 * archive (all three delegate through `validateChange`/this function).
 */
function cospecSchemaInfo(type: string, schemaVersion: number): SchemaInfo {
  const ta = TYPE_ARTIFACTS[type as keyof typeof TYPE_ARTIFACTS]
  const artifacts: ArtifactSpec[] = ta.declared.map((id: ArtifactId) => ({
    id,
    generates: ARTIFACT_GENERATES[id],
    requires: [],
  }))
  const applyRequires = enforcedApplyRequires(type as CospecType, schemaVersion)
  return deriveSchemaInfo(type, artifacts, applyRequires, true)
}

// --- openspec delegation ---------------------------------------------------

interface OpenspecIssue {
  level: string
  path?: string
  line?: number
  message: string
}
interface OpenspecItem {
  id: string
  valid: boolean
  issues: OpenspecIssue[]
}
interface OpenspecValidateJson {
  items: OpenspecItem[]
}

function normalizeLevel(level: string): IssueLevel {
  const up = level.toUpperCase()
  if (up === 'ERROR' || up === 'WARNING' || up === 'INFO') return up
  return 'ERROR'
}

/** Map an openspec issue into cospec's frozen shape, tagged `openspec/validate`. */
function mapDelegated(issue: OpenspecIssue): Issue {
  let path = issue.path ?? '.'
  if (/^[^/]+\/spec\.md$/.test(path)) path = `specs/${path}`
  return {
    level: normalizeLevel(issue.level),
    rule: 'openspec/validate',
    path,
    line: issue.line,
    message: issue.message,
  }
}

/**
 * Run `openspec validate <args>` and return its parsed items. Tolerant: a
 * non-JSON body (e.g. the plain-text `Unknown item` an artifact-less change
 * yields) resolves to no items rather than throwing — cospec's own rules
 * already diagnose those states.
 */
async function delegate(cwd: string, args: string[]): Promise<OpenspecItem[]> {
  const res = await spawnOpenspec(
    ['validate', ...args, '--strict', '--json', '--no-interactive'],
    cwd,
  )
  try {
    const parsed = JSON.parse(res.stdout) as OpenspecValidateJson
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch {
    return []
  }
}

// --- per-item validation ---------------------------------------------------

function buildReport(
  id: string,
  issues: Issue[],
  type: string | undefined,
  strict: boolean,
): ItemReport {
  const errors = issues.filter((i) => i.level === 'ERROR').length
  const warnings = issues.filter((i) => i.level === 'WARNING').length
  const valid = errors === 0 && (!strict || warnings === 0)
  return { id, kind: 'change', type, valid, issues }
}

/**
 * Build the archive/active-slug context a change validation needs. Exported so
 * other commands (`apply`, `archive`) can run `validateChange` programmatically
 * without re-deriving the indexes.
 */
export function buildValidateContext(cwd: string): ValidateContext {
  const archiveSlugs = new Set(
    existsSync(archiveDir(cwd))
      ? readdirSync(archiveDir(cwd), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(e.name)?.[1])
          .filter((s): s is string => s !== undefined)
      : [],
  )
  return { archiveSlugs, activeSlugs: new Set(listChanges(cwd).map((c) => c.id)) }
}

/**
 * Validate one change and return its report (DESIGN §4.1). Exported for `apply`
 * (§5.1 step 2, `fast: true`) and `archive` (§5.2 step 2, full). `opts.fast`
 * skips the archive-precondition family.
 */
export async function validateChange(
  cwd: string,
  change: { id: string; dir: string; schema: string },
  ctx: ValidateContext,
  opts: { strict: boolean; fast: boolean },
): Promise<ItemReport> {
  const load = loadChange(cwd, change.id, change.dir)
  const y = load.openspecYaml

  // meta/openspec-yaml precondition — cannot classify without a schema.
  if (!y.present || !y.parseable || y.schema === undefined || y.schema.length === 0) {
    const issues = [...openspecYamlIssues(y), ...nameKebabIssues(change.id)]
    return buildReport(change.id, issues, undefined, opts.strict)
  }

  const resolution = resolveSchema(cwd, y.schema)

  if (resolution.kind === 'cospec') {
    const schema = cospecSchemaInfo(y.schema, y.schemaVersion ?? 1)
    const issues = runChangeRules(load, schema, ctx, opts)
    // Delegate to openspec only for spec-bearing cospec changes that have a
    // proposal (openspec is blind to artifact-less changes — probe §5.3).
    if (
      schema.declared.has('specs') &&
      load.deltaFiles.length > 0 &&
      load.proposalText !== undefined
    ) {
      const items = await delegate(cwd, [change.id])
      for (const item of items)
        if (item.id === change.id) issues.push(...item.issues.map(mapDelegated))
    }
    return buildReport(change.id, issues, y.schema, opts.strict)
  }

  // Legacy / unknown: no cospec rule families; classify and (legacy) delegate.
  const stub = deriveSchemaInfo(y.schema, [], [], resolution.kind === 'legacy')
  const issues = [
    ...openspecYamlIssues(y),
    ...nameKebabIssues(change.id),
    ...schemaClassificationIssues(stub),
  ]
  if (resolution.kind === 'legacy') {
    const items = await delegate(cwd, [change.id])
    for (const item of items)
      if (item.id === change.id) issues.push(...item.issues.map(mapDelegated))
  }
  return buildReport(change.id, issues, y.schema, opts.strict)
}

function livingSpecCaps(cwd: string): string[] {
  const specsRoot = join(openspecDir(cwd), 'specs')
  if (!existsSync(specsRoot)) return []
  return readdirSync(specsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(specsRoot, e.name, 'spec.md')))
    .map((e) => e.name)
    .toSorted()
}

async function validateSpecs(cwd: string, only: string | undefined): Promise<ItemReport[]> {
  const caps = livingSpecCaps(cwd).filter((c) => only === undefined || c === only)
  if (caps.length === 0) return []

  const delegated = new Map<string, OpenspecIssue[]>()
  for (const item of await delegate(cwd, ['--specs'])) delegated.set(item.id, item.issues)

  return caps.map((cap) => {
    const path = `specs/${cap}/spec.md`
    const living = parseLivingSpec(
      readFileSync(join(openspecDir(cwd), 'specs', cap, 'spec.md'), 'utf8'),
    )
    const issues: Issue[] = [
      ...specsRules(living, path),
      ...(delegated.get(cap) ?? []).map(mapDelegated),
    ]
    const errors = issues.filter((i) => i.level === 'ERROR').length
    return { id: cap, kind: 'spec' as const, valid: errors === 0, issues }
  })
}

// --- command entrypoint -----------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const { cwd, flags } = ctx
  const args = ctx.args
  const strict = args.includes('--strict')
  const fast = args.includes('--fast')
  const wantAll = args.includes('--all')
  const wantChanges = args.includes('--changes')
  const wantSpecs = args.includes('--specs')
  const name = args.find((a) => !a.startsWith('-'))

  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec: no openspec/ directory at ${cwd} — run 'cospec init' first\n`)
    return 1
  }

  const changes = listChanges(cwd)
  const ctxRules = buildValidateContext(cwd)

  const items: ItemReport[] = []

  if (name !== undefined) {
    // item-name auto-detection: change first, then living spec.
    const change = resolveChange(cwd, name)
    if (change !== undefined) {
      items.push(await validateChange(cwd, change, ctxRules, { strict, fast }))
    } else if (existsSync(join(openspecDir(cwd), 'specs', name, 'spec.md'))) {
      items.push(...(await validateSpecs(cwd, name)))
    } else {
      process.stderr.write(`cospec: unknown item '${name}'\n`)
      return 1
    }
  } else {
    const doChanges = wantChanges || wantAll || (!wantChanges && !wantSpecs)
    const doSpecs = wantSpecs || wantAll || (!wantChanges && !wantSpecs)
    if (doChanges) {
      const reports = await Promise.all(
        changes.map((change) => validateChange(cwd, change, ctxRules, { strict, fast })),
      )
      items.push(...reports)
    }
    if (doSpecs) items.push(...(await validateSpecs(cwd, undefined)))
  }

  const output = flags.json
    ? renderJson(items)
    : renderHuman(items, { strict, noColor: flags.noColor })
  process.stdout.write(output)
  return reportExitCode(items, strict)
}
