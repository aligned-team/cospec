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
import { dirname, join, resolve } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import { hasFlag } from '../core/command-table.ts'
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
import {
  adapterFor,
  carriesFrontmatter,
  commandPath,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  ideRestartLine,
  legacySkillsRoots,
  removalRoots,
  SKILL_FILE,
  skillsRoot,
} from '../harness/adapters.ts'
import { LEGACY_CODEX_SKILL_ROOT, migrateLegacySkills } from '../harness/legacy-skills.ts'
import { readWorkflowManifest, renderHarnessFiles } from '../harness/render.ts'
import {
  isSharedSkillTargetActive,
  resolveSharedSkillWriters,
  sharedTargetMarkers,
} from '../harness/shared-root.ts'

// --- harness detection -----------------------------------------------------

// Every root and marker below is read from the harness's HARNESS_TABLE row. Rows that share
// a skills root (`.agents/skills`) write it from one chosen writer (`harness/shared-root.ts`),
// so that tree is evidence only for its writer.

/** The sentinel skill every harness always emits — used for presence detection. */
const SENTINEL_SKILL = 'cospec-propose'

/**
 * Directories cospec owns and is therefore allowed to delete manifest-tracked
 * files from: the `openspec/` tree (schemas + templates) and every top-level dir
 * a harness row writes under (skills, commands, rules file and legacy skills
 * roots — e.g. `.codex`, which holds the codex rules file). Manifest keys are
 * untrusted (see `resolveContainedPath`); any key that does not resolve inside
 * one of these is ignored rather than joined onto cwd and deleted.
 */
const MANAGED_REMOVAL_ROOTS: readonly string[] = removalRoots()

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

function hasSentinel(cwd: string, base: string): boolean {
  const path = join(cwd, base, SENTINEL_SKILL, SKILL_FILE)
  if (!existsSync(path)) return false
  return isCospecManagedMarkdown(readFileSync(path, 'utf8'))
}

/**
 * Whether the row's command surface holds cospec's command for the sentinel workflow: a
 * markdown command by its frontmatter provenance, a frontmatter-less one by its manifest entry.
 */
function hasSentinelCommand(
  cwd: string,
  row: HarnessAdapter,
  tracked: Readonly<Record<string, string>>,
): boolean {
  const workflow = readWorkflowManifest().workflows.find((w) => w.skill === SENTINEL_SKILL)
  if (workflow === undefined) {
    throw new Error(`internal: no workflow renders the sentinel skill ${SENTINEL_SKILL}`)
  }
  const relpath = commandPath(row, workflow.command)
  if (relpath === undefined || !existsSync(join(cwd, relpath))) return false
  if (!carriesFrontmatter(row.commands!.serializer)) return tracked[relpath] !== undefined
  return isCospecManagedMarkdown(readFileSync(join(cwd, relpath), 'utf8'))
}

/**
 * Evidence that this harness was configured in `cwd`: a cospec sentinel skill in its legacy
 * root; or in its skills root when it is that root's writer; or its sentinel command; or its
 * rules file.
 */
function hasHarnessEvidence(
  cwd: string,
  row: HarnessAdapter,
  table: readonly HarnessAdapter[],
  tracked: Readonly<Record<string, string>>,
): boolean {
  // A pre-migration install is detected by its LEGACY base alone — without that,
  // a `.codex/skills` tree would stop being regenerated and never be cleaned up.
  if (legacySkillsRoots(row).some((base) => hasSentinel(cwd, base))) return true
  const skills = skillsRoot(row)
  if (
    skills.scope === 'project' &&
    hasSentinel(cwd, skills.root) &&
    isSharedSkillTargetActive(cwd, row.id, table)
  ) {
    return true
  }
  if (hasSentinelCommand(cwd, row, tracked)) return true
  return row.rulesPath !== undefined && existsSync(join(cwd, row.rulesPath))
}

/**
 * The harnesses configured in `cwd`, in table order. A shared skills root is evidence only
 * for the row that writes it, so a repo whose `.agents/skills` was written for codex does not
 * report agents or zed as well; a row on that root is still reported through a surface of
 * its own (a rules file, a command directory). `table` is a test seam.
 */
export function detectHarnesses(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): HarnessName[] {
  const tracked = readManifest(cwd)?.files ?? {}
  return table
    .filter((row) => hasHarnessEvidence(cwd, row, table, tracked))
    .map((row) => row.id as HarnessName)
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
  /** Override the tool rows (tests), forwarded to `renderHarnessFiles`. */
  adapters?: readonly HarnessAdapter[]
}

export interface GenerateResult {
  results: WriteResult[]
  /** Legacy-layout outcomes from the `.codex/skills` -> `.agents/skills` move. */
  migration: WriteResult[]
  /** The manifest that was (or would be) written. */
  manifest: Manifest
  /** The rows that wrote (or would write) each skills root; one per shared root. */
  skillWriters: ReadonlySet<string>
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

  // Harness files. A shared skills root is rendered from its one writer, read from disk
  // (marker, then evidence) before anything is written.
  const table = opts.adapters ?? HARNESS_TABLE
  const skillWriters = resolveSharedSkillWriters(cwd, opts.harnesses, table)
  const rendered = renderHarnessFiles({
    harnesses: opts.harnesses,
    typeTable: TYPE_TABLE,
    version,
    adapters: opts.adapters,
    skillWriters,
  })
  // A home-relative path joined onto the repo would write outside the tool's
  // real location; no managed root covers the home directory yet. Refused
  // before any write, so nothing lands on disk.
  for (const file of rendered) {
    if (file.scope === 'home') {
      throw new Error(
        `internal: ${file.harness} rendered home-scoped ${file.path}, which no managed root covers`,
      )
    }
  }
  for (const file of rendered) {
    // Files with no frontmatter (the codex rules file, a TOML command) carry no
    // self-describing provenance, so the manifest tracks them.
    if (file.frontmatter === null) {
      flat.push({ relpath: file.path, abspath: join(cwd, file.path), content: file.content })
    } else {
      md.push({ relpath: file.path, abspath: join(cwd, file.path), content: file.content })
    }
  }
  // The writer's id on each shared root it writes, manifest-tracked like any frontmatter-less file.
  for (const marker of sharedTargetMarkers(skillWriters, table)) {
    flat.push({
      relpath: marker.relpath,
      abspath: join(cwd, marker.relpath),
      content: marker.content,
    })
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
  for (const removed of removeOrphanMarkdown(cwd, rendered, mdEmitted, table, writeOpts)) {
    results.push(removed)
  }

  // After generation, never before: the fresh copy under `.agents/skills` must
  // already exist before a legacy duplicate is removed.
  const migration = migrateLegacySkills(cwd, mdEmitted, writeOpts)

  if (!writeOpts.dryRun) writeManifest(cwd, newManifest)
  return { results, migration, manifest: newManifest, skillWriters }
}

/** Scan the emitted harnesses' skill/command dirs for cospec markdown we no longer emit. */
function removeOrphanMarkdown(
  cwd: string,
  rendered: ReturnType<typeof renderHarnessFiles>,
  emitted: Set<string>,
  table: readonly HarnessAdapter[],
  opts: WriteOpts,
): WriteResult[] {
  const skillBases = new Set<string>()
  // Command dir -> the extensions its rows render markdown commands with. A
  // frontmatter-less (TOML) command is the manifest's to remove, so its dir is
  // not swept here.
  const commandDirs = new Map<string, Set<string>>()
  for (const f of rendered) {
    if (f.kind === 'skill') skillBases.add(dirname(dirname(f.path)))
    else if (f.kind === 'command' && f.frontmatter !== null) {
      const extension = adapterFor(f.harness, table).commands?.extension
      if (extension === undefined) {
        throw new Error(
          `internal: ${f.harness} rendered command ${f.path} but its row declares no commands`,
        )
      }
      const dir = dirname(f.path)
      const extensions = commandDirs.get(dir) ?? new Set<string>()
      extensions.add(extension)
      commandDirs.set(dir, extensions)
    }
  }
  const out: WriteResult[] = []
  for (const base of skillBases) {
    const abs = join(cwd, base)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const relpath = `${base}/${entry.name}/${SKILL_FILE}`
      if (emitted.has(relpath)) continue
      const removed = removeMarkdown(join(cwd, relpath), relpath, opts)
      if (removed) out.push(removed)
    }
  }
  for (const [dir, extensions] of commandDirs) {
    const abs = join(cwd, dir)
    if (!existsSync(abs)) continue
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile() || ![...extensions].some((ext) => entry.name.endsWith(ext))) continue
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
  const { flags, parsed } = ctx
  // `update [path]`: the project the path names, as upstream's `update` takes it.
  const cwd = resolve(ctx.cwd, parsed!.positionals[0] ?? '.')
  const check = hasFlag(parsed!, '--check')
  const force = hasFlag(parsed!, '--force')

  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec: no openspec/ directory at ${cwd} — run 'cospec init' first\n`)
    return 1
  }

  const harnesses = detectHarnesses(cwd)
  const { results, migration } = generate(cwd, { harnesses, force, dryRun: check })
  // A remaining legacy layout is drift: `cospec update --check` (and therefore
  // `generate:check` in CI) must fail while `.codex/skills` still holds cospec files.
  const drifted = [...results, ...migration].filter((r) => DRIFT_OUTCOMES.has(r.outcome))

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          mode: check ? 'check' : force ? 'force' : 'write',
          harnesses,
          files: results,
          migration,
        },
        null,
        2,
      )}\n`,
    )
    return check && drifted.length > 0 ? 1 : 0
  }

  renderHuman(results, { check, harnesses, hadManifest: existsSync(manifestPath(cwd)) })
  for (const line of migrationLines(migration, check)) process.stdout.write(`${line}\n`)
  // Upstream prints its restart line only when an update touched a tool's files.
  const restart = check || drifted.length === 0 ? undefined : updateRestartLine(harnesses)
  if (restart !== undefined) process.stdout.write(`${restart}\n`)
  return check && drifted.length > 0 ? 1 : 0
}

/**
 * The update receipt's IDE restart line for the detected harnesses, or
 * undefined when none of their rows sets `requiresIdeRestart`. `table` is a
 * test seam for rows the shipped table does not carry.
 */
export function updateRestartLine(
  harnesses: readonly string[],
  table?: readonly HarnessAdapter[],
): string | undefined {
  return ideRestartLine(harnesses.map((h) => adapterFor(h, table)))
}

/**
 * Human report for the `.codex/skills` -> `.agents/skills` move. Exported so
 * `init`'s receipt prints exactly the same wording.
 */
export function migrationLines(migration: WriteResult[], check: boolean): string[] {
  const removed = migration.filter((r) => r.outcome === 'removed')
  const kept = migration.filter((r) => r.outcome === 'preserved-modified')
  const lines: string[] = []
  if (removed.length > 0) {
    lines.push(
      check
        ? `Would migrate ${removed.length} skill file(s): ${LEGACY_CODEX_SKILL_ROOT} -> .agents/skills`
        : `Migrated ${removed.length} skill file(s): ${LEGACY_CODEX_SKILL_ROOT} -> .agents/skills`,
    )
  }
  if (kept.length > 0) {
    lines.push(
      `Left ${kept.length} file(s) in ${LEGACY_CODEX_SKILL_ROOT} that differ from the copy in ` +
        '.agents/skills — nothing was overwritten. Compare them and delete the .codex/ copy ' +
        'once you have kept anything you customised (or re-run with --force).',
    )
    for (const r of kept) lines.push(`  ${r.path}`)
  }
  return lines
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
