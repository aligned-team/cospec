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
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import type { CommandContext } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import { hasFlag } from '../core/command-table.ts'
import { isolatedWriteFailure } from '../core/errno.ts'
import { readGlobalProfile } from '../core/global-profile.ts'
import { isInteractive } from '../core/interactive.ts'
import {
  computeContentHash,
  CURRENT_GENERATED_BY,
  type Manifest,
  MANAGED_AUTHOR,
  manifestPath,
  readManifest,
  resolveContainedPath,
  renderManaged,
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
  legacySkillsRoots,
  removalRoots,
  SKILL_FILE,
  skillsRoot,
} from '../harness/adapters.ts'
import {
  assertCopilotCloudPaths,
  assertCopilotCloudRemovalPaths,
  classifyCloudFile,
  classifyCopilotAgentReconciliation,
  COPILOT_CLOUD_FILES,
  type CopilotCloudDirective,
  copilotAgentFrontmatter,
  copilotSelected,
  type CopilotCloudReport,
  copilotCloudUpdateLines,
  copilotSetupStepsContent,
  emptyCopilotCloudReport,
  expectedCloudFailure,
  implicitCopilotCloudDirective,
  isCopilotCloudPath,
} from '../harness/copilot-cloud.ts'
import { type Delivery, ideRestartLine, zeroArtifactLine } from '../harness/delivery.ts'
import { hasHomeSkillEvidence, resolveHomeDir } from '../harness/home-root.ts'
import {
  canAskLegacyConsent,
  consentLegacyMoves,
  LEGACY_CODEX_SKILL_ROOT,
  legacyMoveEntries,
  legacyMoveLines,
  type LegacyToolMove,
  migrateLegacySkills,
  moveLegacyToolRoots,
} from '../harness/legacy-skills.ts'
import {
  assertWorkflowConditionalsResolved,
  commandWriteReason,
  skillWriteReason,
} from '../harness/optional-workflow.ts'
import { readWorkflowManifest, renderHarnessFiles } from '../harness/render.ts'
import {
  isSharedSkillTargetActive,
  resolveSharedSkillWriters,
  sharedTargetMarkers,
} from '../harness/shared-root.ts'
import { selectWorkflows, workflowsLine } from '../harness/workflow-set.ts'

// --- harness detection -----------------------------------------------------

// Every root and marker below is read from the harness's HARNESS_TABLE row. Rows that share
// a skills root (`.agents/skills`) write it from one chosen writer (`harness/shared-root.ts`),
// so that tree is evidence only for its writer.

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

/** Whether `abspath` is a markdown file cospec wrote (its frontmatter says so). */
function isManagedFile(abspath: string): boolean {
  return existsSync(abspath) && isCospecManagedMarkdown(readFileSync(abspath, 'utf8'))
}

/** Whether a cospec-managed skill of any workflow sits under `root` (a project-relative base). */
function hasManagedSkill(root: string, base: string): boolean {
  return readWorkflowManifest().workflows.some((w) =>
    isManagedFile(join(root, base, w.skill, SKILL_FILE)),
  )
}

/**
 * Whether the command file at `relpath` is cospec's: a markdown command by its frontmatter
 * provenance, a frontmatter-less one by its manifest entry.
 */
function isManagedCommand(
  cwd: string,
  row: HarnessAdapter,
  relpath: string,
  tracked: Readonly<Record<string, string>>,
): boolean {
  if (!existsSync(join(cwd, relpath))) return false
  if (!carriesFrontmatter(row.commands!.serializer)) return tracked[relpath] !== undefined
  return isCospecManagedMarkdown(readFileSync(join(cwd, relpath), 'utf8'))
}

/** Whether the row's command surface holds cospec's command for any workflow. */
function hasManagedCommand(
  cwd: string,
  row: HarnessAdapter,
  tracked: Readonly<Record<string, string>>,
): boolean {
  return readWorkflowManifest().workflows.some((w) => {
    const relpath = commandPath(row, w.command)
    return relpath !== undefined && isManagedCommand(cwd, row, relpath, tracked)
  })
}

/**
 * The workflow ids `row` already has installed in `cwd`: every one whose cospec-managed skill
 * (in the row's skills root, or a legacy root it has not been moved out of) or command is on
 * disk. Both surfaces count, whatever the delivery, so a workflow whose surface a delivery
 * switch dropped stays installed and returns when the switch is undone. `update` renders
 * these beside the profile's set: it never removes an installed workflow (design D4).
 */
export function installedWorkflowIds(
  cwd: string,
  row: HarnessAdapter,
  tracked: Readonly<Record<string, string>>,
  home: string = resolveHomeDir(),
): Set<string> {
  const skills = skillsRoot(row)
  const skillBases: { root: string; base: string }[] = [
    { root: skills.scope === 'home' ? home : cwd, base: skills.root },
    ...legacySkillsRoots(row).map((base) => ({ root: cwd, base })),
  ]
  const ids = new Set<string>()
  for (const w of readWorkflowManifest().workflows) {
    const command = commandPath(row, w.command)
    if (
      skillBases.some(({ root, base }) => isManagedFile(join(root, base, w.skill, SKILL_FILE))) ||
      (command !== undefined && isManagedCommand(cwd, row, command, tracked))
    ) {
      ids.add(w.id)
    }
  }
  return ids
}

/**
 * Evidence that this harness was configured in `cwd`: a cospec skill of any workflow in its
 * legacy root; or in its skills root when it is that root's writer (for a home-scoped row, a
 * cospec skill in the home skills directory); or a cospec command of any workflow; or its
 * rules file. Any workflow counts, so a profile that leaves out `propose`, or a delivery that
 * writes no skills, does not hide an installed harness.
 */
function hasHarnessEvidence(
  cwd: string,
  row: HarnessAdapter,
  table: readonly HarnessAdapter[],
  tracked: Readonly<Record<string, string>>,
): boolean {
  // A pre-migration install is detected by its LEGACY base alone — without that,
  // a `.codex/skills` tree would stop being regenerated and never be cleaned up.
  if (legacySkillsRoots(row).some((base) => hasManagedSkill(cwd, base))) return true
  const skills = skillsRoot(row)
  if (
    skills.scope === 'project' &&
    hasManagedSkill(cwd, skills.root) &&
    isSharedSkillTargetActive(cwd, row.id, table)
  ) {
    return true
  }
  // A home-scoped row has no project skills; its evidence is a cospec skill in the home root.
  if (skills.scope === 'home' && hasHomeSkillEvidence(row, ['cospec'])) return true
  if (hasManagedCommand(cwd, row, tracked)) return true
  return row.rulesPath !== undefined && existsSync(join(cwd, row.rulesPath))
}

/**
 * The harnesses configured in `cwd`, in table order. A shared skills root is evidence only
 * for the row that writes it, so a repo whose `.agents/skills` was written for codex does not
 * report agents or zed as well; a row on that root is still reported through a surface of
 * its own (a rules file, a command directory). A harness the last run could not write is
 * reported too, so the next `update` retries it. `table` is a test seam.
 */
export function detectHarnesses(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): HarnessName[] {
  const manifest = readManifest(cwd)
  const tracked = manifest?.files ?? {}
  const retry = new Set(manifest?.retry ?? [])
  return table
    .filter((row) => retry.has(row.id) || hasHarnessEvidence(cwd, row, table, tracked))
    .map((row) => row.id as HarnessName)
}

// --- atomic write ----------------------------------------------------------

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.cospec-tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, content)
  try {
    renameSync(tmp, path)
  } catch (error) {
    // A target that is a directory fails the rename; do not leave the staged copy behind.
    rmSync(tmp, { force: true })
    throw error
  }
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
  /**
   * What to do with the Copilot cloud files (`github-copilot`'s two opt-in files). `init`
   * passes its decision's outcome; absent, `generate()` resolves it from `cwd` (the persisted
   * boolean, then a managed file on disk), as `update` and `doctor` need.
   */
  cloud?: CopilotCloudDirective
  /**
   * The workflow ids to install and the surfaces to write them to, forwarded to
   * `renderHarnessFiles`. Absent, every workflow and both surfaces, as before a profile existed.
   */
  workflows?: ReadonlySet<string>
  delivery?: Delivery
}

/** One generated file `generate()` could not write, sidecar or remove (design decision 10). */
export interface FailedWrite {
  path: string
  /** The errno failure's own message (`EACCES: permission denied, mkdir '…'`). */
  error: string
}

export interface GenerateResult {
  results: WriteResult[]
  /** Files left as they were because of a permission or path-type error. */
  failed: FailedWrite[]
  /** Legacy-layout outcomes from the `.codex/skills` -> `.agents/skills` move. */
  migration: WriteResult[]
  /** The manifest that was (or would be) written. */
  manifest: Manifest
  /** The rows that wrote (or would write) each skills root; one per shared root. */
  skillWriters: ReadonlySet<string>
  /** The Copilot cloud files after the run; absent when the run left them alone. */
  cloud?: CopilotCloudReport
  /** What the run did with the cloud files: the option `init` passed, else the resolved one. */
  cloudDirective: CopilotCloudDirective
}

/** Run one file operation, recording an isolated write failure against `path` instead of throwing. */
type Attempt = <T>(path: string, op: () => T) => T | undefined

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
  const md: { relpath: string; abspath: string; content: string; scope?: 'home' }[] = []

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
  // A home-scoped file (a row with `globalSkillsDir`) lives under the resolved home directory
  // and is reported by its absolute path, which no project path can equal. Skills are
  // self-describing markdown, so no home path is ever a manifest key.
  const home = resolveHomeDir()
  // A profile selects what a row gets by default; it never takes away what the row already
  // has (design D4). Each row renders the profile's set plus the workflows it has installed.
  const workflowsByHarness =
    opts.workflows === undefined
      ? undefined
      : new Map(
          opts.harnesses.map((id) => [
            id,
            new Set([
              ...opts.workflows!,
              ...installedWorkflowIds(cwd, adapterFor(id, table), prevFiles, home),
            ]),
          ]),
        )
  const rendered = renderHarnessFiles({
    harnesses: opts.harnesses,
    typeTable: TYPE_TABLE,
    version,
    adapters: opts.adapters,
    skillWriters,
    workflowsByHarness,
    delivery: opts.delivery,
  })
  // Checked over the whole rendered set before anything is written, so a body that skipped
  // conditional resolution never reaches disk (design D6).
  for (const file of rendered) {
    if (file.kind === 'skill') {
      assertWorkflowConditionalsResolved(file.body, skillWriteReason(basename(dirname(file.path))))
    } else if (file.kind === 'command' && file.workflow !== null) {
      assertWorkflowConditionalsResolved(file.body, commandWriteReason(file.workflow))
    }
  }
  for (const file of rendered) {
    const isHome = file.scope === 'home'
    const abspath = isHome ? join(home, file.path) : join(cwd, file.path)
    // Files with no frontmatter (the codex rules file, a TOML command) carry no
    // self-describing provenance, so the manifest tracks them.
    if (file.frontmatter === null) {
      if (isHome) {
        throw new Error(
          `internal: ${file.harness} rendered ${file.path} under the home directory with no frontmatter, which no manifest can track`,
        )
      }
      flat.push({ relpath: file.path, abspath, content: file.content })
    } else {
      md.push({
        relpath: isHome ? abspath : file.path,
        abspath,
        content: file.content,
        ...(isHome ? { scope: 'home' as const } : {}),
      })
    }
  }
  // The writer's id on each shared root it writes, manifest-tracked like any frontmatter-less file.
  // A root the delivery generates no skills into (`commands` with only `agents` selected) gets
  // no marker either, so `init` and a later `update` agree that nothing is written there.
  for (const marker of sharedTargetMarkers(skillWriters, table)) {
    const root = marker.relpath.slice(0, marker.relpath.lastIndexOf('/') + 1)
    if (!rendered.some((f) => f.path.startsWith(root))) continue
    flat.push({
      relpath: marker.relpath,
      abspath: join(cwd, marker.relpath),
      content: marker.content,
    })
  }

  const results: WriteResult[] = []
  const failed: FailedWrite[] = []
  const newManifest: Manifest = { cospecVersion: version, files: {} }

  // The Copilot cloud files (design decisions 7 and 8): emitted while the directive is `write`,
  // taken away while it is `remove`, left alone (record and all) otherwise. A profile conflict
  // or a path guard costs the cloud files only; the rest of the run still writes.
  const cloudDirective = opts.cloud ?? implicitCopilotCloudDirective(cwd, opts.harnesses, prev)
  let cloudActive = cloudDirective !== 'leave'
  let removeManagedAgent = false
  if (cloudDirective === 'write') {
    try {
      assertCopilotCloudPaths(cwd)
      const reconciliation = classifyCopilotAgentReconciliation(cwd, prev)
      flat.push({
        relpath: COPILOT_CLOUD_FILES.setupSteps,
        abspath: join(cwd, COPILOT_CLOUD_FILES.setupSteps),
        content: copilotSetupStepsContent(),
      })
      if (reconciliation === 'reconcile') {
        md.push({
          relpath: COPILOT_CLOUD_FILES.agent,
          abspath: join(cwd, COPILOT_CLOUD_FILES.agent),
          content: renderManaged(copilotAgentFrontmatter(), version),
        })
      } else if (reconciliation === 'remove-managed') {
        removeManagedAgent = true
      }
    } catch (error) {
      const failure = expectedCloudFailure(error, COPILOT_CLOUD_FILES.agent)
      if (failure === undefined) throw error
      failed.push(failure)
      cloudActive = false
    }
  }
  // A permission or path-type error costs only its own file (design decision 10); any other
  // error is not this run's to hide and propagates.
  const attempt: Attempt = (path, op) => {
    try {
      return op()
    } catch (error) {
      const message = isolatedWriteFailure(error)
      if (message === undefined) throw error
      failed.push({ path, error: message })
      return undefined
    }
  }

  for (const f of flat) {
    const written = attempt(f.relpath, () =>
      writeFrontmatterless(f.abspath, f.relpath, f.content, prevFiles[f.relpath], writeOpts),
    )
    if (written !== undefined) {
      results.push(written)
      // A workflow that was already there and is not ours was never written by cospec: recording
      // its hash as ours would later report it as "edited since cospec wrote it".
      const neverOurs = isCopilotCloudPath(f.relpath) && written.outcome === 'preserved-foreign'
      if (!neverOurs) newManifest.files[f.relpath] = computeContentHash(f.content)
    } else if (prevFiles[f.relpath] !== undefined) {
      // Still the last content cospec wrote, so the next run can tell it from a user's edit.
      newManifest.files[f.relpath] = prevFiles[f.relpath]!
    }
  }
  const mdEmitted = new Set(md.map((f) => f.relpath))
  for (const f of md) {
    const written = attempt(f.relpath, () =>
      writeMarkdown(f.abspath, f.relpath, f.content, writeOpts),
    )
    if (written !== undefined)
      results.push(f.scope === 'home' ? { ...written, scope: 'home' } : written)
  }

  const cloud = cloudActive ? emptyCopilotCloudReport() : undefined
  // Set once removal's guards passed: only then is a cloud file's manifest record settled.
  let removalRan = false
  if (cloud !== undefined) {
    const removeCloudFile = (relpath: string): void => {
      const state = classifyCloudFile(cwd, relpath, prev)
      if (state === 'managed') {
        const removed = attempt(relpath, () => {
          if (!writeOpts.dryRun) rmSync(join(cwd, relpath))
          return true
        })
        if (removed !== undefined) {
          results.push({ path: relpath, outcome: 'removed' })
          cloud.removed.push(relpath)
        }
      } else if (state === 'modified') {
        cloud.leftInPlace.push(relpath)
      }
    }
    if (cloudDirective === 'remove') {
      try {
        assertCopilotCloudRemovalPaths(cwd)
        removalRan = true
        removeCloudFile(COPILOT_CLOUD_FILES.setupSteps)
        removeCloudFile(COPILOT_CLOUD_FILES.agent)
      } catch (error) {
        const failure = expectedCloudFailure(error, COPILOT_CLOUD_FILES.agent)
        if (failure === undefined) throw error
        failed.push(failure)
      }
    } else {
      if (removeManagedAgent) removeCloudFile(COPILOT_CLOUD_FILES.agent)
      for (const r of results) {
        if (!isCopilotCloudPath(r.path)) continue
        if (r.outcome === 'preserved-foreign' || r.outcome === 'preserved-modified') {
          cloud.collisions.push(r.path)
        } else if (r.outcome !== 'removed') {
          cloud.present.push(r.path)
        }
      }
    }
  }

  // Removals: frontmatter-less files the previous manifest tracked that we no
  // longer emit; and orphaned cospec-managed markdown in the harness dirs.
  const flatEmitted = new Set(flat.map((f) => f.relpath))
  for (const relpath of Object.keys(prevFiles)) {
    if (flatEmitted.has(relpath)) continue
    // The cloud workflow is the directive's to remove (above), never this loop's: an edited one
    // is reported, not drift, and an undecided run keeps its record.
    if (isCopilotCloudPath(relpath)) {
      const settled =
        removalRan &&
        !cloud?.leftInPlace.includes(relpath) &&
        !failed.some((f) => f.path === relpath)
      if (!settled) newManifest.files[relpath] = prevFiles[relpath]!
      continue
    }
    // The manifest is committed and may be attacker-controlled; contain the key
    // to the dirs cospec owns before turning it into a delete target. A poisoned
    // key like `../victim.txt` resolves outside and is skipped entirely.
    const abspath = resolveContainedPath(cwd, relpath, MANAGED_REMOVAL_ROOTS)
    if (abspath === undefined) continue
    const removed = attempt(relpath, () =>
      removeFrontmatterless(abspath, relpath, prevFiles[relpath], writeOpts),
    )
    if (removed === undefined) {
      // Not removed because it could not be: keep tracking it so the next run tries again.
      if (failed.some((f) => f.path === relpath)) newManifest.files[relpath] = prevFiles[relpath]!
      continue
    }
    results.push(removed)
  }
  for (const removed of removeOrphanMarkdown(
    cwd,
    home,
    opts.harnesses.map((id) => adapterFor(id, table)),
    mdEmitted,
    writeOpts,
    attempt,
  )) {
    results.push(removed)
  }

  // A harness with a file that failed is retried by the next `update`, however little of it exists.
  const harnessOfPath = new Map(
    rendered.map((f) => [f.scope === 'home' ? join(home, f.path) : f.path, f.harness as string]),
  )
  const retry = new Set(
    (prev?.retry ?? []).filter((id) => !opts.harnesses.includes(id as HarnessName)),
  )
  for (const f of failed) {
    const harness = harnessOfPath.get(f.path)
    if (harness !== undefined) retry.add(harness)
  }
  if (retry.size > 0) newManifest.retry = [...retry]

  // After generation, never before: the fresh copy under `.agents/skills` must
  // already exist before a legacy duplicate is removed.
  const migration = migrateLegacySkills(cwd, mdEmitted, writeOpts)

  if (!writeOpts.dryRun) writeManifest(cwd, newManifest)
  return { results, failed, migration, manifest: newManifest, skillWriters, cloud, cloudDirective }
}

/**
 * Scan the selected rows' skill and command dirs for cospec markdown we no longer emit. The
 * dirs come from the rows, not from the rendered files, so a surface the delivery no longer
 * generates (skills under `commands`, commands under `skills`) is swept too.
 */
function removeOrphanMarkdown(
  cwd: string,
  home: string,
  rows: readonly HarnessAdapter[],
  emitted: Set<string>,
  opts: WriteOpts,
  attempt: Attempt,
): WriteResult[] {
  const skillBases = new Map<string, 'project' | 'home'>()
  // Command dir -> the extensions its rows render markdown commands with. A
  // frontmatter-less (TOML) command is the manifest's to remove, so its dir is
  // not swept here.
  const commandDirs = new Map<string, Set<string>>()
  for (const row of rows) {
    const skills = skillsRoot(row)
    skillBases.set(skills.root, skills.scope)
    const commands = row.commands
    if (commands === undefined || !carriesFrontmatter(commands.serializer)) continue
    // The directory a command lands in: a namespaced row's `file` pattern carries a subdirectory.
    const dir = dirname(commandPath(row, 'workflow')!)
    const extensions = commandDirs.get(dir) ?? new Set<string>()
    extensions.add(commands.extension)
    commandDirs.set(dir, extensions)
  }
  const out: WriteResult[] = []
  for (const [base, scope] of skillBases) {
    // A home-scoped base is swept at its absolute path; what it removes is contained in it.
    const absBase = scope === 'home' ? join(home, base) : join(cwd, base)
    const shown = scope === 'home' ? absBase : base
    if (!existsSync(absBase)) continue
    const entries = attempt(shown, () => readdirSync(absBase, { withFileTypes: true }))
    for (const entry of entries ?? []) {
      if (!entry.isDirectory()) continue
      const relpath = `${shown}/${entry.name}/${SKILL_FILE}`
      if (emitted.has(relpath)) continue
      const abspath = join(absBase, entry.name, SKILL_FILE)
      if (scope === 'home' && resolveContainedPath(cwd, abspath, [], [absBase]) === undefined) {
        continue
      }
      const removed = attempt(relpath, () => removeMarkdown(abspath, relpath, opts))
      if (removed) out.push(scope === 'home' ? { ...removed, scope } : removed)
    }
  }
  for (const [dir, extensions] of commandDirs) {
    const abs = join(cwd, dir)
    if (!existsSync(abs)) continue
    const entries = attempt(dir, () => readdirSync(abs, { withFileTypes: true }))
    for (const entry of entries ?? []) {
      if (!entry.isFile() || ![...extensions].some((ext) => entry.name.endsWith(ext))) continue
      const relpath = `${dir}/${entry.name}`
      if (emitted.has(relpath)) continue
      const removed = attempt(relpath, () => removeMarkdown(join(cwd, relpath), relpath, opts))
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

export async function run(ctx: CommandContext): Promise<number> {
  const { flags, parsed } = ctx
  // `update [path]`: the project the path names, as upstream's `update` takes it.
  const cwd = resolve(ctx.cwd, parsed!.positionals[0] ?? '.')
  const check = hasFlag(parsed!, '--check')
  const force = hasFlag(parsed!, '--force')

  if (!existsSync(openspecDir(cwd))) {
    process.stderr.write(`cospec: no openspec/ directory at ${cwd} — run 'cospec init' first\n`)
    return 1
  }

  // Upstream's order: legacy tool roots move before detection, so a renamed tool's files
  // are where its row looks; the consent-gated ones are asked about (or, unattended, moved).
  const moves: LegacyToolMove[] = moveLegacyToolRoots(cwd, {
    timing: 'before-generation',
    dryRun: check,
  })
  if (!check) {
    const interactive = canAskLegacyConsent({
      stdinIsTTY: process.stdin.isTTY === true,
      stdoutIsTTY: process.stdout.isTTY === true,
      json: flags.json,
      force,
    })
    moves.push(...consentLegacyMoves(cwd, { interactive, ask: askOnTerminal }))
  }

  const harnesses = detectHarnesses(cwd)
  // A profile or delivery applies only when the user set one in the machine-global config;
  // upstream's built-in default is not a choice they made, so a repo that sets nothing keeps
  // every workflow and both surfaces.
  const selection = selectWorkflows(undefined, await readGlobalProfile(cwd, { warn: true }))
  const generated = generate(cwd, {
    harnesses,
    force,
    dryRun: check,
    workflows: selection.installed,
    delivery: selection.delivery,
  })
  const { results, migration } = generated
  // The binary catches a failed cloud sync into one Warning and keeps the exit code; cospec does
  // the same for the failures it expects there (a profile conflict, a path guard, the errno set)
  // and leaves every other failed write a failed run.
  const failed = generated.failed.filter((f) => !isCopilotCloudPath(f.path))
  const cloudWarnings = generated.failed.filter((f) => isCopilotCloudPath(f.path))
  moves.push(
    ...moveLegacyToolRoots(cwd, {
      timing: 'after-generation',
      toolIds: harnesses,
      emitted: emittedPaths(results),
      dryRun: check,
    }),
  )
  // A remaining legacy layout is drift: `cospec update --check` (and therefore
  // `generate:check` in CI) must fail while `.codex/skills` still holds cospec files,
  // or while a legacy tool root holds OpenSpec files the update would move.
  const drifted = [...results, ...migration].filter((r) => DRIFT_OUTCOMES.has(r.outcome))
  const wouldMove = legacyMoveEntries(moves).some(
    (e) => e.outcome === 'moved' || e.outcome === 'removed',
  )

  // A file that could not be written is a failed run, in every mode.
  const exitCode = failed.length > 0 || (check && (drifted.length > 0 || wouldMove)) ? 1 : 0

  for (const w of cloudWarnings) {
    process.stderr.write(`Warning: failed to sync Copilot cloud agent files: ${w.error}\n`)
  }

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          mode: check ? 'check' : force ? 'force' : 'write',
          harnesses,
          profile: selection.profile ?? null,
          delivery: selection.delivery,
          files: results,
          failed,
          migration: [...migration, ...legacyMoveEntries(moves)],
        },
        null,
        2,
      )}\n`,
    )
    return exitCode
  }

  renderHuman(results, {
    check,
    harnesses,
    hadManifest: existsSync(manifestPath(cwd)),
    movesPending: wouldMove,
    failed: failed.length > 0,
  })
  const workflowsNote = workflowsLine(selection)
  if (workflowsNote !== undefined) process.stdout.write(`${workflowsNote}\n`)
  const noArtifacts = zeroArtifactLine(
    harnesses.map((id) => adapterFor(id)),
    selection.delivery,
  )
  if (noArtifacts !== undefined) process.stdout.write(`${noArtifacts}\n`)
  for (const line of migrationLines(migration, check)) process.stdout.write(`${line}\n`)
  for (const line of legacyMoveLines(moves, check)) process.stdout.write(`${line}\n`)
  for (const line of failedLines(failed)) process.stdout.write(`${line}\n`)
  const cloudLines = copilotCloudUpdateLines({
    directive: generated.cloudDirective,
    configured: copilotSelected(harnesses),
    report: generated.cloud,
    check,
    json: flags.json,
    interactive: isInteractive(),
  })
  for (const line of cloudLines) process.stdout.write(`${line}\n`)
  // Upstream prints its restart line only when an update touched a tool's files.
  const restart =
    check || drifted.length === 0
      ? undefined
      : updateRestartLine(harnesses, undefined, selection.delivery)
  if (restart !== undefined) process.stdout.write(`${restart}\n`)
  return exitCode
}

/** The repo-relative paths a `generate()` run wrote or would write (everything but removals). */
export function emittedPaths(results: readonly WriteResult[]): Set<string> {
  return new Set(results.filter((r) => r.outcome !== 'removed').map((r) => r.path))
}

/**
 * `update`'s yes/no question on a terminal, upstream's default yes. A closed stdin is not
 * consent, and it does not abort the update.
 */
function askOnTerminal(question: string, notice: string): boolean {
  process.stdout.write(`${notice}\n${question} (Y/n) `)
  const buf = Buffer.alloc(256)
  let answer = ''
  while (!answer.includes('\n')) {
    const n = readSync(0, buf, 0, buf.length, null)
    if (n === 0) return false
    answer += buf.toString('utf8', 0, n)
  }
  const a = answer.trim().toLowerCase()
  return a === '' || a === 'y' || a === 'yes'
}

/**
 * The update receipt's IDE restart line for the detected harnesses, or
 * undefined when none of their rows sets `requiresIdeRestart`. `table` is a
 * test seam for rows the shipped table does not carry.
 */
export function updateRestartLine(
  harnesses: readonly string[],
  table?: readonly HarnessAdapter[],
  delivery: Delivery = 'both',
): string | undefined {
  return ideRestartLine(
    harnesses.map((h) => adapterFor(h, table)),
    delivery,
  )
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

/** The receipt's `Failed:` block, one line per file `generate()` could not write; empty when none. */
export function failedLines(failed: readonly FailedWrite[]): string[] {
  if (failed.length === 0) return []
  return ['Failed:', ...failed.map((f) => `  ${f.path}  ${f.error}`)]
}

function renderHuman(
  results: WriteResult[],
  opts: {
    check: boolean
    harnesses: HarnessName[]
    hadManifest: boolean
    movesPending: boolean
    failed: boolean
  },
): void {
  const changed = results.filter((r) => DRIFT_OUTCOMES.has(r.outcome))
  if (changed.length === 0) {
    // The legacy-root and `Failed:` lines that follow say what changed (or would, or could not).
    if (opts.movesPending || opts.failed) return
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
