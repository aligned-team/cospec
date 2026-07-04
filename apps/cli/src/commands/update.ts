// `cospec update` (DESIGN §2.2) plus the shared managed-file generation engine
// (§6.5) that `init` reuses. `update` re-composes every managed file — the 11
// schemas from canon and the harness files for every harness dir that already
// contains cospec-generated files (detection is by a `cospec-*` skill with
// `author: cospec` frontmatter; no config file). `--check` writes nothing and
// exits 1 on any drift (this is `generate:check` for the self-repo). `--force`
// clobbers user-modified managed files. `openspec/config.yaml`, changes, and
// specs are never touched.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import {
  computeContentHash,
  CURRENT_GENERATED_BY,
  type Manifest,
  MANAGED_AUTHOR,
  manifestPath,
  readManifest,
  resolveContainedPath,
  splitFrontmatter,
  type WriteResult,
  writeManifest,
} from '../core/managed-files.ts'
import { composeAllTypes, TYPE_TABLE } from '../core/schema-compose.ts'
import { type HarnessName, HARNESS_NAMES, renderHarnessFiles } from '../harness/render.ts'

// --- harness detection -----------------------------------------------------

/** Skill base dir per harness (mirrors canon/workflows/harness.yaml). */
const SKILL_BASE: Record<HarnessName, string> = {
  claude: '.claude/skills',
  codex: '.codex/skills',
  opencode: '.opencode/skills',
}

/** The sentinel skill every harness always emits — used for presence detection. */
const SENTINEL_SKILL = 'cospec-propose'

/**
 * Directories cospec owns and is therefore allowed to delete manifest-tracked
 * files from: the `openspec/` tree (schemas + templates) and each harness's
 * top-level dir (e.g. `.claude`, `.codex`, `.opencode` — the codex rules file
 * lives under one of these). Manifest keys are untrusted (see
 * `resolveContainedPath`); any key that does not resolve inside one of these is
 * ignored rather than joined onto cwd and deleted.
 */
const MANAGED_REMOVAL_ROOTS: readonly string[] = [
  'openspec',
  ...new Set(Object.values(SKILL_BASE).map((base) => base.split('/')[0]!)),
]

function isCospecManagedMarkdown(text: string): boolean {
  const meta = readManagedMeta(text)
  return meta?.author === MANAGED_AUTHOR && typeof meta.contentHash === 'string'
}

interface ManagedMeta {
  author?: string
  generatedBy?: string
  contentHash?: string
}

function readManagedMeta(text: string): ManagedMeta | undefined {
  const { frontmatter } = splitFrontmatter(text)
  const meta = frontmatter?.metadata
  if (meta === null || typeof meta !== 'object') return undefined
  const record = meta as Record<string, unknown>
  return {
    author: typeof record.author === 'string' ? record.author : undefined,
    generatedBy: typeof record.generatedBy === 'string' ? record.generatedBy : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
  }
}

/** Harnesses whose skill dir already holds a cospec-generated sentinel skill. */
export function detectHarnesses(cwd: string): HarnessName[] {
  return HARNESS_NAMES.filter((h) => {
    const path = join(cwd, SKILL_BASE[h], SENTINEL_SKILL, 'SKILL.md')
    if (!existsSync(path)) return false
    return isCospecManagedMarkdown(readFileSync(path, 'utf8'))
  })
}

// --- atomic write ----------------------------------------------------------

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.cospec-tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content)
  renameSync(tmp, path)
}

// --- managed writes (dry-run aware) ----------------------------------------

interface WriteOpts {
  dryRun: boolean
  force: boolean
}

/** Managed write for a frontmatter-less file (schema.yaml, template, codex rules). */
function writeFrontmatterless(
  abspath: string,
  relpath: string,
  content: string,
  priorHash: string | undefined,
  opts: WriteOpts,
): WriteResult {
  const sidecar = `${relpath}.cospec-new`
  if (!existsSync(abspath)) {
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'created' }
  }
  const existing = readFileSync(abspath, 'utf8')
  if (priorHash === undefined) {
    if (!opts.dryRun) atomicWrite(`${abspath}.cospec-new`, content)
    return { path: relpath, outcome: 'preserved-foreign', sidecar }
  }
  if (computeContentHash(existing) === priorHash) {
    if (existing === content) return { path: relpath, outcome: 'unchanged' }
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'updated' }
  }
  if (opts.force) {
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'forced' }
  }
  if (!opts.dryRun) atomicWrite(`${abspath}.cospec-new`, content)
  return { path: relpath, outcome: 'preserved-modified', sidecar }
}

/**
 * Managed write for a markdown-with-frontmatter file (skill/command). The file
 * is self-describing: its `metadata.contentHash` covers the body section, so a
 * user edit is detected without a manifest entry.
 */
function writeMarkdown(
  abspath: string,
  relpath: string,
  content: string,
  opts: WriteOpts,
): WriteResult {
  const sidecar = `${relpath}.cospec-new`
  if (!existsSync(abspath)) {
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'created' }
  }
  const existing = readFileSync(abspath, 'utf8')
  const meta = readManagedMeta(existing)
  if (meta?.author !== MANAGED_AUTHOR || meta.contentHash === undefined) {
    if (!opts.dryRun) atomicWrite(`${abspath}.cospec-new`, content)
    return { path: relpath, outcome: 'preserved-foreign', sidecar }
  }
  const { body } = splitFrontmatter(existing)
  if (computeContentHash(body) === meta.contentHash) {
    if (existing === content) return { path: relpath, outcome: 'unchanged' }
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'updated' }
  }
  if (opts.force) {
    if (!opts.dryRun) atomicWrite(abspath, content)
    return { path: relpath, outcome: 'forced' }
  }
  if (!opts.dryRun) atomicWrite(`${abspath}.cospec-new`, content)
  return { path: relpath, outcome: 'preserved-modified', sidecar }
}

/** Delete a managed frontmatter-less file if unmodified (else preserve + report). */
function removeFrontmatterless(
  abspath: string,
  relpath: string,
  priorHash: string | undefined,
  opts: WriteOpts,
): WriteResult | undefined {
  if (!existsSync(abspath)) return undefined
  const existing = readFileSync(abspath, 'utf8')
  if (opts.force || (priorHash !== undefined && computeContentHash(existing) === priorHash)) {
    if (!opts.dryRun) rmSync(abspath)
    return { path: relpath, outcome: 'removed' }
  }
  return { path: relpath, outcome: 'preserved-modified' }
}

/** Delete a managed markdown file if unmodified (else preserve + report). */
function removeMarkdown(
  abspath: string,
  relpath: string,
  opts: WriteOpts,
): WriteResult | undefined {
  if (!existsSync(abspath)) return undefined
  const existing = readFileSync(abspath, 'utf8')
  const meta = readManagedMeta(existing)
  if (meta?.author !== MANAGED_AUTHOR || meta.contentHash === undefined) return undefined
  const { body } = splitFrontmatter(existing)
  if (opts.force || computeContentHash(body) === meta.contentHash) {
    if (!opts.dryRun) rmSync(abspath)
    return { path: relpath, outcome: 'removed' }
  }
  return { path: relpath, outcome: 'preserved-modified' }
}

// --- the generation engine -------------------------------------------------

export interface GenerateOptions {
  harnesses: HarnessName[]
  force?: boolean
  /** `--check`: compute outcomes without writing anything. */
  dryRun?: boolean
  /** Override the generatedBy stamp (tests). Defaults to the current version. */
  version?: string
}

export interface GenerateResult {
  results: WriteResult[]
  /** The manifest that was (or would be) written. */
  manifest: Manifest
}

interface FlatFile {
  relpath: string
  abspath: string
  content: string
}

/**
 * Re-compose and write every managed file for the selected harnesses (DESIGN
 * §6.5). Schemas, templates, and the codex rules file are frontmatter-less and
 * tracked in `openspec/.cospec-manifest.json`; skill/command files are
 * self-describing markdown. Files the current version no longer emits are
 * removed when unmodified. Idempotent: a second call returns `unchanged` for
 * every file. `dryRun` computes outcomes without touching disk.
 */
export function generate(cwd: string, opts: GenerateOptions): GenerateResult {
  const writeOpts: WriteOpts = { dryRun: opts.dryRun ?? false, force: opts.force ?? false }
  const version = opts.version ?? CURRENT_GENERATED_BY
  const prev = readManifest(cwd)
  const prevFiles = prev?.files ?? {}

  const flat: FlatFile[] = []
  const md: { relpath: string; abspath: string; content: string }[] = []

  // Schemas + templates (frontmatter-less).
  for (const composed of composeAllTypes()) {
    const base = `openspec/schemas/${composed.type}`
    flat.push({
      relpath: `${base}/schema.yaml`,
      abspath: join(cwd, base, 'schema.yaml'),
      content: composed.schemaYaml,
    })
    for (const [name, body] of Object.entries(composed.templates)) {
      flat.push({
        relpath: `${base}/templates/${name}`,
        abspath: join(cwd, base, 'templates', name),
        content: body,
      })
    }
  }

  // Harness files.
  const rendered = renderHarnessFiles({ harnesses: opts.harnesses, typeTable: TYPE_TABLE, version })
  for (const file of rendered) {
    if (file.kind === 'rules') {
      flat.push({ relpath: file.path, abspath: join(cwd, file.path), content: file.content })
    } else {
      md.push({ relpath: file.path, abspath: join(cwd, file.path), content: file.content })
    }
  }

  const results: WriteResult[] = []
  const newManifest: Manifest = { cospecVersion: version, files: {} }

  for (const f of flat) {
    results.push(
      writeFrontmatterless(f.abspath, f.relpath, f.content, prevFiles[f.relpath], writeOpts),
    )
    newManifest.files[f.relpath] = computeContentHash(f.content)
  }
  const mdEmitted = new Set(md.map((f) => f.relpath))
  for (const f of md) results.push(writeMarkdown(f.abspath, f.relpath, f.content, writeOpts))

  // Removals: frontmatter-less files the previous manifest tracked that we no
  // longer emit; and orphaned cospec-managed markdown in the harness dirs.
  const flatEmitted = new Set(flat.map((f) => f.relpath))
  for (const relpath of Object.keys(prevFiles)) {
    if (flatEmitted.has(relpath)) continue
    // The manifest is committed and may be attacker-controlled; contain the key
    // to the dirs cospec owns before turning it into a delete target. A poisoned
    // key like `../victim.txt` resolves outside and is skipped entirely.
    const abspath = resolveContainedPath(cwd, relpath, MANAGED_REMOVAL_ROOTS)
    if (abspath === undefined) continue
    const removed = removeFrontmatterless(abspath, relpath, prevFiles[relpath], writeOpts)
    if (removed) results.push(removed)
  }
  for (const removed of removeOrphanMarkdown(cwd, rendered, mdEmitted, writeOpts)) {
    results.push(removed)
  }

  if (!writeOpts.dryRun) writeManifest(cwd, newManifest)
  return { results, manifest: newManifest }
}

/** Scan the emitted harnesses' skill/command dirs for cospec markdown we no longer emit. */
function removeOrphanMarkdown(
  cwd: string,
  rendered: ReturnType<typeof renderHarnessFiles>,
  emitted: Set<string>,
  opts: WriteOpts,
): WriteResult[] {
  const skillBases = new Set<string>()
  const commandDirs = new Set<string>()
  for (const f of rendered) {
    if (f.kind === 'skill') skillBases.add(dirname(dirname(f.path)))
    else if (f.kind === 'command') commandDirs.add(dirname(f.path))
  }
  const out: WriteResult[] = []
  for (const base of skillBases) {
    const abs = join(cwd, base)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const relpath = `${base}/${entry.name}/SKILL.md`
      if (emitted.has(relpath)) continue
      const removed = removeMarkdown(join(cwd, relpath), relpath, opts)
      if (removed) out.push(removed)
    }
  }
  for (const dir of commandDirs) {
    const abs = join(cwd, dir)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const relpath = `${dir}/${entry.name}`
      if (emitted.has(relpath)) continue
      const removed = removeMarkdown(join(cwd, relpath), relpath, opts)
      if (removed) out.push(removed)
    }
  }
  return out
}

// --- command entrypoint ----------------------------------------------------

/** Outcomes that represent drift (anything other than a byte no-op). */
const DRIFT_OUTCOMES = new Set<WriteResult['outcome']>([
  'created',
  'updated',
  'forced',
  'preserved-foreign',
  'preserved-modified',
  'removed',
])

export function run(ctx: CommandContext): number {
  const { cwd, flags } = ctx
  const check = ctx.args.includes('--check')
  const force = ctx.args.includes('--force')

  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec: no openspec/ directory at ${cwd} — run 'cospec init' first\n`)
    return 1
  }

  const harnesses = detectHarnesses(cwd)
  const { results } = generate(cwd, { harnesses, force, dryRun: check })
  const drifted = results.filter((r) => DRIFT_OUTCOMES.has(r.outcome))

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          mode: check ? 'check' : force ? 'force' : 'write',
          harnesses,
          files: results,
        },
        null,
        2,
      )}\n`,
    )
    return check && drifted.length > 0 ? 1 : 0
  }

  renderHuman(results, { check, harnesses, hadManifest: existsSync(manifestPath(cwd)) })
  return check && drifted.length > 0 ? 1 : 0
}

function renderHuman(
  results: WriteResult[],
  opts: { check: boolean; harnesses: HarnessName[]; hadManifest: boolean },
): void {
  const changed = results.filter((r) => DRIFT_OUTCOMES.has(r.outcome))
  if (changed.length === 0) {
    process.stdout.write(
      opts.check ? 'cospec update --check: no drift\n' : 'cospec update: everything up to date\n',
    )
    return
  }

  const lines: string[] = []
  lines.push(
    opts.check
      ? `cospec update --check — ${changed.length} file(s) would change:`
      : `cospec update — ${changed.length} file(s) changed:`,
  )
  const width = Math.max(...changed.map((r) => r.outcome.length))
  for (const r of changed) {
    lines.push(`  ${r.outcome.padEnd(width)}  ${r.path}`)
  }
  const preserved = changed.filter(
    (r) => r.outcome === 'preserved-modified' || r.outcome === 'preserved-foreign',
  )
  if (preserved.length > 0 && !opts.check) {
    lines.push('')
    lines.push(
      `${preserved.length} file(s) preserved (your edits kept; new version written to .cospec-new).`,
    )
    lines.push('Reconcile the .cospec-new sidecars, or re-run with --force to overwrite.')
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}
