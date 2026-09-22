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
import { spawnOpenspec, type Root } from '../core/openspec.ts'
import {
  exitCode as reportExitCode,
  renderHuman,
  renderJson,
  type ItemReport,
} from '../core/report.ts'
import { resolveRoot } from '../core/root.ts'
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
import {
  capabilityForDeltaFile,
  discoverSpecFiles,
  isDeltaSpecFile,
  unreadDeltaExpectation,
} from '../core/spec-paths.ts'

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
  // `skip_specs:` / `retire_capabilities:` (openspec 1.7/1.8) are read here the
  // same way `schemaVersion` is: only the well-typed value flows through, and a
  // present-but-wrong-typed one raises its own rule rather than being coerced.
  const rawSkipSpecs = record.skip_specs
  const rawRetire = record.retire_capabilities
  return {
    present: true,
    parseable: true,
    schema,
    created,
    schemaVersion,
    schemaVersionInvalid,
    skipSpecs: typeof rawSkipSpecs === 'boolean' ? rawSkipSpecs : undefined,
    skipSpecsInvalid: rawSkipSpecs !== undefined && typeof rawSkipSpecs !== 'boolean',
    retireCapabilities: typeof rawRetire === 'boolean' ? rawRetire : undefined,
    retireCapabilitiesInvalid: rawRetire !== undefined && typeof rawRetire !== 'boolean',
  }
}

function loadChange(base: string, id: string, dir: string): LoadedChange {
  const files = existsSync(dir) ? listFilesRelative(dir) : []
  const designText = readIfExists(join(dir, 'design.md'))
  // Capability comes from the file's whole path under `specs/`, not its first
  // segment: the nested `specs/<area>/<capability>/spec.md` layout openspec grew
  // in 1.6.0 is one capability named `<area>/<capability>`, and that is the name
  // its living spec, its report path, and the archive merge all use. A file with
  // no capability at all (`specs/spec.md`) keeps an empty capability and is
  // reported by `deltas/spec-at-specs-root`.
  //
  // Only `spec.md` is a delta: openspec's own change parser reads nothing else,
  // so validating a companion `README.md`/`notes.md` sitting in a capability
  // directory would report issues against content openspec never sees.
  const deltaFiles = files
    .filter((f) => f.startsWith('specs/') && isDeltaSpecFile(f))
    .map((f) => ({
      path: f,
      capability: capabilityForDeltaFile(f) ?? '',
      text: readFileSync(join(dir, f), 'utf8'),
    }))

  // Everything else under `specs/` that a merge would never read. Only
  // markdown, and never a dot-entry: the walk mirrors openspec's
  // `findUnreadDeltaFiles` so the two agree about which files are candidates,
  // and `deltas/unread-file` then decides which of them carry delta sections.
  const unreadSpecFiles = files
    .filter(
      (f) =>
        f.startsWith('specs/') &&
        !isDeltaSpecFile(f) &&
        f.toLowerCase().endsWith('.md') &&
        !f.split('/').some((seg) => seg.startsWith('.')),
    )
    .map((f) => ({
      path: f,
      expected: unreadDeltaExpectation(f),
      text: readFileSync(join(dir, f), 'utf8'),
    }))

  const livingSpecs: LoadedChange['livingSpecs'] = new Map()
  for (const cap of new Set(deltaFiles.map((d) => d.capability))) {
    if (cap === '') continue
    const livingPath = join(openspecDir(base), 'specs', ...cap.split('/'), 'spec.md')
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
    unreadSpecFiles,
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
function cospecSchemaInfo(type: string, schemaVersion: number, skipSpecs = false): SchemaInfo {
  const ta = TYPE_ARTIFACTS[type as keyof typeof TYPE_ARTIFACTS]
  const artifacts: ArtifactSpec[] = ta.declared.map((id: ArtifactId) => ({
    id,
    generates: ARTIFACT_GENERATES[id],
    requires: [],
  }))
  // `skip_specs: true` is the persisted form of `--skip-specs`: the change
  // declares it changes no specified behaviour, so `specs` stops being a
  // required artifact. It stays *declared* — the type is unchanged, so
  // `meta/forbidden-artifact` must not start firing for a specs/ dir, and the
  // contradiction of declaring the marker while carrying spec files is reported
  // sharply by `deltas/skip-specs-conflict` instead.
  const applyRequires = enforcedApplyRequires(type as CospecType, schemaVersion).filter(
    (id) => !(skipSpecs && id === 'specs'),
  )
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

/** `<capability-path>/spec.md` at any depth — the change-relative path openspec
 *  reports a delta issue against, minus cospec's `specs/` prefix. */
const DELEGATED_DELTA_PATH_RE = /^(?:[^/]+\/)*spec\.md$/

/**
 * openspec 1.13.1's unread-delta ERROR reports a path relative to the change's
 * `specs/` dir whose shape says nothing about where it lives — `user-auth.md`
 * is indistinguishable from the change-root `tasks.md` — so the `specs/` prefix
 * is taken from the message, which spells the same path out, and only when the
 * two agree.
 */
const DELEGATED_UNREAD_DELTA_RE =
  /^Delta spec found at (specs\/.+?\.md)\. Delta specs must be a spec\.md inside a capability folder/

/**
 * Map an openspec issue into cospec's frozen shape, tagged `openspec/validate`.
 *
 * `deltaPaths` says the issue came from validating a CHANGE, where openspec
 * reports delta paths relative to the change's `specs/` dir — including the
 * bare `spec.md` it uses for a root-level delta, and the nested
 * `<area>/<capability>/spec.md` of the multi-area layout. Living-spec issues
 * use in-document locators (`overview`, `requirements[0]`) instead, so they are
 * passed through untouched.
 */
function mapDelegated(issue: OpenspecIssue, deltaPaths = false): Issue {
  let path = issue.path ?? '.'
  if (deltaPaths) {
    const unread = DELEGATED_UNREAD_DELTA_RE.exec(issue.message)?.[1]
    if (unread === `specs/${path}`) path = unread
    else if (DELEGATED_DELTA_PATH_RE.test(path)) path = `specs/${path}`
  }
  return {
    level: normalizeLevel(issue.level),
    rule: 'openspec/validate',
    path,
    line: issue.line,
    message: issue.message,
  }
}

/**
 * Defects both cospec and openspec 1.6+ now report. cospec's rule fires first
 * with its own id, hint and severity; printing openspec's twin underneath tells
 * the reader the same thing again in different words and doubles the issue
 * count `--strict` and the report summary read.
 *
 * Suppression is deliberately narrow — it needs a specific delegated message,
 * and the cospec rule must actually have fired on the same item. A delegated
 * issue with no cospec twin is always kept: cospec's own rules are the ones
 * that may be narrower, so the wrapped binary stays the safety net rather than
 * becoming noise to filter.
 */
interface DuplicateClass {
  /** the cospec rule whose finding already covers this defect. */
  rule: string
  /** the delegated message for the same defect. */
  delegated: RegExp
  /**
   * When set, the two findings must also name the same requirement and sit on
   * the same file: a *different* requirement's loss is a second real finding
   * rather than a duplicate. The capture group is the requirement name on both
   * sides, so the two are compared on the requirement, never on the wording.
   */
  nativeKey?: RegExp
}

const DUPLICATE_CLASSES: readonly DuplicateClass[] = [
  // 1.11.0 purpose-placeholder vs specs/purpose-tbd.
  { rule: 'specs/purpose-tbd', delegated: /^Purpose section is still a placeholder/ },
  // 1.7.0 root-level delta block vs deltas/spec-at-specs-root. Anchored through
  // its own second sentence, and keyed on the path: 1.13.1's unread-delta ERROR
  // opens with the same six words for any file whose name starts `spec.md`
  // (`specs/spec.md.md`), and a bare prefix match would suppress it.
  {
    rule: 'deltas/spec-at-specs-root',
    delegated: /^Delta spec found at (specs\/spec\.md)\. Delta specs must live under a capability/,
    nativeKey: /^delta spec found at (specs\/spec\.md) —/,
  },
  // 1.13.1 unread delta file vs deltas/unread-file. Keyed on the path both
  // messages name, so a second unread file is a second finding.
  {
    rule: 'deltas/unread-file',
    delegated: DELEGATED_UNREAD_DELTA_RE,
    nativeKey: /^delta spec found at (specs\/.+?\.md) —/,
  },
  // 1.13.1's unpaired FROM:/TO: ERROR vs deltas/unpaired-rename. cospec grew
  // its own rule while the pin still dropped the stray line silently; 1.13.1
  // caught up (`validation/validator.ts`) with a message whose first sentence
  // is byte-identical to cospec's, plus a remedy sentence. Keyed on the whole
  // `<side>: "<name>" has no matching <side>: line` span, so a second unpaired
  // line — a different side, or a different requirement — is a second finding.
  {
    rule: 'deltas/unpaired-rename',
    delegated:
      /^RENAMED ((?:FROM|TO): ".*" has no matching (?:FROM|TO): line)\. Write each rename as a FROM: line followed immediately by its TO: line\.$/,
    nativeKey: /^RENAMED ((?:FROM|TO): ".*" has no matching (?:FROM|TO): line)$/,
  },
  // 1.13.1 task-checkbox-format lint vs tasks/has-tasks. Same state, and cospec
  // is strictly ahead of upstream on it: an ERROR where 1.13.1 warns.
  { rule: 'tasks/has-tasks', delegated: /^This change counts as 0 tasks/ },
  // 1.7.0 CHANGE_SKIP_SPECS_CONFLICT vs deltas/skip-specs-conflict.
  {
    rule: 'deltas/skip-specs-conflict',
    delegated: /^skip_specs is set in \.openspec\.yaml but spec files exist/,
  },
  // 1.8.0/1.9.0 validate-scenario-loss-check vs archive/scenario-preservation.
  // The native key stops at `drops scenario` so it matches both shapes cospec
  // prints: the name-identity one (`drops scenario(s) "X" (living 2 -> delta
  // 2)`) and the count-arm fallback (`drops scenario count from 2 to 1`).
  {
    rule: 'archive/scenario-preservation',
    delegated: /^MODIFIED "(.*)" omits scenario\(s\)/,
    nativeKey: /^MODIFIED "(.*)" drops scenario/,
  },

  // --- 1.12.0 archive-preflight INFO (`Validator.findArchiveBlockers`) ------
  //
  // 1.12 dry-runs archive's merge builder during `validate` and relays each
  // thrown precondition as an INFO. cospec's archive/* family has already
  // reported the same preconditions as ERRORs with its own wording, so the INFO
  // is the same defect said twice — one entry per precondition shape openspec
  // throws, because `rule` pairs one-to-one.
  //
  // Every capture stops inside the closing quote of the offending header, so a
  // near-miss tail (`, but "### Requirement: X" exists; fix the header …`,
  // `and differs only in case or spacing; …`) is outside the key rather than
  // inside it. `- header mismatch in content` has NO cospec twin and is
  // deliberately absent: it must keep reaching the reader.
  //
  // The scenario-preservation blocker (`- current spec contains scenario(s) not
  // present …`) has no entry either, and cannot: `findArchiveBlockers` skips a
  // spec whose path already carries an ERROR, and upstream's own scenario-loss
  // check has emitted one on that path first. The same path-keying bounds the
  // whole family at one preflight INFO per delta file per run.
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*MODIFIED failed for header "### Requirement: (.+?)" - not found/,
    nativeKey: /^MODIFIED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*REMOVED failed for header "### Requirement: (.+?)" - not found/,
    nativeKey: /^REMOVED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/target-missing',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - source not found/,
    nativeKey: /^RENAMED target "(.+)" does not exist in living spec/,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - target already exists/,
    nativeKey: /^RENAMED target "(.+)" collides with an /,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*ADDED failed for header "### Requirement: (.+?)" - already exists/,
    nativeKey: /^ADDED "(.+)" already exists with different content/,
  },
  // 1.13.1's two case-collision refusals, paired with the fold arms
  // `rules/archive.ts` grew for them.
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*RENAMED failed for header "### Requirement: (.+?)" - "### Requirement: .*" already exists and differs only in case or spacing/,
    nativeKey: /^RENAMED target "(.+)" differs only in case or spacing/,
  },
  {
    rule: 'archive/added-exists',
    delegated:
      /^Archive would refuse this delta: .*ADDED failed for header "### Requirement: (.+?)" - "### Requirement: .*" already exists and differs only in case or spacing/,
    nativeKey: /^ADDED "(.+)" differs only in case or spacing/,
  },
]

/**
 * cospec's own issues followed by the delegated ones, minus every delegated
 * duplicate of a cospec rule that already fired on this item.
 */
export function mergeDelegated(native: Issue[], delegated: Issue[]): Issue[] {
  const kept = delegated.filter((issue) => {
    for (const cls of DUPLICATE_CLASSES) {
      const match = cls.delegated.exec(issue.message)
      if (match === null) continue
      const twin = native.some((n) => {
        if (n.rule !== cls.rule) return false
        if (cls.nativeKey === undefined) return true
        return n.path === issue.path && cls.nativeKey.exec(n.message)?.[1] === match[1]
      })
      if (twin) return false
    }
    return true
  })
  return [...native, ...kept]
}

/**
 * Run `openspec validate <args>` and return its parsed items. Tolerant: a
 * non-JSON body (e.g. the plain-text `Unknown item` an artifact-less change
 * yields) resolves to no items rather than throwing — cospec's own rules
 * already diagnose those states.
 */
async function delegate(root: Root, args: string[]): Promise<OpenspecItem[]> {
  const res = await spawnOpenspec(
    ['validate', ...args, '--strict', '--json', '--no-interactive', ...root.storeArgs],
    root.cwd,
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
/**
 * Every slug an archive directory could have come from.
 *
 * Openspec stamps `YYYY-MM-DD-<slug>` on archive, so the slug is normally the
 * name minus that prefix. Since 1.7.0 it refuses to stamp a *second* prefix on
 * a slug that already opens with a date, and archives it verbatim — so
 * `2026-07-04-thing` is ambiguous on disk: it is either slug `thing` archived
 * with a date, or slug `2026-07-04-thing` archived as itself. Both are
 * returned. This set only ever answers "has this slug been archived?"
 * (`blockers/*`, archive-collision), so covering both readings resolves the
 * blocker either way, while dropping one silently mis-answers it.
 */
export function archivedSlugsFor(dirName: string): string[] {
  const stripped = /^\d{4}-\d{2}-\d{2}-(.+)$/.exec(dirName)?.[1]
  if (stripped === undefined) return [dirName]
  return [stripped, dirName]
}

export function buildValidateContext(base: string): ValidateContext {
  const archiveSlugs = new Set(
    existsSync(archiveDir(base))
      ? readdirSync(archiveDir(base), { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .flatMap((e) => archivedSlugsFor(e.name))
      : [],
  )
  return { archiveSlugs, activeSlugs: new Set(listChanges(base).map((c) => c.id)) }
}

/**
 * Validate one change and return its report (DESIGN §4.1). Exported for `apply`
 * (§5.1 step 2, `fast: true`) and `archive` (§5.2 step 2, full). `opts.fast`
 * skips the archive-precondition family.
 */
export async function validateChange(
  root: Root,
  change: { id: string; dir: string; schema: string },
  ctx: ValidateContext,
  opts: { strict: boolean; fast: boolean },
): Promise<ItemReport> {
  const load = loadChange(root.base, change.id, change.dir)
  const y = load.openspecYaml

  // meta/openspec-yaml precondition — cannot classify without a schema.
  if (!y.present || !y.parseable || y.schema === undefined || y.schema.length === 0) {
    const issues = [...openspecYamlIssues(y), ...nameKebabIssues(change.id)]
    return buildReport(change.id, issues, undefined, opts.strict)
  }

  const resolution = resolveSchema(root.base, y.schema)

  if (resolution.kind === 'cospec') {
    const schema = cospecSchemaInfo(y.schema, y.schemaVersion ?? 1, y.skipSpecs === true)
    const issues = runChangeRules(load, schema, ctx, opts)
    // Delegate to openspec only for spec-bearing cospec changes that have a
    // proposal (openspec is blind to artifact-less changes — probe §5.3).
    if (
      schema.declared.has('specs') &&
      load.deltaFiles.length > 0 &&
      load.proposalText !== undefined
    ) {
      const items = await delegate(root, [change.id])
      const delegated = items
        .filter((item) => item.id === change.id)
        .flatMap((item) => item.issues.map((i) => mapDelegated(i, true)))
      return buildReport(change.id, mergeDelegated(issues, delegated), y.schema, opts.strict)
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
    const items = await delegate(root, [change.id])
    for (const item of items)
      if (item.id === change.id) issues.push(...item.issues.map((i) => mapDelegated(i, true)))
  }
  return buildReport(change.id, issues, y.schema, opts.strict)
}

/**
 * Living capabilities, discovered recursively so the nested
 * `specs/<area>/<capability>/spec.md` layout is listed under the same id
 * openspec itself uses (`<area>/<capability>`) rather than being missed
 * entirely by a one-level readdir.
 */
function livingSpecFiles(base: string): { id: string; specFile: string }[] {
  return discoverSpecFiles(join(openspecDir(base), 'specs'))
}

async function validateSpecs(root: Root, only: string | undefined): Promise<ItemReport[]> {
  const caps = livingSpecFiles(root.base).filter((c) => only === undefined || c.id === only)
  if (caps.length === 0) return []

  const delegated = new Map<string, OpenspecIssue[]>()
  for (const item of await delegate(root, ['--specs'])) delegated.set(item.id, item.issues)

  return caps.map((cap) => {
    const path = `specs/${cap.id}/spec.md`
    const living = parseLivingSpec(readFileSync(cap.specFile, 'utf8'))
    const issues = mergeDelegated(
      specsRules(living, path),
      (delegated.get(cap.id) ?? []).map((i) => mapDelegated(i)),
    )
    const errors = issues.filter((i) => i.level === 'ERROR').length
    return { id: cap.id, kind: 'spec' as const, valid: errors === 0, issues }
  })
}

/**
 * `cospec validate --archived` — pure delegation (openspec >= 1.9.0). The
 * wrapped binary walks `changes/archive/` and reports any archived change whose
 * tasks are not all complete; cospec has no native rule family for archived
 * changes, so nothing is merged in. Its envelope is relayed through cospec's
 * own renderer so the output and exit code match every other validate surface.
 *
 * Returns `undefined` when the wrapped binary produced no parseable envelope —
 * an openspec below 1.9.0 rejects the flag — so the caller can relay the
 * wrapped diagnostics verbatim instead of printing an empty, passing report.
 */
async function validateArchived(root: Root): Promise<ItemReport[] | undefined> {
  const res = await spawnOpenspec(
    ['validate', '--archived', '--json', '--no-interactive', ...root.storeArgs],
    root.cwd,
  )
  let parsed: OpenspecValidateJson
  try {
    parsed = JSON.parse(res.stdout) as OpenspecValidateJson
  } catch {
    process.stderr.write(res.stderr)
    return undefined
  }
  if (!Array.isArray(parsed.items)) return undefined
  return parsed.items.map((item) => ({
    id: item.id,
    kind: 'change' as const,
    valid: item.valid,
    issues: item.issues.map((i) => mapDelegated(i, true)),
  }))
}

// --- command entrypoint -----------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const { flags } = ctx
  const args = ctx.args
  const strict = args.includes('--strict')
  const fast = args.includes('--fast')
  const wantAll = args.includes('--all')
  const wantChanges = args.includes('--changes')
  const wantSpecs = args.includes('--specs')
  const wantArchived = args.includes('--archived')
  const name = args.find((a) => !a.startsWith('-'))

  const root = await resolveRoot(ctx)
  const base = root.base

  if (!existsSync(openspecDir(base))) {
    process.stderr.write(`cospec: no openspec/ directory at ${base} — run 'cospec init' first\n`)
    return 1
  }

  // `--archived` is its own scope, resolved before every other flag: it reads
  // changes/archive/, which active-change discovery deliberately excludes, and
  // it must never quietly alter an ordinary invocation.
  if (wantArchived) {
    const archived = await validateArchived(root)
    if (archived === undefined) {
      process.stderr.write(
        "cospec: 'openspec validate --archived' produced no report — it needs openspec >=1.9.0\n",
      )
      return 1
    }
    const body = flags.json
      ? renderJson(archived)
      : renderHuman(archived, { strict, noColor: flags.noColor })
    process.stdout.write(body)
    return reportExitCode(archived, strict)
  }

  const changes = listChanges(base)
  const ctxRules = buildValidateContext(base)

  const items: ItemReport[] = []

  if (name !== undefined) {
    // item-name auto-detection: change first, then living spec.
    const change = resolveChange(base, name)
    if (change !== undefined) {
      items.push(await validateChange(root, change, ctxRules, { strict, fast }))
    } else if (existsSync(join(openspecDir(base), 'specs', name, 'spec.md'))) {
      items.push(...(await validateSpecs(root, name)))
    } else {
      process.stderr.write(`cospec: unknown item '${name}'\n`)
      return 1
    }
  } else {
    const doChanges = wantChanges || wantAll || (!wantChanges && !wantSpecs)
    const doSpecs = wantSpecs || wantAll || (!wantChanges && !wantSpecs)
    if (doChanges) {
      const reports = await Promise.all(
        changes.map((change) => validateChange(root, change, ctxRules, { strict, fast })),
      )
      items.push(...reports)
    }
    if (doSpecs) items.push(...(await validateSpecs(root, undefined)))
  }

  const output = flags.json
    ? renderJson(items)
    : renderHuman(items, { strict, noColor: flags.noColor })
  process.stdout.write(output)
  return reportExitCode(items, strict)
}
