// `cospec doctor` (DESIGN §2.3). Read-only diagnosis of a cospec setup; exits 1
// on any ERROR finding. Every finding carries a one-line remedy. Checks: the
// wrapped openspec resolves at the expected version; the manifest is present and
// schemas/harness files are not drifted (reuses the update engine's dry run);
// harness files are not stale/mixed-version; slash/skill references in generated
// bodies all resolve (the structural guard against openspec's dangling-ref
// failure class); config.yaml (else config.yml) parses with a known schema and
// its `rules:` keys are artifact ids of a schema the binary resolves; no leftover opsx files
// or stale .cospec-new sidecars; changes sit on known schemas; the git hooks
// are installed when the gate was scaffolded; and, on every root, a delegated
// `openspec doctor --json` (and, for a store root, `openspec store doctor
// --json`) folds openspec's own root-relationship/reference/store-health
// diagnostics in (read-only, never repair — WI-8), its `root`, `store`,
// `references` and `status` keys carried in cospec's `--json` document and
// each line of its stderr (config warnings) a WARNING finding.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

import type { CommandContext } from '../cli.ts'
import {
  COSPEC_TYPES,
  isCospecType,
  listChanges,
  openspecDir,
  parseVerificationLayers,
  resolveSchema,
} from '../core/change.ts'
import { readGlobalProfile } from '../core/global-profile.ts'
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
  adapterFor,
  commandPath,
  HARNESS_TABLE,
  type HarnessAdapter,
  isHarnessDocument,
  legacySkillsRoots,
  primaryRoot,
  scanRoots,
  skillPath,
  skillsRoot,
  workflowReferencePattern,
} from '../harness/adapters.ts'
import { homeSkillsDir } from '../harness/home-root.ts'
import { findLegacyConfigBlocks } from '../harness/legacy-config-blocks.ts'
import { residualWorkflowMarker } from '../harness/optional-workflow.ts'
import { readWorkflowManifest } from '../harness/render.ts'
import { walkProjectFiles } from '../harness/scan-walk.ts'
import { profileWorkflows } from '../harness/workflow-set.ts'
import { homeSkillLeftovers, leftoverScanFiles, opsxLeftoverFiles } from './init.ts'
import { detectHarnesses, generate, installedWorkflowIds } from './update.ts'

type Level = 'ERROR' | 'WARNING' | 'INFO'

export interface Finding {
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
  const { results, failed, migration } = generate(cwd, { harnesses, dryRun: true })
  // A dry run writes nothing, so what fails here is a managed file cospec cannot read.
  for (const f of failed) {
    findings.push({
      level: 'ERROR',
      check: 'unreadable-file',
      message: `${f.path} cannot be checked against canon (${f.error})`,
      remedy: 'fix the permissions on the file or its directory, then re-run `cospec doctor`',
    })
  }
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

/**
 * The files cospec writes under the scan roots, which doctor's stale-harness,
 * mixed-versions and dangling-ref checks read (`isHarnessDocument`). The walk descends
 * every scan root through the shared bounded walk (`walkProjectFiles`: never into a
 * nested worktree, never out of the project); only acceptance is narrowed. `table` is a
 * test seam for rows the shipped table does not carry.
 */
export function harnessMarkdownFiles(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): { relpath: string; text: string }[] {
  const out: { relpath: string; text: string }[] = []
  walkProjectFiles(cwd, scanRoots(table), (relpath) => {
    if (isHarnessDocument(relpath, table)) {
      out.push({ relpath, text: readFileSync(join(cwd, relpath), 'utf8') })
    }
  })
  return out
}

export function checkStaleness(
  files: { relpath: string; text: string }[],
  findings: Finding[],
): void {
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

/**
 * The row that owns a harness file: the one with a surface (project or legacy
 * skills root, commands dir, rules dir) that is the longest prefix of it, so a
 * row whose commands dir sits under another row's primary root still owns its
 * commands. A surface two rows share goes to the row whose primary root also
 * prefixes the file, then to the earlier row. A file on no surface goes to the
 * first row whose primary root prefixes it.
 */
function owningRow(relpath: string, table: readonly HarnessAdapter[]): HarnessAdapter | undefined {
  const under = (dir: string): boolean => relpath.startsWith(`${dir}/`)
  const underPrimary = (r: HarnessAdapter): boolean => {
    const root = primaryRoot(r)
    return root !== undefined && under(root)
  }
  let best: { row: HarnessAdapter; length: number; primary: boolean } | undefined
  for (const r of table) {
    const dirs = legacySkillsRoots(r)
    const skills = skillsRoot(r)
    if (skills.scope === 'project') dirs.push(skills.root)
    if (r.commands !== undefined) dirs.push(r.commands.dir)
    if (r.rulesPath !== undefined) dirs.push(dirname(r.rulesPath))
    const length = Math.max(-1, ...dirs.filter(under).map((d) => d.length))
    if (length < 0) continue
    const primary = underPrimary(r)
    if (
      best === undefined ||
      length > best.length ||
      (length === best.length && primary && !best.primary)
    ) {
      best = { row: r, length, primary }
    }
  }
  return best?.row ?? table.find(underPrimary)
}

export function checkDanglingRefs(
  cwd: string,
  files: { relpath: string; text: string }[],
  findings: Finding[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): void {
  for (const f of files) {
    // A marker still standing means the file skipped optional-workflow resolution, so it may
    // name a workflow the install does not have; `update` rewrites it from canon.
    const marker = residualWorkflowMarker(f.text)
    if (marker !== undefined) {
      findings.push({
        level: 'ERROR',
        check: 'dangling-ref',
        message: `${f.relpath} carries an unresolved optional-workflow marker ${marker}`,
        remedy: 'run `cospec update` to regenerate from canon',
      })
    }
    const row = owningRow(f.relpath, table)
    if (row === undefined) continue
    const harness = row.id
    const { body } = splitFrontmatter(f.text)
    const refs = new Set<string>()
    for (const m of body.matchAll(workflowReferencePattern(row))) refs.add(m[1]!)
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
      const skillExists = existsSync(join(cwd, skillPath(row, skill)))
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

async function checkConfig(root: Root, cwd: string, findings: Finding[]): Promise<void> {
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
  await checkRuleKeys(root, rel, doc, findings)
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
  // Gates read `verification.layers` leniently (a malformed one adds no layer), so a
  // typo would otherwise fail closed as `verification/layer-unknown` with no clue why.
  const { problems } = parseVerificationLayers(doc)
  if (problems.length > 0) {
    findings.push({
      level: 'WARNING',
      check: 'config',
      message: `${rel} verification.layers is malformed and adds no layer: ${problems.join(', ')}`,
      remedy:
        'declare it as a list of layer names, for example `verification:` then `layers: [uat]`; each name is one token without spaces',
    })
  }
}

/** Levenshtein distance, case-insensitive: the closest-id hint on a mistyped rule key. */
function editDistance(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const row = [i]
    for (let j = 1; j <= y.length; j++) {
      row.push(
        Math.min(
          (prev[j] ?? 0) + 1,
          (row[j - 1] ?? 0) + 1,
          (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1),
        ),
      )
    }
    prev = row
  }
  return prev[y.length] ?? 0
}

/**
 * The artifact ids of every schema the wrapped binary can resolve, read from
 * its own `schemas --json` listing: project schemas, user-global schemas under
 * `$XDG_DATA_HOME/openspec/schemas`, and the package schema, with invalid
 * schemas dropped and a shadowed one hidden — the exact set its instruction
 * generator checks `rules:` keys against. Rejects when the listing cannot be
 * obtained, so the set is never guessed.
 */
async function resolvableArtifactIds(root: Root): Promise<Set<string>> {
  const result = await passthroughOpenspec(
    { command: ['schemas'], threaded: ['--json', ...root.storeArgs] },
    { cwd: root.cwd, expect: { exitCodes: [0, 1] } },
  )
  if (result.exitCode !== 0) throw new Error(`exited ${result.exitCode}`)
  const listing: unknown = JSON.parse(result.stdout)
  if (!Array.isArray(listing)) throw new Error('did not list schemas as an array')
  const ids = new Set<string>()
  for (const entry of listing) {
    const artifacts =
      entry !== null && typeof entry === 'object'
        ? (entry as Record<string, unknown>).artifacts
        : undefined
    if (!Array.isArray(artifacts)) throw new Error('listed a schema without an artifacts array')
    for (const id of artifacts) if (typeof id === 'string') ids.add(id)
  }
  return ids
}

/**
 * A `rules:` key that is no artifact id in any available schema silently drops
 * its rule list: the wrapped binary only notices while generating instructions,
 * as one stderr line, which doctor's delegated call never reaches. Known ids
 * come from the binary's own schema listing (`resolvableArtifactIds`), so a
 * user-global or forked schema's ids are valid and an invalid or shadowed
 * schema's are not, exactly as the binary decides; when the listing cannot be
 * read the set is unknown, so that is reported instead of guessing.
 */
async function checkRuleKeys(
  root: Root,
  rel: string,
  doc: unknown,
  findings: Finding[],
): Promise<void> {
  const rules =
    doc !== null && typeof doc === 'object' ? (doc as Record<string, unknown>).rules : undefined
  if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) return
  const keys = Object.keys(rules)
  if (keys.length === 0) return
  let ids: Set<string>
  try {
    ids = await resolvableArtifactIds(root)
  } catch (error) {
    findings.push({
      level: 'WARNING',
      check: 'config',
      message: `cannot check ${rel} rules keys against artifact ids: ${errorMessage(error)}`,
      remedy: "run `cospec schemas` to see OpenSpec's schema listing, then re-run `cospec doctor`",
    })
    return
  }
  const known = [...ids].sort()
  for (const key of keys) {
    if (ids.has(key)) continue
    const near = known
      .map((id) => ({ id, d: editDistance(key, id) }))
      .filter((c) => c.d <= 2)
      .sort((a, b) => a.d - b.d)[0]
    findings.push({
      level: 'WARNING',
      check: 'config',
      message:
        `${rel}: rules.${key} is not an artifact id (known: ${known.join(', ')}); ` +
        `its rules are ignored${near === undefined ? '' : ` — did you mean '${near.id}'?`}`,
      remedy: 'rename the key to an artifact id; its rules are currently ignored',
    })
  }
}

export function checkOpsx(
  cwd: string,
  findings: Finding[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): void {
  // A home-scoped row's skills dir sits outside the project; it is read here, never written.
  const homeIds = table.filter((row) => homeSkillsDir(row) !== undefined).map((row) => row.id)
  for (const h of homeSkillLeftovers(homeIds)) {
    findings.push({
      level: 'WARNING',
      check: 'opsx-leftover',
      message: `leftover openspec (opsx) file: ${h.path} — two propose commands confuse agents`,
      remedy: 'run `cospec init --remove-opsx` to delete provably openspec-generated files',
    })
  }
  // Provenance-only, the one predicate init's removal uses (DESIGN §2.1/§6.6): flag a file
  // only when its own content proves openspec wrote it. Path/name conventions alone are not
  // provenance — never warn on user-authored files.
  for (const f of opsxLeftoverFiles(leftoverScanFiles(cwd, table), table)) {
    findings.push({
      level: 'WARNING',
      check: 'opsx-leftover',
      message: `leftover openspec (opsx) file: ${f.relpath} — two propose commands confuse agents`,
      remedy: 'run `cospec init --remove-opsx` to delete provably openspec-generated files',
    })
  }
  // The block OpenSpec's earlier versions wrote into a root config file: the same consent
  // removes it, and the file is kept. One whose markers share a line with other text is
  // reported but not removable, so its remedy is the hand edit.
  for (const block of findLegacyConfigBlocks(cwd)) {
    const removable = block.stripped !== block.text
    findings.push({
      level: 'WARNING',
      check: 'opsx-leftover',
      message: `leftover openspec marker block in ${block.relpath}`,
      remedy: removable
        ? 'run `cospec init --remove-opsx` to strip the block (the file is kept)'
        : 'remove the OpenSpec markers by hand; they share a line with other text, so no command edits them',
    })
  }
}

function checkStaleSidecars(cwd: string, findings: Finding[]): void {
  const found = new Set<string>()
  walkProjectFiles(
    cwd,
    ['openspec', ...scanRoots()],
    (relpath) => {
      if (relpath.endsWith('.cospec-new')) found.add(relpath)
    },
    (name) => name === 'archive',
  )
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
 * INFO findings for the profile and delivery the user set in OpenSpec's machine-global config
 * (`profile`, `workflows` and `delivery`, which `init` and `update` honour), and for every
 * installed workflow a selected harness holds outside that profile: `update` never removes
 * one, so it stays until the user deletes its files. Nothing is reported when no profile or
 * delivery is set; a `workflows` list with no profile is not a choice (the profile defaults to
 * core, which ignores it). Never a WARNING: an installed workflow outside the profile is the
 * policy working, not a defect.
 */
export async function checkGlobalProfile(cwd: string, findings: Finding[]): Promise<void> {
  const global = await readGlobalProfile(cwd)
  if (global.profile === undefined && global.delivery === undefined) return
  const manifest = readWorkflowManifest()
  const set =
    global.profile === undefined
      ? undefined
      : profileWorkflows(global.profile, global.workflows, manifest)
  const parts: string[] = []
  if (global.profile !== undefined && set !== undefined) {
    parts.push(`profile ${global.profile} (${set.length === 0 ? 'no workflows' : set.join(', ')})`)
  }
  if (global.delivery !== undefined) parts.push(`delivery ${global.delivery}`)
  findings.push({
    level: 'INFO',
    check: 'openspec-global-profile',
    message: `the global config sets ${parts.join('; ')}`,
    remedy: 'run `cospec config profile` to change the profile',
  })
  if (set === undefined) return
  const inProfile = new Set(set)
  const tracked = readManifest(cwd)?.files ?? {}
  for (const id of detectHarnesses(cwd)) {
    const outside = manifest.workflows
      .map((w) => w.id)
      .filter((w) => !inProfile.has(w) && installedWorkflowIds(cwd, adapterFor(id), tracked).has(w))
    if (outside.length === 0) continue
    findings.push({
      level: 'INFO',
      check: 'openspec-global-profile',
      message: `${id} has ${outside.length} installed workflow(s) outside the profile: ${outside.join(', ')}`,
      remedy:
        '`cospec update` never removes an installed workflow; delete its skill and command files by hand to drop one, or add it to the profile with `cospec config profile`',
    })
  }
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
    await checkConfig(root, base, findings)
    checkOpsx(base, findings)
    checkStaleSidecars(base, findings)
    checkChangeSchemas(base, findings)
    checkSchemaVersions(base, findings)
    checkGateHooks(base, findings)
    await checkGlobalProfile(base, findings)
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
