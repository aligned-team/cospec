// `cospec doctor` (DESIGN §2.3). Read-only diagnosis of a cospec setup; exits 1
// on any ERROR finding. Every finding carries a one-line remedy. Checks: the
// wrapped openspec resolves at the expected version; the manifest is present and
// schemas/harness files are not drifted (reuses the update engine's dry run);
// harness files are not stale/mixed-version; slash/skill references in generated
// bodies all resolve (the structural guard against openspec's dangling-ref
// failure class); config.yaml parses with a known schema; no leftover opsx files
// or stale .cospec-new sidecars; changes sit on known schemas; the git hooks
// are installed when the gate was scaffolded; and, when the operating root is
// store-backed or declares `references:`, a delegated `openspec doctor --json`
// (and, for a store root, `openspec store doctor --json`) folds openspec's own
// root-relationship/reference/store-health diagnostics in (read-only, never
// repair — WI-8).

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
  resolveOpenspec,
  satisfiesOpenspecRange,
  type Root,
} from '../core/openspec.ts'
import { resolveRoot } from '../core/root.ts'
import { HARNESS_NAMES } from '../harness/render.ts'
import { OPSX_SHARED_SKILL_ROOT } from './init.ts'
import { detectHarnesses, generate } from './update.ts'

type Level = 'ERROR' | 'WARNING' | 'INFO'

interface Finding {
  level: Level
  check: string
  message: string
  remedy?: string
}

/** Workflow id → skill dir name (mirrors canon/workflows/harness.yaml). */
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

const SKILL_BASE: Record<string, string> = {
  claude: '.claude/skills',
  codex: '.agents/skills',
  agents: '.agents/skills',
  opencode: '.opencode/skills',
}

const COMMAND_LOC: Record<string, { dir: string; file: (id: string) => string } | undefined> = {
  claude: { dir: '.claude/commands/cospec', file: (id) => `${id}.md` },
  opencode: { dir: '.opencode/commands', file: (id) => `cospec-${id}.md` },
  codex: undefined,
  agents: undefined,
}

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
  for (const h of HARNESS_NAMES) walk(`.${h}`)
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
    const harness = HARNESS_NAMES.find((h) => f.relpath.startsWith(`.${h}/`))
    if (harness === undefined) continue
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
      const skillExists = existsSync(join(cwd, SKILL_BASE[harness]!, skill, 'SKILL.md'))
      const cmdLoc = COMMAND_LOC[harness]
      const cmdExists = cmdLoc !== undefined && existsSync(join(cwd, cmdLoc.dir, cmdLoc.file(id)))
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

function checkConfig(cwd: string, findings: Finding[]): void {
  const path = join(openspecDir(cwd), 'config.yaml')
  if (!existsSync(path)) return
  let doc: unknown
  try {
    doc = parseYaml(readFileSync(path, 'utf8'))
  } catch {
    findings.push({
      level: 'ERROR',
      check: 'config',
      message: 'openspec/config.yaml does not parse as YAML',
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
      message: `openspec/config.yaml default schema is '${schema}' (not one of the 11 cospec types)`,
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
  for (const h of HARNESS_NAMES) walk(`.${h}`)
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

/** True when `openspec/config.yaml` declares a non-empty `references:` list. */
function hasReferencesConfig(cwd: string): boolean {
  const path = join(openspecDir(cwd), 'config.yaml')
  if (!existsSync(path)) return false
  try {
    const doc = parseYaml(readFileSync(path, 'utf8'))
    if (doc === null || typeof doc !== 'object') return false
    const refs = (doc as Record<string, unknown>).references
    return Array.isArray(refs) && refs.length > 0
  } catch {
    // checkConfig already reports unparseable YAML
    return false
  }
}

/** Shape of the `root`/`store`/`references[]` sections of `openspec doctor --json`. */
interface OpenspecDoctorJson {
  root: { path?: string; source?: string; healthy?: boolean; status?: OpenspecStatusEntry[] } | null
  store: { id?: string; status?: OpenspecStatusEntry[] } | null
  references: { store_id?: string; status?: OpenspecStatusEntry[] }[]
  status?: OpenspecStatusEntry[]
}

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
 * Delegate `openspec doctor --json` (root-relationship + reference health) and,
 * for a store-backed root, `openspec store doctor --json` (store metadata + git
 * facts) — folding both into cospec's findings. Never repairs anything; a
 * failure to reach openspec surfaces as a WARNING, not a thrown error, since
 * this is an additive health section, not a gate.
 */
async function checkOpenspecRelationship(
  root: Root,
  cwd: string,
  findings: Finding[],
): Promise<void> {
  const storeBacked = root.store !== undefined
  if (!storeBacked && !hasReferencesConfig(cwd)) return

  try {
    const result = await passthroughOpenspec(['doctor', '--json', ...root.storeArgs], {
      cwd: root.cwd,
      expect: { exitCodes: [0, 1] },
    })
    const parsed = JSON.parse(result.stdout) as OpenspecDoctorJson
    foldStatus('root', parsed.root?.status, findings)
    foldStatus('store', parsed.store?.status, findings)
    for (const ref of parsed.references)
      foldStatus(`reference-${ref.store_id ?? 'unknown'}`, ref.status, findings)
    foldStatus('relationship', parsed.status, findings)
    if (parsed.root !== null) {
      findings.push({
        level: 'INFO',
        check: 'openspec-root',
        message: `operating root is ${parsed.root?.source ?? 'unknown'}-sourced at ${
          parsed.root?.path ?? root.base
        } (${parsed.root?.healthy === true ? 'healthy' : 'unhealthy'} per openspec doctor)`,
      })
    }
  } catch (err) {
    findings.push({
      level: 'WARNING',
      check: 'openspec-doctor',
      message: `could not read openspec root-relationship health: ${errorMessage(err)}`,
      remedy:
        err instanceof OpenspecCallError ? undefined : 'run `openspec doctor` directly to inspect',
    })
  }

  if (!storeBacked) return
  try {
    const result = await passthroughOpenspec(['store', 'doctor', root.store!, '--json'], {
      cwd: root.cwd,
      expect: { exitCodes: [0, 1] },
    })
    const parsed = JSON.parse(result.stdout) as { stores?: OpenspecStoreDoctorEntry[] }
    const entry = parsed.stores?.find((s) => s.id === root.store)
    if (entry !== undefined) {
      foldStatus(`store-${entry.id}`, entry.status, findings)
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
  // Resolved up front (not gated on the local `initialized` check below): the
  // cross-repo relationship section (WI-8) targets the OPERATING ROOT, which
  // for an explicit `--store` invocation is deliberately allowed to be a plain
  // workspace with no `openspec/` of its own — that split is the point of
  // `cospec doctor --store <id>` run from a bare checkout.
  const root = await resolveRoot(ctx)

  if (!existsSync(openspecDir(cwd))) {
    findings.push({
      level: 'ERROR',
      check: 'initialized',
      message: `no openspec/ directory at ${cwd}`,
      remedy: 'run `cospec init` to scaffold cospec',
    })
  } else {
    checkOpenspecVersion(findings)
    checkLegacyLayout(checkDrift(cwd, findings), findings)
    const mdFiles = harnessMarkdownFiles(cwd)
    checkStaleness(mdFiles, findings)
    checkDanglingRefs(cwd, mdFiles, findings)
    checkConfig(cwd, findings)
    checkOpsx(cwd, findings)
    checkStaleSidecars(cwd, findings)
    checkChangeSchemas(cwd, findings)
    checkSchemaVersions(cwd, findings)
    checkGateHooks(cwd, findings)
    checkGlobalProfile(findings)
  }

  await checkOpenspecRelationship(root, cwd, findings)

  return report(findings, flags.json)
}

function report(findings: Finding[], json: boolean): number {
  const errors = findings.filter((f) => f.level === 'ERROR').length
  const warnings = findings.filter((f) => f.level === 'WARNING').length
  const infos = findings.filter((f) => f.level === 'INFO').length

  if (json) {
    process.stdout.write(
      `${JSON.stringify(
        { version: 1, findings, summary: { errors, warnings, infos } },
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
