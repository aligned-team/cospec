// `cospec doctor` (DESIGN §2.3). Read-only diagnosis of a cospec setup; exits 1
// on any ERROR finding. Every finding carries a one-line remedy. Checks: the
// wrapped openspec resolves at the expected version; the manifest is present and
// schemas/harness files are not drifted (reuses the update engine's dry run);
// harness files are not stale/mixed-version; slash/skill references in generated
// bodies all resolve (the structural guard against openspec's dangling-ref
// failure class); config.yaml (else config.yml) parses with a known schema; no leftover opsx files
// or stale .cospec-new sidecars; changes sit on known schemas; the git hooks
// are installed when the gate was scaffolded; and, on every root, a delegated
// `openspec doctor --json` (and, for a store root, `openspec store doctor
// --json`) folds openspec's own root-relationship/reference/store-health
// diagnostics in (read-only, never repair — WI-8), its `root`, `store`,
// `references` and `status` keys carried in cospec's `--json` document and
// each line of its stderr (config warnings) a WARNING finding.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import {
  COSPEC_TYPES,
  isCospecType,
  listChanges,
  openspecDir,
  resolveSchema,
} from '../core/change.ts'
import {
  CURRENT_GENERATED_BY,
  readManifest,
  splitFrontmatter,
  type WriteResult,
} from '../core/managed-files.ts'
import {
  OPENSPEC_VERSION_RANGE,
  OpenspecCallError,
  type OpenspecResolution,
  type OpenspecStatusEntry,
  passthroughOpenspec,
  type PostCondition,
  resolveOpenspec,
  satisfiesOpenspecRange,
  type Root,
} from '../core/openspec.ts'
import { respellRemedies } from '../core/remedies.ts'
import { type ResolvedRoot, resolveRoot, RootSelectionError } from '../core/root.ts'
import {
  commandPath,
  HARNESS_TABLE,
  primaryRoot,
  scanRoots,
  skillsRoot,
} from '../harness/adapters.ts'
import { OPSX_SHARED_SKILL_ROOT } from './init.ts'
import { detectHarnesses, generate } from './update.ts'

type Level = 'ERROR' | 'WARNING' | 'INFO'

interface Finding {
  level: Level
  check: string
  message: string
  remedy?: string
}

/**
 * Workflow id → skill dir name. Mirrors the `workflows:` block of
 * canon/workflows/harness.yaml — workflow identity, not tool layout, which
 * HARNESS_TABLE declares.
 */
const WORKFLOW_SKILL: Record<string, string> = {
  propose: 'cospec-propose',
  new: 'cospec-new-change',
  continue: 'cospec-continue-change',
  ff: 'cospec-ff-change',
  update: 'cospec-update-change',
  apply: 'cospec-apply-change',
  verify: 'cospec-verify-change',
  archive: 'cospec-archive-change',
  'bulk-archive': 'cospec-bulk-archive-change',
  'sync-specs': 'cospec-sync-specs',
  explore: 'cospec-explore',
  onboard: 'cospec-onboard',
}

/** Skill dir name suffix -> workflow id (the reverse of WORKFLOW_SKILL). */
const SKILL_SUFFIX_WORKFLOW: Record<string, string> = Object.fromEntries(
  Object.entries(WORKFLOW_SKILL).map(([id, skill]) => [skill.replace(/^cospec-/, ''), id]),
)

// --- individual checks ------------------------------------------------------

/** Exported for testing with an injected resolution (no project copy in-process). */
export function checkOpenspecVersion(
  findings: Finding[],
  resolved: OpenspecResolution = resolveOpenspec(),
): void {
  if (resolved.source === 'embedded') {
    // Same order a wrapped spawn uses; reporting the compile-time pin keeps
    // this check read-only (no bundle extraction).
    findings.push({
      level: 'INFO',
      check: 'openspec-resolve',
      message: `no project @fission-ai/openspec; wrapped calls use the embedded pinned ${resolved.version}`,
    })
    return
  }
  let version = ''
  try {
    const pkg = JSON.parse(readFileSync(join(resolved.packageDir, 'package.json'), 'utf8')) as {
      version?: string
    }
    version = typeof pkg.version === 'string' ? pkg.version : ''
  } catch {
    // fall through to mismatch handling
  }
  if (!satisfiesOpenspecRange(version)) {
    findings.push({
      level: 'ERROR',
      check: 'openspec-version',
      message: `bundled openspec is ${version || '<unknown>'}, expected a version satisfying ${OPENSPEC_VERSION_RANGE}`,
      remedy: 'pin @fission-ai/openspec within the accepted range, then re-run the contract suite',
    })
  }
}

function checkDrift(cwd: string, findings: Finding[]): WriteResult[] {
  const manifest = readManifest(cwd)
  if (manifest === undefined) {
    findings.push({
      level: 'ERROR',
      check: 'manifest',
      message: 'openspec/.cospec-manifest.json is missing or unparseable',
      remedy: 'run `cospec update` (or `cospec init`) to materialize the schemas',
    })
  }

  const harnesses = detectHarnesses(cwd)
  const { results, migration } = generate(cwd, { harnesses, dryRun: true })
  for (const r of results) {
    if (r.outcome === 'unchanged') continue
    if (r.outcome === 'created') {
      findings.push({
        level: 'ERROR',
        check: 'schema-missing',
        message: `managed file is missing: ${r.path}`,
        remedy: 'run `cospec update`',
      })
    } else if (r.outcome === 'updated' || r.outcome === 'removed') {
      findings.push({
        level: 'WARNING',
        check: 'drift',
        message: `${r.path} is out of date with canon (${r.outcome})`,
        remedy: 'run `cospec update`',
      })
    } else if (r.outcome === 'preserved-modified' || r.outcome === 'preserved-foreign') {
      findings.push({
        level: 'WARNING',
        check: 'drift',
        message: `${r.path} has been hand-edited and diverges from canon (${r.outcome})`,
        remedy: 'reconcile the .cospec-new sidecar, or run `cospec update --force` to overwrite',
      })
    }
  }
  return migration
}

/**
 * cospec's Codex skills moved from `.codex/skills` to the shared `.agents/skills`
 * root. A file still sitting in the old place is a legacy LAYOUT problem, not
 * canon drift — reporting it through `checkDrift`'s `drift`/hand-edited vocabulary
 * would tell the user their file diverged from canon, which is not what happened.
 */
function checkLegacyLayout(migration: WriteResult[], findings: Finding[]): void {
  for (const r of migration) {
    findings.push({
      level: 'WARNING',
      check: 'legacy-layout',
      message: `${r.path} is a legacy location; cospec's Codex skills now live in .agents/skills`,
      remedy: 'run `cospec update` (`--force` to discard local edits to the legacy copy)',
    })
  }
}

function harnessMarkdownFiles(cwd: string): { relpath: string; text: string }[] {
  // Keyed by relpath: the `.agents` harness dir strictly contains the shared
  // `.agents/skills` opsx root, so the two walk ranges overlap and an unguarded
  // scan would report every finding in that tree twice.
  const out = new Map<string, { relpath: string; text: string }>()
  const walk = (rel: string): void => {
    const abs = join(cwd, rel)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`
      if (entry.isDirectory()) walk(childRel)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (out.has(childRel)) continue
        out.set(childRel, { relpath: childRel, text: readFileSync(join(cwd, childRel), 'utf8') })
      }
    }
  }
  for (const root of scanRoots()) walk(root)
  // openspec ≥1.8.0 writes its Codex skills to the shared `.agents/skills/` root.
  // cospec now writes its own `cospec-*` skills there as well; both prefixes coexist,
  // and the opsx check filters on provenance, never on the path.
  walk(OPSX_SHARED_SKILL_ROOT)
  return [...out.values()]
}

function checkStaleness(files: { relpath: string; text: string }[], findings: Finding[]): void {
  const versions = new Set<string>()
  for (const f of files) {
    const { frontmatter } = splitFrontmatter(f.text)
    const meta = frontmatter?.metadata
    if (meta === null || typeof meta !== 'object') continue
    const record = meta as Record<string, unknown>
    if (record.author !== 'cospec') continue
    const gen = typeof record.generatedBy === 'string' ? record.generatedBy : ''
    versions.add(gen)
    if (gen !== CURRENT_GENERATED_BY) {
      findings.push({
        level: 'WARNING',
        check: 'stale-harness',
        message: `${f.relpath} was generated by ${gen || '<unknown>'} (current is ${CURRENT_GENERATED_BY})`,
        remedy: 'run `cospec update`',
      })
    }
  }
  if (versions.size > 1) {
    findings.push({
      level: 'WARNING',
      check: 'mixed-versions',
      message: `harness files carry mixed generator versions: ${[...versions].toSorted().join(', ')}`,
      remedy: 'run `cospec update` to bring every file to the current version',
    })
  }
}

function checkDanglingRefs(
  cwd: string,
  files: { relpath: string; text: string }[],
  findings: Finding[],
): void {
  for (const f of files) {
    // The row whose primary root prefixes the file owns it.
    const row = HARNESS_TABLE.find((r) => {
      const root = primaryRoot(r)
      return root !== undefined && f.relpath.startsWith(`${root}/`)
    })
    if (row === undefined) continue
    const harness = row.id
    const { body } = splitFrontmatter(f.text)
    const refs = new Set<string>()
    for (const m of body.matchAll(/\/cospec[:-]([a-z][a-z-]*)/g)) refs.add(m[1]!)
    for (const ref of refs) {
      // A reference is spelled either with the workflow id (`/cospec:apply`,
      // `/cospec-apply`) or — in the shared `.agents` dialect, which emits no
      // command files — with the skill dir name (`/cospec-apply-change`).
      const id = WORKFLOW_SKILL[ref] !== undefined ? ref : SKILL_SUFFIX_WORKFLOW[ref]
      const skill = id === undefined ? undefined : WORKFLOW_SKILL[id]
      if (id === undefined || skill === undefined) {
        findings.push({
          level: 'ERROR',
          check: 'dangling-ref',
          message: `${f.relpath} references /cospec:${ref}, which is not a known cospec workflow`,
          remedy: 'run `cospec update` to regenerate from canon',
        })
        continue
      }
      const skillExists = existsSync(join(cwd, skillsRoot(row).root, skill, 'SKILL.md'))
      const cmdFile = commandPath(row, id)
      const cmdExists = cmdFile !== undefined && existsSync(join(cwd, cmdFile))
      if (!skillExists && !cmdExists) {
        findings.push({
          level: 'ERROR',
          check: 'dangling-ref',
          message: `${f.relpath} references /cospec:${id}, but no ${harness} skill or command file for it exists`,
          remedy: 'run `cospec update` to regenerate the full workflow set',
        })
      }
    }
  }
}

/**
 * The project config the binary reads: `openspec/config.yaml`, else
 * `openspec/config.yml` (upstream's `resolveConfigFilePath` order), relative
 * to `cwd`; undefined when there is neither.
 */
function projectConfigFile(cwd: string): string | undefined {
  return ['config.yaml', 'config.yml']
    .map((name) => `openspec/${name}`)
    .find((rel) => existsSync(join(cwd, rel)))
}

function checkConfig(cwd: string, findings: Finding[]): void {
  const rel = projectConfigFile(cwd)
  if (rel === undefined) return
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(join(cwd, rel), 'utf8'))
  } catch {
    findings.push({
      level: 'ERROR',
      check: 'config',
      message: `${rel} does not parse as YAML`,
      remedy: 'fix the YAML syntax',
    })
    return
  }
  const schema =
    doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>).schema : undefined
  if (typeof schema === 'string' && !(COSPEC_TYPES as readonly string[]).includes(schema)) {
    findings.push({
      level: 'INFO',
      check: 'config',
      message: `${rel} default schema is '${schema}' (not one of the 11 cospec types)`,
      remedy:
        'set `schema:` to a cospec type for the full guided workflow, or keep it if intentional',
    })
  }
}

function checkOpsx(cwd: string, findings: Finding[]): void {
  for (const f of harnessMarkdownFiles(cwd)) {
    const { frontmatter } = splitFrontmatter(f.text)
    const meta = frontmatter?.metadata
    // Provenance-only, matching init's removal set (DESIGN §2.1/§6.6): flag a
    // file only when its own frontmatter proves openspec authored it. Path/name
    // conventions alone are not provenance — never warn on user-authored files.
    const isOpsxSkill =
      meta !== null &&
      typeof meta === 'object' &&
      (meta as Record<string, unknown>).author === 'openspec'
    const name = frontmatter?.name
    const isOpsxCommand = typeof name === 'string' && /^"?OPSX:/.test(name)
    if (isOpsxSkill || isOpsxCommand) {
      findings.push({
        level: 'WARNING',
        check: 'opsx-leftover',
        message: `leftover openspec (opsx) file: ${f.relpath} — two propose commands confuse agents`,
        remedy: 'run `cospec init --remove-opsx` to delete provably openspec-generated files',
      })
    }
  }
}

function checkStaleSidecars(cwd: string, findings: Finding[]): void {
  const found = new Set<string>()
  const walk = (rel: string): void => {
    const abs = join(cwd, rel)
    if (!existsSync(abs)) return
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const childRel = `${rel}/${entry.name}`
      if (entry.isDirectory()) {
        if (entry.name === 'archive') continue
        walk(childRel)
      } else if (entry.isFile() && entry.name.endsWith('.cospec-new')) found.add(childRel)
    }
  }
  walk('openspec')
  for (const root of scanRoots()) walk(root)
  for (const relpath of found) {
    findings.push({
      level: 'WARNING',
      check: 'stale-sidecar',
      message: `unreconciled sidecar: ${relpath}`,
      remedy: 'apply or discard the .cospec-new file, then delete it',
    })
  }
}

function checkChangeSchemas(cwd: string, findings: Finding[]): void {
  for (const change of listChanges(cwd)) {
    if (change.schema === '') continue
    const resolution = resolveSchema(cwd, change.schema)
    if (resolution.kind === 'unknown') {
      findings.push({
        level: 'WARNING',
        check: 'change-schema',
        message: `change '${change.id}' uses schema '${change.schema}', which resolves nowhere`,
        remedy: 'retype the change with `cospec new <type> <slug>` or `cospec schema fork`',
      })
    } else if (resolution.kind === 'legacy') {
      findings.push({
        level: 'INFO',
        check: 'change-schema',
        message: `change '${change.id}' uses legacy schema '${change.schema}' (structural checks only)`,
        remedy: 'legacy schemas are validated via openspec delegation; no action needed',
      })
    }
  }
}

/** `cospec doctor` lists active changes still on `schemaVersion` 1 (DESIGN §5). */
function checkSchemaVersions(cwd: string, findings: Finding[]): void {
  for (const change of listChanges(cwd)) {
    if (!isCospecType(change.schema)) continue
    if ((change.schemaVersion ?? 1) >= 2) continue
    findings.push({
      level: 'INFO',
      check: 'schema-version',
      message: `change '${change.id}' is still on schemaVersion 1`,
      remedy: `run \`cospec migrate ${change.id}\` to scaffold verification.md and bump to v2`,
    })
  }
}

function checkGateHooks(cwd: string, findings: Finding[]): void {
  if (!existsSync(join(cwd, 'hk.pkl'))) return
  if (!existsSync(join(cwd, '.git'))) return
  if (!existsSync(join(cwd, '.git', 'hooks', 'pre-commit'))) {
    findings.push({
      level: 'WARNING',
      check: 'gate-hooks',
      message: 'hk.pkl is present but git hooks are not installed',
      remedy: 'run `hk install --mise` (or `mise install`) to wire the commit hooks',
    })
  }
}

// --- openspec relationship/store health (delegated, read-only — WI-8) ------

const SEVERITY_LEVEL: Record<string, Level> = { error: 'ERROR', warning: 'WARNING', info: 'INFO' }

function foldStatus(
  prefix: string,
  entries: OpenspecStatusEntry[] | undefined,
  findings: Finding[],
): void {
  if (entries === undefined) return
  for (const entry of entries) {
    findings.push({
      level: SEVERITY_LEVEL[entry.severity] ?? 'INFO',
      check: `openspec-${prefix}-${entry.code}`,
      message: entry.message,
      remedy: entry.fix,
    })
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** True when the project config (`projectConfigFile`) declares a non-empty `references:` list. */
function hasReferencesConfig(cwd: string): boolean {
  const rel = projectConfigFile(cwd)
  if (rel === undefined) return false
  try {
    const doc = parseYaml(readFileSync(join(cwd, rel), 'utf8'))
    if (doc === null || typeof doc !== 'object') return false
    const refs = (doc as Record<string, unknown>).references
    return Array.isArray(refs) && refs.length > 0
  } catch {
    // checkConfig already reports unparseable YAML
    return false
  }
}

/**
 * The `root`, `store`, `references` and `status` keys of `openspec doctor
 * --json`, which cospec's own `--json` document carries as the binary wrote
 * them (design D3).
 */
export interface RelationshipReport {
  root: { path?: string; source?: string; healthy?: boolean; status: OpenspecStatusEntry[] } | null
  store: { id?: string; status: OpenspecStatusEntry[] } | null
  references: { store_id?: string; status: OpenspecStatusEntry[] }[]
  status: OpenspecStatusEntry[]
}

/** The binary's codes for "no OpenSpec root here" (`core/root-selection.js`). */
const NO_ROOT_CODES: ReadonlySet<string> = new Set([
  'no_openspec_root',
  'no_root_with_registered_stores',
])

/** Root sources whose resolved base, not the invocation directory, is what doctor checks. */
const RESOLVED_BASE: ReadonlySet<ResolvedRoot['source']> = new Set([
  'nearest',
  'store',
  'declared',
  'global_default',
])

/** The binary's own failure payload shape, carried when its report could not be read. */
const NO_REPORT: RelationshipReport = { root: null, store: null, references: [], status: [] }

/** One entry of `openspec store doctor --json`'s `stores[]`. */
interface OpenspecStoreDoctorEntry {
  id: string
  git?: {
    is_repository?: boolean
    has_commits?: boolean
    has_uncommitted_changes?: boolean
    has_remote?: boolean
    origin_url?: string | null
  }
  status?: OpenspecStatusEntry[]
}

/**
 * `status` with the binary's remedies spelled through cospec (design D4): each
 * diagnostic's `fix`, and on a failed answer its `message` too — each field
 * passed alone to the allowlist, so a path or an id is the binary's byte for
 * byte and no key is added.
 */
function spellStatus(status: OpenspecStatusEntry[], failed: boolean): OpenspecStatusEntry[] {
  return status.map((entry) => ({
    ...entry,
    ...(failed ? { message: respellRemedies(entry.message) } : {}),
    ...(entry.fix === undefined ? {} : { fix: respellRemedies(entry.fix) }),
  }))
}

/** The binary's four keys with every diagnostic list spelled through cospec. */
function spellReport(keys: RelationshipReport, failed: boolean): RelationshipReport {
  return {
    root:
      keys.root === null ? null : { ...keys.root, status: spellStatus(keys.root.status, failed) },
    store:
      keys.store === null
        ? null
        : { ...keys.store, status: spellStatus(keys.store.status, failed) },
    references: keys.references.map((ref) => ({
      ...ref,
      status: spellStatus(ref.status, failed),
    })),
    status: spellStatus(keys.status, failed),
  }
}

/** The binary's doctor document carries its four keys. */
const doctorReportPostCondition: PostCondition = (result) => {
  let doc: unknown
  try {
    doc = JSON.parse(result.stdout)
  } catch (err) {
    if (err instanceof SyntaxError) return 'did not emit parseable JSON'
    throw err
  }
  const keys = doc as Partial<RelationshipReport> | null
  return (
    (keys !== null &&
      'root' in keys &&
      'store' in keys &&
      Array.isArray(keys.references) &&
      Array.isArray(keys.status)) ||
    'did not emit the root, store, references and status keys'
  )
}

/**
 * The wrapped call's stderr as findings: each non-blank line — OpenSpec's
 * config warnings (`Invalid 'context' field in config (must be string)`, …) —
 * one WARNING, passed alone to the remedies allowlist, so `--json` carries it
 * and the text report prints it. `passthroughOpenspec` has already dropped the
 * lines cospec printed itself.
 */
export function foldWrappedStderr(stderr: string, findings: Finding[]): void {
  for (const line of stderr.split(/\r?\n/u)) {
    if (line.trim() === '') continue
    findings.push({ level: 'WARNING', check: 'openspec-stderr', message: respellRemedies(line) })
  }
}

/**
 * Delegate `openspec doctor --json` (root-relationship + reference health) on
 * every root and, for a store-backed root, `openspec store doctor --json`
 * (store metadata + git facts) — folding both into cospec's findings and
 * returning the binary's four keys for cospec's `--json` document. Never
 * repairs anything; a failure to reach openspec surfaces as a WARNING, not a
 * thrown error, since this is an additive health section, not a gate.
 */
export async function checkOpenspecRelationship(
  root: Root,
  cwd: string,
  findings: Finding[],
  initialized: boolean,
): Promise<RelationshipReport> {
  const storeBacked = root.store !== undefined
  let delegated = NO_REPORT

  try {
    const result = await passthroughOpenspec(
      { command: ['doctor'], threaded: ['--json', ...root.storeArgs] },
      {
        cwd: root.cwd,
        expect: { exitCodes: [0, 1], postCondition: doctorReportPostCondition },
      },
    )
    foldWrappedStderr(result.stderr, findings)
    const parsed = JSON.parse(result.stdout) as RelationshipReport
    delegated = spellReport(
      {
        root: parsed.root,
        store: parsed.store,
        references: parsed.references,
        status: parsed.status,
      },
      result.exitCode !== 0,
    )
    foldStatus('root', delegated.root?.status, findings)
    foldStatus('store', delegated.store?.status, findings)
    for (const ref of delegated.references)
      foldStatus(`reference-${ref.store_id ?? 'unknown'}`, ref.status, findings)
    // With no root, cospec's own `initialized` ERROR already reports it: the
    // binary's no-root diagnostic stays in `status`, not a second finding.
    foldStatus(
      'relationship',
      initialized ? delegated.status : delegated.status.filter((s) => !NO_ROOT_CODES.has(s.code)),
      findings,
    )
    // Only where the relationship is the point: a store root or one that
    // declares `references:`, so a healthy plain root's report is unchanged.
    if (delegated.root !== null && (storeBacked || hasReferencesConfig(cwd))) {
      findings.push({
        level: 'INFO',
        check: 'openspec-root',
        message: `operating root is ${delegated.root.source ?? 'unknown'}-sourced at ${
          delegated.root.path ?? root.base
        } (${delegated.root.healthy === true ? 'healthy' : 'unhealthy'} per OpenSpec's doctor)`,
      })
    }
  } catch (err) {
    findings.push({
      level: 'WARNING',
      check: 'openspec-doctor',
      message: `could not read OpenSpec's root-relationship health: ${errorMessage(err)}`,
      remedy:
        err instanceof OpenspecCallError
          ? undefined
          : "rerun `cospec doctor --json` to see OpenSpec's root, store and reference report",
    })
  }

  if (!storeBacked) return delegated
  try {
    const result = await passthroughOpenspec(
      { command: ['store', 'doctor'], threaded: ['--json'], args: [root.store!] },
      { cwd: root.cwd, expect: { exitCodes: [0, 1] } },
    )
    const parsed = JSON.parse(result.stdout) as { stores?: OpenspecStoreDoctorEntry[] }
    const entry = parsed.stores?.find((s) => s.id === root.store)
    if (entry !== undefined) {
      foldStatus(
        `store-${entry.id}`,
        entry.status === undefined ? undefined : spellStatus(entry.status, result.exitCode !== 0),
        findings,
      )
      if (entry.git !== undefined) {
        const git = entry.git
        findings.push({
          level: 'INFO',
          check: 'store-git',
          message:
            `store '${entry.id}' git: ${git.is_repository === true ? 'repository' : 'no repository'}` +
            `${git.has_uncommitted_changes === true ? ', uncommitted changes' : ''}` +
            `${git.has_remote === true ? ` (remote ${git.origin_url ?? '?'})` : ', no remote'}`,
        })
      }
    }
  } catch (err) {
    findings.push({
      level: 'WARNING',
      check: 'store-doctor',
      message: `could not read store doctor facts for '${root.store}': ${errorMessage(err)}`,
    })
  }
  return delegated
}

/**
 * INFO-level note when openspec's machine-global config (`~/.config/openspec/
 * config.json`) carries a `profile`/`workflows` block — the instruction-
 * generation model cospec's canon + harness supersede. Never a WARNING/ERROR:
 * it is inert under cospec, not a defect.
 */
function checkGlobalProfile(findings: Finding[]): void {
  const configPath = join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
    'openspec',
    'config.json',
  )
  if (!existsSync(configPath)) return
  let doc: unknown
  try {
    doc = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    return
  }
  if (doc === null || typeof doc !== 'object') return
  const record = doc as Record<string, unknown>
  const hasProfile = typeof record.profile === 'string' && record.profile.length > 0
  const hasWorkflows = Array.isArray(record.workflows) && record.workflows.length > 0
  if (!hasProfile && !hasWorkflows) return
  const blocks = [hasProfile ? 'profile' : undefined, hasWorkflows ? 'workflows' : undefined]
    .filter((b): b is string => b !== undefined)
    .join('/')
  findings.push({
    level: 'INFO',
    check: 'openspec-global-profile',
    message: `openspec's global config.json carries a ${blocks} block (superseded by cospec's canon-managed schemas/harness)`,
    remedy: 'no action needed — cospec ignores openspec instruction-generation config',
  })
}

// --- command entrypoint -----------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const { cwd, flags } = ctx
  const findings: Finding[] = []
  // Resolved up front (not gated on the local `initialized` check below):
  // both the relationship section (WI-8) and cospec's own checks target the
  // OPERATING ROOT, so `cospec doctor --store <id>` checks the store even from
  // a bare workspace with no `openspec/` of its own.
  const selection = await selectRoot(ctx)
  const selected = selection instanceof RootSelectionError ? undefined : selection
  const root: Root = selected ?? {
    base: cwd,
    cwd,
    storeArgs: flags.store === undefined ? [] : ['--store', flags.store],
  }
  // The local checks read the resolved root: the enclosing root the walk
  // found from a subdirectory, and the store an explicit `--store`, a declared
  // `store:` pointer or the global `defaultStore` selects. The invocation cwd
  // stays the base only for an implicit root, or none selected.
  const base = selected !== undefined && RESOLVED_BASE.has(selected.source) ? selected.base : cwd

  // With no root selected there is nothing for cospec's own checks to read
  // (the directory may not even be readable); a selection that failed for any
  // reason but "no root here" is reported by the binary's folded diagnostic.
  const initialized = selected !== undefined && existsSync(openspecDir(base))
  const failedOtherwise =
    selection instanceof RootSelectionError && !NO_ROOT_CODES.has(selection.diagnostic.code)
  if (!initialized && !failedOtherwise) {
    findings.push({
      level: 'ERROR',
      check: 'initialized',
      message: `no openspec/ directory at ${cwd}`,
      remedy: 'run `cospec init` to scaffold cospec',
    })
  } else if (initialized) {
    checkOpenspecVersion(findings)
    checkLegacyLayout(checkDrift(base, findings), findings)
    const mdFiles = harnessMarkdownFiles(base)
    checkStaleness(mdFiles, findings)
    checkDanglingRefs(base, mdFiles, findings)
    checkConfig(base, findings)
    checkOpsx(base, findings)
    checkStaleSidecars(base, findings)
    checkChangeSchemas(base, findings)
    checkSchemaVersions(base, findings)
    checkGateHooks(base, findings)
    checkGlobalProfile(findings)
  }

  const relationship = await checkOpenspecRelationship(root, base, findings, initialized)

  return report(findings, flags.json, relationship)
}

/**
 * The operating root, or the selection's failure: doctor reports on every
 * root, and the binary's own `doctor --json` answers a failed selection in its
 * report (`root: null` and the selection's diagnostic in `status`), which
 * doctor folds beside its own `initialized` check (design D3). A `--cwd` that
 * does not exist is cospec's own refusal and stands.
 */
async function selectRoot(ctx: CommandContext): Promise<ResolvedRoot | RootSelectionError> {
  try {
    return await resolveRoot(ctx)
  } catch (error) {
    if (!(error instanceof RootSelectionError) || error.diagnostic.code === 'directory_not_found')
      throw error
    return error
  }
}

function report(findings: Finding[], json: boolean, relationship: RelationshipReport): number {
  const errors = findings.filter((f) => f.level === 'ERROR').length
  const warnings = findings.filter((f) => f.level === 'WARNING').length
  const infos = findings.filter((f) => f.level === 'INFO').length

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        { version: 1, findings, summary: { errors, warnings, infos }, ...relationship },
        null,
        2,
      )}\n`,
    )
    return errors > 0 ? 1 : 0
  }

  const lines: string[] = ['cospec doctor', '']
  if (findings.length === 0) {
    lines.push('All checks passed.')
  } else {
    const width = Math.max(...findings.map((f) => f.level.length))
    for (const f of findings) {
      lines.push(`  ${f.level.padEnd(width)}  ${f.check}: ${f.message}`)
      if (f.remedy !== undefined) lines.push(`  ${' '.repeat(width)}  → ${f.remedy}`)
    }
    lines.push('')
    lines.push(`${errors} error(s), ${warnings} warning(s), ${infos} info`)
  }
  process.stdout.write(`${lines.join('\n')}\n`)
  return errors > 0 ? 1 : 0
}
