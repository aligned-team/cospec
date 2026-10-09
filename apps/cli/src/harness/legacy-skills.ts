// Non-destructive migration of cospec's Codex skills out of the legacy
// `.codex/skills/` root and into the vendor-neutral `.agents/skills/` root that
// OpenSpec 1.11.0 and every AGENTS.md-aware assistant read.
//
// This is a separate step, not something `removeOrphanMarkdown` can do: that
// scan only visits skill bases derived from the CURRENT render, so `.codex/skills`
// dropped out of its scope the moment the codex path template changed.
//
// Safety rules, in order of importance:
//   - only files at exactly `<legacy root>/cospec-*/SKILL.md` are ever deleted;
//     the roots are compile-time constants, never manifest keys;
//   - a file is deleted only when it still hashes to its own stamped
//     `contentHash` (i.e. the user never edited it) or `--force` was passed;
//   - a file cospec did not author is left alone and not even reported;
//   - a legacy skill with no freshly rendered replacement is never deleted;
//   - directories go away via `rmdir`-if-empty, never a recursive remove, so a
//     stray user file in `.codex/skills/` keeps the whole tree alive.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import {
  computeContentHash,
  MANAGED_AUTHOR,
  splitFrontmatter,
  type WriteResult,
} from '../core/managed-files.ts'
import { HARNESS_TABLE, type HarnessAdapter, SKILL_FILE } from './adapters.ts'

/** Where cospec's Codex skills used to be written (cospec <= 0.6.0). */
export const LEGACY_CODEX_SKILL_ROOT = '.codex/skills'

/** Where they live now — shared with the `agents` target, byte for byte. */
export const SHARED_SKILL_ROOT = '.agents/skills'

export interface MigrateOptions {
  dryRun: boolean
  force: boolean
}

/**
 * Move cospec's legacy `.codex/skills/cospec-*` install to `.agents/skills`.
 * Runs AFTER generation, and only when this run actually rendered shared-root
 * skills — a fresh canonical copy always exists before anything legacy is
 * touched, so the "move" is a delete of a now-redundant duplicate.
 *
 * `emitted` is the set of repo-relative markdown paths this run rendered.
 */
export function migrateLegacySkills(
  cwd: string,
  emitted: ReadonlySet<string>,
  opts: MigrateOptions,
): WriteResult[] {
  const legacyRoot = join(cwd, LEGACY_CODEX_SKILL_ROOT)
  if (!existsSync(legacyRoot)) return []
  if (!renderedSharedSkills(emitted)) return []

  const out: WriteResult[] = []
  const entries = readdirSync(legacyRoot, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith('cospec-')) continue
    const relpath = `${LEGACY_CODEX_SKILL_ROOT}/${entry.name}/${SKILL_FILE}`
    const abspath = join(cwd, relpath)
    if (!existsSync(abspath)) continue

    const text = readFileSync(abspath, 'utf8')
    const meta = readManagedMeta(text)
    // Foreign: not ours to move, not ours to report.
    if (meta.author !== MANAGED_AUTHOR || meta.contentHash === undefined) continue

    // No replacement was rendered for this skill (a workflow this version
    // dropped). Never delete without a replacement; report it so the user is
    // told the file is still sitting in a legacy location.
    if (!emitted.has(`${SHARED_SKILL_ROOT}/${entry.name}/${SKILL_FILE}`)) {
      out.push({ path: relpath, outcome: 'preserved-modified' })
      continue
    }

    const { body } = splitFrontmatter(text)
    if (opts.force || computeContentHash(body) === meta.contentHash) {
      if (!opts.dryRun) {
        rmSync(abspath)
        rmdirIfEmpty(join(legacyRoot, entry.name))
      }
      out.push({ path: relpath, outcome: 'removed' })
      continue
    }
    out.push({ path: relpath, outcome: 'preserved-modified' })
  }

  // `.codex/skills` only — never `.codex/` itself, which still holds
  // `.codex/rules/cospec.rules`.
  if (!opts.dryRun) rmdirIfEmpty(legacyRoot)
  return out
}

function renderedSharedSkills(emitted: ReadonlySet<string>): boolean {
  for (const path of emitted) {
    if (path.startsWith(`${SHARED_SKILL_ROOT}/cospec-`)) return true
  }
  return false
}

function rmdirIfEmpty(abspath: string): void {
  if (!existsSync(abspath)) return
  if (readdirSync(abspath).length > 0) return
  rmdirSync(abspath)
}

interface ManagedMeta {
  author?: string
  contentHash?: string
}

function readManagedMeta(text: string): ManagedMeta {
  const { frontmatter } = splitFrontmatter(text)
  const meta = frontmatter?.metadata
  if (meta === null || typeof meta !== 'object') return {}
  const record = meta as Record<string, unknown>
  return {
    author: typeof record.author === 'string' ? record.author : undefined,
    contentHash: typeof record.contentHash === 'string' ? record.contentHash : undefined,
  }
}

// --- legacy tool roots (upstream `LEGACY_TOOL_ROOTS`, design decision 9) ------------
//
// A port of the pinned binary's `migrateLegacyToolDirs`: OpenSpec-managed files a renamed
// tool left under its former root (`.kimi`, `.windsurf`, `.codex`, `.agent`) move to the
// row's current `skillsDir`. Only upstream's own file names move — `openspec-<skill>/SKILL.md`
// and `opsx-<command>` at the row's command path with the root segment swapped — so a user's
// file under the old root stays. The files moved are OpenSpec's, not cospec's: the leftover
// scan reports them at their new location afterwards, and `--remove-opsx` removes them.

/** Upstream's `WORKFLOW_TO_SKILL_DIR` values: the skill dirs OpenSpec writes. */
export const OPENSPEC_SKILL_DIRS = [
  'openspec-explore',
  'openspec-new-change',
  'openspec-continue-change',
  'openspec-apply-change',
  'openspec-update-change',
  'openspec-ff-change',
  'openspec-sync-specs',
  'openspec-archive-change',
  'openspec-bulk-archive-change',
  'openspec-verify-change',
  'openspec-onboard',
  'openspec-propose',
] as const

/** Upstream's `COMMAND_IDS`, index for index the workflow of `OPENSPEC_SKILL_DIRS`. */
const OPENSPEC_COMMAND_IDS = [
  'explore',
  'new',
  'continue',
  'apply',
  'update',
  'ff',
  'sync',
  'archive',
  'bulk-archive',
  'verify',
  'onboard',
  'propose',
] as const

/** cospec's command id for an upstream one (cospec spells `sync` as `sync-specs`). */
const cospecCommandId = (id: string): string => (id === 'sync' ? 'sync-specs' : id)

export type LegacyMoveTiming = 'before-generation' | 'after-generation'

/** One file a legacy-root move handled, repo-relative. */
export interface LegacyMoveEntry {
  path: string
  /**
   * `moved` to `to`; `removed` because `to` already held the same file; `preserved-modified`
   * because `to` holds a different one (both kept); `declined` when `update`'s question was
   * answered no.
   */
  outcome: 'moved' | 'removed' | 'preserved-modified' | 'declined'
  to: string
}

/** What one row's legacy root move did (or, in a dry run, would do). Upstream's record. */
export interface LegacyToolMove {
  toolId: string
  from: string
  to: string
  needsConsent: boolean
  consentNotice?: string
  /** Skill files moved or dropped. */
  skillDirs: number
  /** Command files moved or dropped. */
  commandFiles: number
  /** OpenSpec files left under the legacy root because the destination differs. */
  keptInPlace: number
  declined: boolean
  entries: LegacyMoveEntry[]
}

export interface LegacyMoveOptions {
  timing: LegacyMoveTiming
  /** Restrict to these rows. Absent: every row, and when applying only roots needing no consent. */
  toolIds?: readonly string[]
  dryRun: boolean
  /**
   * After generation: the repo-relative paths this run rendered. A legacy file moves only once
   * cospec's replacement for its workflow is among them, as upstream moves only once its own
   * replacement is on disk; otherwise the move would resurrect a workflow the tool no longer has.
   */
  emitted?: ReadonlySet<string>
  /** Test seam for rows the shipped table does not carry. */
  table?: readonly HarnessAdapter[]
}

/** Move (or, dry, report) OpenSpec-managed files out of each row's legacy tool roots. */
export function moveLegacyToolRoots(cwd: string, opts: LegacyMoveOptions): LegacyToolMove[] {
  const moves: LegacyToolMove[] = []
  const table: readonly HarnessAdapter[] = opts.table ?? HARNESS_TABLE
  for (const row of table) {
    if (row.skillsDir === undefined) continue
    if (opts.toolIds !== undefined && !opts.toolIds.includes(row.id)) continue
    for (const legacy of row.legacyToolRoots ?? []) {
      if ((legacy.timing ?? 'before-generation') !== opts.timing) continue
      if (legacy.root === row.skillsDir) continue
      if (!opts.dryRun && opts.toolIds === undefined && legacy.needsConsent) continue
      const legacyAbs = join(cwd, legacy.root)
      if (!existsSync(legacyAbs)) continue
      if (!withinProject(cwd, legacyAbs) || !withinProject(cwd, join(cwd, row.skillsDir))) {
        process.stderr.write(
          `cospec: skipping legacy ${legacy.root}/ migration because the directory resolves outside this project\n`,
        )
        continue
      }
      const move: LegacyToolMove = {
        toolId: row.id,
        from: legacy.root,
        to: row.skillsDir,
        needsConsent: legacy.needsConsent,
        ...(legacy.consentNotice === undefined ? {} : { consentNotice: legacy.consentNotice }),
        skillDirs: 0,
        commandFiles: 0,
        keptInPlace: 0,
        declined: false,
        entries: [],
      }
      const after = opts.timing === 'after-generation'
      for (const dirName of OPENSPEC_SKILL_DIRS) {
        const replacement = `${row.skillsDir}/skills/${dirName.replace(/^openspec-/, 'cospec-')}/${SKILL_FILE}`
        if (after && !(opts.emitted?.has(replacement) ?? false)) continue
        const entry = moveOne(cwd, {
          from: `${legacy.root}/skills/${dirName}/${SKILL_FILE}`,
          to: `${row.skillsDir}/skills/${dirName}/${SKILL_FILE}`,
          dryRun: opts.dryRun,
        })
        if (entry === undefined) continue
        move.entries.push(entry)
        if (entry.outcome === 'preserved-modified') move.keptInPlace++
        else move.skillDirs++
      }
      for (const [upstreamPath, cospecPath] of commandPaths(row)) {
        const legacyPath = swapRoot(upstreamPath, row.skillsDir, legacy.root)
        if (legacyPath === undefined) continue
        if (after && !(opts.emitted?.has(cospecPath) ?? false)) continue
        const entry = moveOne(cwd, { from: legacyPath, to: upstreamPath, dryRun: opts.dryRun })
        if (entry === undefined) continue
        move.entries.push(entry)
        if (entry.outcome === 'preserved-modified') move.keptInPlace++
        else move.commandFiles++
      }
      if (!opts.dryRun) {
        rmdirIfEmpty(join(legacyAbs, 'skills'))
        rmdirIfEmpty(join(legacyAbs, 'workflows'))
        rmdirIfEmpty(legacyAbs)
      }
      // A kept-only record is reported too: dropping it would leave two divergent copies
      // the user never hears about.
      if (move.entries.length > 0) moves.push(move)
    }
  }
  return moves
}

/** Whether `update` may ask its consent question: a terminal on both ends, no --json, no --force. */
export function canAskLegacyConsent(t: {
  stdinIsTTY: boolean
  stdoutIsTTY: boolean
  json: boolean
  force: boolean
}): boolean {
  return t.stdinIsTTY && t.stdoutIsTTY && !t.json && !t.force
}

/**
 * `update`'s consent-gated moves (`.windsurf`): asked when `interactive`, moved otherwise, as
 * upstream's `offerConsentedLegacyMoves` does. A "no" records the move as declined and leaves
 * every file in place. `ask` receives the question and upstream's notice explaining it.
 */
export function consentLegacyMoves(
  cwd: string,
  opts: {
    interactive: boolean
    ask: (question: string, notice: string) => boolean
    table?: readonly HarnessAdapter[]
  },
): LegacyToolMove[] {
  const out: LegacyToolMove[] = []
  const pending = moveLegacyToolRoots(cwd, {
    timing: 'before-generation',
    dryRun: true,
    table: opts.table,
  }).filter((m) => m.needsConsent)
  for (const found of pending) {
    if (!hasMovableContent(found)) {
      out.push(found)
      continue
    }
    if (opts.interactive) {
      const question = `Move ${describeMove(found)} from ${found.from}/ to ${found.to}/?`
      if (!opts.ask(question, consentNotice(found))) {
        out.push({
          ...found,
          declined: true,
          entries: found.entries.map((e) =>
            e.outcome === 'preserved-modified' ? e : { ...e, outcome: 'declined' },
          ),
        })
        continue
      }
    }
    out.push(
      ...moveLegacyToolRoots(cwd, {
        timing: 'before-generation',
        toolIds: [found.toolId],
        dryRun: false,
        table: opts.table,
      }),
    )
  }
  return out
}

/** The receipt lines for legacy-root moves, in upstream's wording. */
export function legacyMoveLines(moves: readonly LegacyToolMove[], check: boolean): string[] {
  const lines: string[] = []
  for (const m of moves) {
    if (m.declined) {
      lines.push(
        `Left in place: ${describeMove(m)} in ${m.from}/ stays where it is until you move it. ` +
          'You will be asked again next run.',
      )
    } else if (hasMovableContent(m)) {
      lines.push(`${check ? 'Would migrate' : 'Migrated'} ${describeMove(m)}: ${m.from} → ${m.to}`)
    }
    if (m.keptInPlace > 0) {
      const n = m.keptInPlace
      lines.push(
        `Left ${n} file${n === 1 ? '' : 's'} in ${m.from}/ that differ${n === 1 ? 's' : ''} ` +
          `from the copy in ${m.to}/. Nothing was overwritten — compare the two and delete ` +
          `the ${m.from}/ copy once you have kept anything you customized.`,
      )
    }
  }
  return lines
}

/** The `--json` `migration` entries for legacy-root moves. */
export function legacyMoveEntries(moves: readonly LegacyToolMove[]): LegacyMoveEntry[] {
  return moves.flatMap((m) => m.entries)
}

/** Whether a move relocated (or would relocate) any file, as opposed to only keeping some. */
export function hasMovableContent(m: LegacyToolMove): boolean {
  return m.skillDirs > 0 || m.commandFiles > 0
}

function describeMove(m: LegacyToolMove): string {
  const parts: string[] = []
  if (m.skillDirs > 0) parts.push(`${m.skillDirs} skill${m.skillDirs === 1 ? '' : 's'}`)
  if (m.commandFiles > 0) {
    parts.push(`${m.commandFiles} command${m.commandFiles === 1 ? '' : 's'}`)
  }
  return parts.join(' and ')
}

/** Upstream's `legacyMigrationNotice`: the root's own notice, else the generic sentence. */
function consentNotice(m: LegacyToolMove): string {
  return m.consentNotice ?? `${m.from}/ is the former location for this tool; ${m.to}/ is current.`
}

/**
 * Each upstream command path for a row (`opsx` for `cospec` in its file template, upstream's
 * command ids) beside the cospec path that replaces it.
 */
function commandPaths(row: HarnessAdapter): [string, string][] {
  const c = row.commands
  if (c === undefined) return []
  const upstreamFile = c.file.replace(/^cospec/, 'opsx')
  return OPENSPEC_COMMAND_IDS.map((id) => [
    `${c.dir}/${upstreamFile.replace('{command}', id)}${c.extension}`,
    `${c.dir}/${c.file.replace('{command}', cospecCommandId(id))}${c.extension}`,
  ])
}

/** Upstream's `legacyCommandPath`: undefined when the path does not start at the tool root. */
function swapRoot(path: string, currentRoot: string, legacyRoot: string): string | undefined {
  const segments = path.split('/')
  if (segments[0] !== currentRoot) return undefined
  segments[0] = legacyRoot
  return segments.join('/')
}

function moveOne(
  cwd: string,
  file: { from: string; to: string; dryRun: boolean },
): LegacyMoveEntry | undefined {
  const source = join(cwd, file.from)
  if (!existsSync(source)) return undefined
  const destination = join(cwd, file.to)
  if (!withinProject(cwd, source) || !withinProject(cwd, destination)) {
    process.stderr.write(
      `cospec: skipping legacy ${file.from} migration because it resolves outside this project\n`,
    )
    return undefined
  }
  if (samePath(source, destination)) return undefined
  let outcome: LegacyMoveEntry['outcome'] = 'moved'
  if (existsSync(destination)) {
    outcome = equivalent(source, destination) ? 'removed' : 'preserved-modified'
  }
  if (!file.dryRun && outcome !== 'preserved-modified') {
    // The file moves, never the directory around it: a user's file beside it stays.
    if (outcome === 'removed') rmSync(source)
    else {
      mkdirSync(dirname(destination), { recursive: true })
      renameSync(source, destination)
    }
    rmdirIfEmpty(dirname(source))
  }
  return { path: file.from, outcome, to: file.to }
}

/** Upstream's `classifyManagedFile` equality: the same bytes, or the same generated skill. */
function equivalent(source: string, destination: string): boolean {
  const a = readFileSync(source, 'utf8')
  const b = readFileSync(destination, 'utf8')
  if (a === b) return true
  return (
    basename(source) === SKILL_FILE &&
    basename(destination) === SKILL_FILE &&
    legacySkillEquivalent(a, b)
  )
}

const GENERATED_VERSION =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** Upstream's `normalizeGeneratedSkill`: line endings, BOM and a generated version. */
function normalizeGeneratedSkill(content: string): string {
  const normalized = content.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(normalized)?.[0]
  if (frontmatter === undefined) return normalized
  const versionLine = /^([ \t]*generatedBy:[ \t]*)(?:"([^"\n]+)"|'([^'\n]+)'|([^\s"'#]+))[ \t]*$/m
  const fm = frontmatter.replace(
    versionLine,
    (line, prefix: string, dq?: string, sq?: string, bare?: string) => {
      const version = dq ?? sq ?? bare
      return version !== undefined && GENERATED_VERSION.test(version)
        ? `${prefix}"<generated-version>"`
        : line
    },
  )
  return fm + normalized.slice(frontmatter.length)
}

const OPENSPEC_SKILL_NAME_SET = new Set<string>(OPENSPEC_SKILL_DIRS)

/** Upstream's `isLegacyCodexSkillEquivalentToCurrent`. */
function legacySkillEquivalent(legacy: string, current: string): boolean {
  const l = normalizeGeneratedSkill(legacy)
  const c = normalizeGeneratedSkill(current)
  const asLegacyRefs = c.replace(
    /\$(openspec-[a-z0-9-]+) \(Codex\) or \/\1 \(other agents\)/g,
    (match, name: string) => (OPENSPEC_SKILL_NAME_SET.has(name) ? `$${name}` : match),
  )
  return l === c || l === asLegacyRefs
}

const errnoCode = (error: unknown): unknown => (error as NodeJS.ErrnoException).code

/** Two paths naming one file once symlinks resolve (`ln -s .devin .windsurf`). */
function samePath(a: string, b: string): boolean {
  if (!existsSync(a) || !existsSync(b)) return false
  return realpathSync.native(a) === realpathSync.native(b)
}

/**
 * Upstream's `canonicalizePotentialPath`: the real path of the nearest existing ancestor plus
 * the missing rest; undefined for a dangling symlink, which cannot be proven confined.
 */
function canonical(abs: string): string | undefined {
  const missing: string[] = []
  let at = abs
  for (;;) {
    let exists = true
    try {
      lstatSync(at)
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT' && errnoCode(error) !== 'ENOTDIR') throw error
      exists = false
    }
    if (exists) {
      try {
        return resolve(realpathSync.native(at), ...missing)
      } catch (error) {
        if (errnoCode(error) === 'ENOENT' || errnoCode(error) === 'ELOOP') return undefined
        throw error
      }
    }
    const up = dirname(at)
    if (up === at) return undefined
    missing.unshift(basename(at))
    at = up
  }
}

function withinProject(cwd: string, abs: string): boolean {
  const target = canonical(abs)
  if (target === undefined) return false
  const rel = relative(realpathSync.native(cwd), target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

// --- global prompts (upstream `LEGACY_GLOBAL_SLASH_COMMAND_PATHS`, design decision 13) -----

/** An OpenSpec prompt outside the project, and the cospec skill that replaces it. */
export interface GlobalPromptLeftover {
  /** Absolute. */
  path: string
  /** Repo-relative path of the replacement skill; the prompt goes only once it was emitted. */
  replacement: string
}

/**
 * Upstream's allowlisted global prompts for each selected row that has them: the twelve
 * `opsx-<workflow>.md` names in the resolved prompts dir, nothing else there. The names and
 * the directory are upstream's rule; content is not read.
 */
export function findGlobalPromptLeftovers(
  harnesses: readonly string[],
  opts: { env?: NodeJS.ProcessEnv; table?: readonly HarnessAdapter[] } = {},
): GlobalPromptLeftover[] {
  const table: readonly HarnessAdapter[] = opts.table ?? HARNESS_TABLE
  const out: GlobalPromptLeftover[] = []
  for (const row of table) {
    const prompts = row.legacyGlobalPrompts
    if (prompts === undefined || row.skillsDir === undefined || !harnesses.includes(row.id)) {
      continue
    }
    const dir = globalPromptDir(prompts, opts.env ?? process.env)
    for (const [i, id] of OPENSPEC_COMMAND_IDS.entries()) {
      const path = join(dir, `opsx-${id}.md`)
      if (!existsSync(path) || !lstatSync(path).isFile()) continue
      const skillDir = OPENSPEC_SKILL_DIRS[i]!.replace(/^openspec-/, 'cospec-')
      out.push({ path, replacement: `${row.skillsDir}/skills/${skillDir}/${SKILL_FILE}` })
    }
  }
  return out
}

/** Upstream's `getCodexPromptDir`, generalised over the row's variable and fallback. */
function globalPromptDir(
  prompts: { readonly env: string; readonly fallback: string },
  env: NodeJS.ProcessEnv,
): string {
  const fromEnv = env[prompts.env]?.trim()
  const home = fromEnv === undefined || fromEnv === '' ? join(homedir(), prompts.fallback) : fromEnv
  return join(resolve(home), 'prompts')
}
