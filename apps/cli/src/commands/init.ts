// `cospec init [path]` (DESIGN §2.1). Detects the repo state (A fresh / B
// existing-no-openspec / C existing-openspec), scaffolds `openspec/`, composes
// and writes the 11 schemas + harness files through the shared managed-file
// engine (update.ts / §6.5), writes `config.yaml` only when no config file exists, optionally
// scaffolds the commit gate (§7), additively merges Claude permissions (§6.4),
// detects/removes leftover opsx files (§6.6), and prints the receipt. Every
// write is idempotent: a second `init` returns `unchanged` for every file and
// leaves the tree clean.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { canonFile } from '../canon/embedded.ts'
import type { CommandContext } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import {
  flagSpelling,
  flagValue,
  hasFlag,
  lastFlagOf,
  type ParsedArgs,
} from '../core/command-table.ts'
import { isolatedWriteFailure } from '../core/errno.ts'
import { readGlobalProfile } from '../core/global-profile.ts'
import { languageDirective, languageRefusal, normalizeLanguage } from '../core/init-language.ts'
import { askLine, isInteractive } from '../core/interactive.ts'
import { splitFrontmatter, type WriteResult } from '../core/managed-files.ts'
import {
  adapterFor,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  HARNESS_NAMES,
  isHarnessName,
  isLegacyCommandPath,
  legacyCommandDirs,
  legacyCommandRoots,
  legacySkillsRoots,
  scanRoots,
  SKILL_EXTENSION,
  SKILL_FILE,
  skillsRoot,
  resolveHarnessIdAlias,
  respellInvocationHint,
  universalHarnessHint,
} from '../harness/adapters.ts'
import {
  copilotCloudDirective,
  copilotCloudReceiptLines,
  copilotSelected,
  copilotSucceeded,
  COPILOT_CLOUD_IGNORED_FLAG,
  decideCopilotCloud,
  emptyCopilotCloudReport,
  persistCopilotCloudOptIn,
  resolveConfigFilePath,
} from '../harness/copilot-cloud.ts'
import {
  type Delivery,
  generatesSurface,
  hintSpelling,
  ideRestartLine,
  shouldGenerateCommands,
  shouldGenerateSkills,
  skillsRootGenerated,
  zeroArtifactLine,
} from '../harness/delivery.ts'
import { homeSkillsDir } from '../harness/home-root.ts'
import {
  findLegacyConfigBlocks,
  type LegacyConfigBlock,
  stripLegacyConfigBlocks,
} from '../harness/legacy-config-blocks.ts'
import {
  findGlobalPromptLeftovers,
  type GlobalPromptLeftover,
  legacyMoveEntries,
  legacyMoveLines,
  type LegacyToolMove,
  moveLegacyToolRoots,
} from '../harness/legacy-skills.ts'
import { mergeMiseToml, type MiseMergeResult } from '../harness/mise-merge.ts'
import { isOpenCodeOpsxCommand, OPENCODE_COMMANDS_PREFIX } from '../harness/opencode-opsx.ts'
import { readWorkflowManifest, skillByWorkflowId } from '../harness/render.ts'
import { isInsideNestedCheckout, isOutsideProject, walkProjectFiles } from '../harness/scan-walk.ts'
import {
  COSPEC_PERMISSION,
  mergeClaudeSettings,
  type SettingsMergeResult,
} from '../harness/settings-merge.ts'
import { availableHarnesses, withSharedRootOwners } from '../harness/shared-root.ts'
import {
  isProfile,
  type Profile,
  selectWorkflows,
  type WorkflowSelection,
  workflowsLine,
} from '../harness/workflow-set.ts'
import {
  detectHarnesses,
  emittedPaths,
  type FailedWrite,
  failedLines,
  generate,
  migrationLines,
} from './update.ts'

// --- repo state -------------------------------------------------------------

type RepoState = 'A' | 'B' | 'C'

function detectState(cwd: string): RepoState {
  if (existsSync(openspecDir(cwd))) return 'C'
  if (existsSync(join(cwd, 'package.json'))) return 'B'
  return 'A'
}

/**
 * True iff `cwd` has a `mise.toml` whose `[tasks]` table already carries a
 * `"cospec:*"` entry — i.e. the gate was adopted previously. Re-init should
 * keep an adopted gate synced without requiring `--gate` on every call; a repo
 * that never adopted the gate must stay opt-in (never auto-enabled on re-init).
 */
function gateAlreadyPresent(cwd: string): boolean {
  const misePath = join(cwd, 'mise.toml')
  if (!existsSync(misePath)) return false
  let parsed: object
  try {
    parsed = Bun.TOML.parse(readFileSync(misePath, 'utf8'))
  } catch {
    return false
  }
  const tasks = (parsed as Record<string, unknown>).tasks
  if (typeof tasks !== 'object' || tasks === null || Array.isArray(tasks)) return false
  return Object.keys(tasks).some((k) => k.startsWith('cospec:'))
}

// --- harness selection ------------------------------------------------------

interface HarnessSelection {
  harnesses: HarnessName[]
  /** Non-null when the default was auto-applied (printed as a note). */
  note?: string
  /** Set when selection is impossible; caller exits 1. */
  error?: string
}

/**
 * The harnesses a `--harness`/`--tools` list selects, read as upstream's
 * `resolveToolsArg` reads `--tools`: the value trimmed, `all`/`none` and each
 * comma-separated name matched case-insensitively, a retired id resolved first. An empty list
 * is refused with upstream's own sentence (naming the `spelling` the user typed), an unknown
 * name with cospec's list of the valid ones and upstream's pointer at `agents`.
 */
function parseHarnessArg(
  value: string,
  spelling: string,
): { harnesses: HarnessName[] } | { error: string } {
  const raw = value.trim()
  if (raw.length === 0)
    return {
      error: `The ${spelling} option requires a value. Use "all", "none", or a comma-separated list of tool IDs.`,
    }
  const lower = raw.toLowerCase()
  if (lower === 'all') return { harnesses: [...HARNESS_NAMES] }
  if (lower === 'none') return { harnesses: [] }
  const names = lower
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (names.length === 0)
    return {
      error: `The ${spelling} option requires at least one tool ID when not using "all" or "none".`,
    }
  const out: HarnessName[] = []
  for (const name of names) {
    // A retired id resolves to its current tool before it is checked, as upstream's
    // `resolveToolIdAlias` does, so a rebrand does not break a scripted `--harness windsurf`.
    const resolved = resolveHarnessIdAlias(name)
    if (!isHarnessName(resolved)) {
      const hint = universalHarnessHint(spelling)
      return {
        error: `invalid ${spelling} '${value}'; ${VALID_HARNESS_MSG}${hint === undefined ? '' : `\n${hint}`}`,
      }
    }
    if (!out.includes(resolved)) out.push(resolved)
  }
  return { harnesses: out }
}

const VALID_HARNESS_MSG = `valid values: ${[...HARNESS_NAMES, 'all', 'none'].join(', ')} (comma-separate for multiple, e.g. --harness ${HARNESS_NAMES.slice(0, 2).join(',')})`

/**
 * `spelling` is the flag the user typed the list with (`--harness`, or
 * upstream's `--tools`), so a refusal names what they wrote.
 */
function selectHarnesses(
  cwd: string,
  state: RepoState,
  arg: string | undefined,
  spelling: string,
): HarnessSelection {
  if (arg !== undefined) {
    const parsed = parseHarnessArg(arg, spelling)
    return 'error' in parsed ? { harnesses: [], error: parsed.error } : parsed
  }
  // A bare `.agents/` proves nothing (it commonly holds only an `AGENTS.md` source), and a
  // shared `.agents/skills` tree selects only the row it was written for.
  const detected = availableHarnesses(cwd) as HarnessName[]
  if (detected.length > 0) return { harnesses: detected }
  if (state === 'A') {
    return { harnesses: ['claude'], note: 'No harness detected; defaulting to claude.' }
  }
  return {
    harnesses: [],
    error: `no harness detected and no --harness given; ${VALID_HARNESS_MSG}`,
  }
}

// --- config.yaml ------------------------------------------------------------

const CONFIG_HEAD = `# openspec project config — owned by you, never regenerated by cospec.
# 'schema' is the default change type. Change types are conventional-commit types;
# create a change with 'cospec new <type> <slug>'.
schema: feat

`

// `--language` writes the directive as the context, as the binary's own scaffold does.
const CONFIG_CONTEXT_EXAMPLE = `# context: injected into every artifact's authoring instructions.
# context: |
#   One or two sentences of project-wide context for the agent.

`

const CONFIG_TAIL = `# rules: extra per-artifact constraints, keyed by artifact id (repo-wide, not per-type).
# rules:
#   proposal:
#     - Keep the proposal focused on a single capability.

# Per-operation guidance (optional)
# Add advisory guidance for how apply and archive work should be conducted.
# This is separate from artifact rules above.
# Example:
#   operations:
#     apply:
#       guidance:
#         - Keep test summaries concise
#     archive:
#       guidance:
#         - Summarize the archive outcome before finishing

# store: the registered store that holds this repo's planning, as one store id.
# Register one with 'cospec store setup' or 'cospec store register'.
# Example:
#   store: team-plans

# references: other stores this project reads, each a store id or an {id, remote} map
# ('remote' is where to clone the store from).
# Example:
#   references:
#     - shared-specs
#     - id: platform-plans
#       remote: https://github.com/example/platform-plans.git
`

/** The new project's `config.yaml`; `directive` (from `--language`) becomes its `context`. */
function configYaml(directive?: string): string {
  const context =
    directive === undefined
      ? CONFIG_CONTEXT_EXAMPLE
      : `context: |\n${directive
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}\n\n`
  return CONFIG_HEAD + context + CONFIG_TAIL
}

// --- gate scaffolding (§7) --------------------------------------------------

interface GateTarget {
  file: string
  tpl: string
}

// Whole-file configs with no additive-merge story: write if absent, else print
// the paste-ready snippet. mise.toml is handled separately — it is additively
// merged into an existing file (see mise-merge.ts).
const GATE_TARGETS: GateTarget[] = [
  { file: 'commitlint.config.mjs', tpl: 'commitlint.config.mjs.tpl' },
  { file: 'hk.pkl', tpl: 'hk.pkl.tpl' },
]

interface GateResult {
  /** Files created fresh (incl. mise.toml when it was absent). */
  written: string[]
  /** hk.pkl / commitlint (whole-file) → paste-ready snippet when already present. */
  snippets: { file: string; content: string }[]
  /** The mise.toml merge outcome, present only when a mise.toml already existed. */
  mise?: MiseMergeResult
}

function scaffoldGate(cwd: string): GateResult {
  const written: string[] = []
  const snippets: { file: string; content: string }[] = []
  for (const target of GATE_TARGETS) {
    // Resolve through the embedded registry, not join(import.meta.dir, ...):
    // the compiled standalone binary has no canon/ dir on disk, so a path-based
    // read ENOENTs there (the exact bug the embedded registry exists to fix).
    const content = readFileSync(canonFile(`gate/${target.tpl}`), 'utf8')
    const dest = join(cwd, target.file)
    if (existsSync(dest)) {
      snippets.push({ file: target.file, content })
    } else {
      writeFileSync(dest, content)
      written.push(target.file)
    }
  }

  // mise.toml: additively merge the template into an existing file. The
  // documented install flow ("add cospec to mise.toml, then cospec init") means
  // a mise.toml almost always exists, so write-if-absent alone left the gate
  // useless. Only write when the merge produced new content.
  const template = readFileSync(canonFile('gate/mise.toml.tpl'), 'utf8')
  const misePath = join(cwd, 'mise.toml')
  let mise: MiseMergeResult | undefined
  if (existsSync(misePath)) {
    mise = mergeMiseToml(readFileSync(misePath, 'utf8'), template)
    if (mise.content !== undefined) writeFileSync(misePath, mise.content)
    // An existing-but-empty mise.toml merges as 'created' (the whole template is
    // written): that is a real write and must be reported like any other, not
    // silently absorbed into the mise-only `gate.mise` sub-report.
    if (mise.status === 'created') written.push('mise.toml')
  } else {
    writeFileSync(misePath, template)
    written.push('mise.toml')
  }

  return { written, snippets, mise }
}

// --- opsx detection / removal (§6.6) ----------------------------------------

/** An openspec prompt outside the project, and whether this run removed it. */
interface HomeLeftover extends GlobalPromptLeftover {
  removed: boolean
}

/** A leftover openspec-generated ("opsx") file — never something cospec authored. */
export interface OpsxFile {
  relpath: string
}

/** Shared skills root openspec ≥1.8.0 writes Codex (and agents/zed/antigravity) skills into. */
export const OPSX_SHARED_SKILL_ROOT = '.agents/skills'

/**
 * The ownership marker the pinned binary writes in a shared skills root: the id of the tool
 * its own `openspec-*` skills were written for. cospec's marker is `.cospec-target`; this one
 * is the binary's and means nothing once its skills are gone.
 */
export const OPSX_TARGET_MARKER = `${OPSX_SHARED_SKILL_ROOT}/.openspec-target`

// The pinned binary's pre-opsx markers: every legacy slash command it wrote carries the pair.
const OPENSPEC_MARKERS = { start: '<!-- OPENSPEC:START -->', end: '<!-- OPENSPEC:END -->' }

// Every command and skill the pinned binary writes carries its project-root guard, which names
// this command whatever the wrapper: YAML, a Markdown header, TOML or none.
const ROOT_GUARD_REFERENCE = '`openspec list --json`'

/**
 * Provenance, never the path, decides what is a leftover: a file is opsx only when its own
 * content proves openspec wrote it (DESIGN §2.1/§6.6, "user-authored files never touched"). A
 * plain `.opencode/commands/opsx/notes.md` or `opsx-helper.md` a user wrote by hand carries no
 * proof and must never be deleted. The proof is one of:
 * - a skill's or command's frontmatter: `metadata.author: openspec` with a bare-semver
 *   `generatedBy`, or `name: "OPSX: …"`;
 * - for a file that is not a skill, the root guard `openspec list --json` (a command with no
 *   frontmatter, or one whose frontmatter carries no `name`), except under OpenCode's
 *   `.opencode/commands/`, where only the adapter's exact shape counts (`isOpenCodeOpsxCommand`:
 *   one of the 12 ids, description-only frontmatter, the guard's lead sentence);
 * - for a path a row's `legacyCommandPaths` names, the pre-opsx `<!-- OPENSPEC:START -->` /
 *   `<!-- OPENSPEC:END -->` pair, as upstream's `isGeneratedLegacyCommand` requires.
 * cospec's own files carry `author: cospec` and never any of the three.
 * `table` is a test seam for rows the shipped table does not carry.
 */
export function isOpsxLeftover(
  relpath: string,
  text: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  const { frontmatter } = splitFrontmatter(text)
  const meta = frontmatter?.metadata
  if (meta !== null && typeof meta === 'object') {
    const record = meta as Record<string, unknown>
    if (record.author === 'cospec') return false
    const gen = typeof record.generatedBy === 'string' ? record.generatedBy : ''
    // Skill files (SKILL.md) carry `metadata.author: openspec` + a bare-semver
    // `generatedBy` (e.g. 1.3.1, 1.5.0). cospec stamps its own files with
    // `author: cospec` (handled above) and a `cospec@x.y.z` tag, never a bare
    // semver, so any bare semver under an openspec author is a leftover opsx
    // file to clean up — matched by shape, not by a specific version.
    if (record.author === 'openspec' && /^\d+\.\d+\.\d+/.test(gen)) return true
  }
  // Command files (e.g. `.claude/commands/opsx/*.md`) carry `name: 'OPSX: …'`.
  const name = frontmatter?.name
  if (typeof name === 'string' && /^"?OPSX:/.test(name)) return true
  if (relpath.split('/').at(-1) === SKILL_FILE) return false
  // OpenCode's current command directory is decided by the adapter's own output shape alone: a
  // bare root-guard reference there is as likely a user's command as the binary's.
  if (relpath.startsWith(OPENCODE_COMMANDS_PREFIX)) {
    return isOpenCodeOpsxCommand(relpath, text)
  }
  if (text.includes(ROOT_GUARD_REFERENCE)) return true
  return (
    isLegacyCommandPath(relpath, table) &&
    text.includes(OPENSPEC_MARKERS.start) &&
    text.includes(OPENSPEC_MARKERS.end)
  )
}

/**
 * The openspec skills a home-scoped row left under its home skills dir, each with the absolute
 * cospec skill that replaces it. Provenance is `isOpsxLeftover`'s, the one predicate every
 * project-scope leftover uses. `rows` are the ids to read; a row with no home skills dir, or
 * whose dir does not exist, contributes nothing.
 */
export function homeSkillLeftovers(rows: readonly string[]): GlobalPromptLeftover[] {
  const out: GlobalPromptLeftover[] = []
  for (const row of HARNESS_TABLE) {
    const dir = homeSkillsDir(row)
    if (dir === undefined || !rows.includes(row.id) || !existsSync(dir)) continue
    for (const name of readdirSync(dir).toSorted()) {
      const file = join(dir, name, SKILL_FILE)
      if (!existsSync(file) || !lstatSync(file).isFile()) continue
      if (!isOpsxLeftover(`${name}/${SKILL_FILE}`, readFileSync(file, 'utf8'))) continue
      const replacement = join(dir, name.replace(/^openspec-/, 'cospec-'), SKILL_FILE)
      out.push({ path: file, replacement })
    }
  }
  return out
}

/** Removes a leftover home skill's now-empty `openspec-*` directory; never any other folder. */
function removeHomeSkillFile(path: string): void {
  rmSync(path)
  const dir = dirname(path)
  if (basename(dir).startsWith('openspec-') && readdirSync(dir).length === 0) rmdirSync(dir)
}

/**
 * Which files the opsx leftover scan reads. Wider than `isHarnessDocument`, because what
 * openspec wrote sits at its own paths (`.claude/commands/opsx/<id>.md`,
 * `.opencode/commands/opsx-<id>.md` in the pinned dist's command adapters): every
 * `SKILL_EXTENSION` file under a top-level dir holding a row's project or legacy skills
 * root, each row's files with its own `commands.extension` under its `commands.dir` whatever
 * its serializer (the `.toml`, `.prompt` and `.prompt.md` commands included), every
 * `SKILL_EXTENSION` file under the shared `.agents/skills` root, and every path a row's
 * `legacyCommandPaths` names. Provenance, never this path set, decides what is a leftover.
 */
export function isLeftoverCandidate(
  relpath: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  if (relpath === OPSX_TARGET_MARKER) return true
  if (relpath.startsWith(`${OPSX_SHARED_SKILL_ROOT}/`) && relpath.endsWith(SKILL_EXTENSION)) {
    return true
  }
  if (isLegacyCommandPath(relpath, table)) return true
  const top = relpath.split('/')[0]!
  return table.some((row) => {
    const skills = skillsRoot(row)
    const skillRoots = legacySkillsRoots(row)
    if (skills.scope === 'project') skillRoots.push(skills.root)
    if (
      relpath.endsWith(SKILL_EXTENSION) &&
      skillRoots.some((root) => root.split('/')[0] === top)
    ) {
      return true
    }
    const c = row.commands
    return c !== undefined && relpath.startsWith(`${c.dir}/`) && relpath.endsWith(c.extension)
  })
}

/**
 * The opsx leftover scan behind `init --remove-opsx`, `init --json`'s `opsx.found` and
 * doctor's `opsx-leftover`: every scan root, then the shared `.agents/skills` root
 * openspec ≥1.8.0 writes its Codex (and agents/zed/antigravity) skills to whichever rows
 * the table carries. `table` is a test seam for rows the shipped table does not carry.
 *
 * The walk never descends into a nested git working tree (a worktree checkout under, say,
 * `.claude/worktrees/<name>/`, or any other embedded clone): such a directory is a distinct
 * project with its own `cospec init --remove-opsx` to run, and a copy of a genuinely
 * openspec-authored file living inside it must never be listed or removed by the outer
 * scan. Only the directory boundary is pruned — the scan's acceptance (`isLeftoverCandidate`)
 * is unchanged.
 *
 * Nor does it ever follow a scan root (or the explicit `.agents/skills` walk) out of the
 * project: `isOutsideProject` is checked before `walk()` reads a root's directory, so a
 * symlinked `.claude`, `.agents`, or `.agents/skills` pointing elsewhere is never read.
 *
 * A directory that cannot be read for permission or path-type reasons is recorded in
 * `unreadable` when the caller passes one, so it is reported rather than hidden; without it
 * the error propagates. The walk reports it through `walkProjectFiles`' own callback.
 */
export function leftoverScanFiles(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
  unreadable?: FailedWrite[],
): { relpath: string; text: string }[] {
  // Keyed by relpath: `.agents` (a harness dir) strictly contains `.agents/skills`, so
  // the two walk ranges overlap and an unguarded scan would list every file there twice.
  const out = new Map<string, { relpath: string; text: string }>()
  walkProjectFiles(
    cwd,
    // The legacy command roots (`.windsurf`, `.qwen`, ...) are not scan roots: `scanRoots` also
    // feeds removal and sidecar walks, which must not reach a tool root cospec never wrote.
    [...new Set([...scanRoots(table), ...legacyCommandRoots(table)]), OPSX_SHARED_SKILL_ROOT],
    (relpath) => {
      if (!out.has(relpath) && isLeftoverCandidate(relpath, table)) {
        out.set(relpath, { relpath, text: readFileSync(join(cwd, relpath), 'utf8') })
      }
    },
    undefined,
    unreadable === undefined
      ? undefined
      : (relpath, error) => {
          const message = isolatedWriteFailure(error)
          if (message === undefined) throw error
          unreadable.push({ path: relpath, error: message })
        },
  )
  return [...out.values()]
}

/** A marker holds one tool id; anything else in that file is not the binary's. */
const TARGET_MARKER_CONTENT = /^[a-z0-9][a-z0-9-]*\s*$/

/**
 * The scanned files that are openspec leftovers. `isOpsxLeftover` decides each file alone; the
 * `.openspec-target` marker is the one file whose provenance is its path and shape, and it
 * names the owner of the binary's `openspec-*` skills, so it goes only once none of those
 * skills is left under the root for it to describe (one the user wrote stays, and keeps it).
 */
export function opsxLeftoverFiles(
  files: readonly { relpath: string; text: string }[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): { relpath: string; text: string }[] {
  const hits = files.filter(
    (f) => f.relpath !== OPSX_TARGET_MARKER && isOpsxLeftover(f.relpath, f.text, table),
  )
  const marker = files.find((f) => f.relpath === OPSX_TARGET_MARKER)
  if (marker === undefined || !TARGET_MARKER_CONTENT.test(marker.text)) return hits
  const removed = new Set(hits.map((f) => f.relpath))
  const skillsLeft = files.some(
    (f) =>
      f.relpath.startsWith(`${OPSX_SHARED_SKILL_ROOT}/openspec-`) &&
      f.relpath.split('/').at(-1) === SKILL_FILE &&
      !removed.has(f.relpath),
  )
  return skillsLeft ? hits : [...hits, marker]
}

/** `table` is a test seam for rows the shipped table does not carry. */
export function findOpsxFiles(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
  unreadable?: FailedWrite[],
): OpsxFile[] {
  // cospec writes its own `cospec-*` skills to `.agents/skills` too; the two prefixes
  // cannot collide, and `isOpsxLeftover` excludes anything cospec authored.
  return opsxLeftoverFiles(leftoverScanFiles(cwd, table, unreadable), table)
    .map(({ relpath }) => ({ relpath }))
    .toSorted((a, b) => a.relpath.localeCompare(b.relpath))
}

/**
 * Re-checks `isOutsideProject` right before every delete, independent of `leftoverScanFiles`'
 * own guard: removal must never trust the found-list alone to have stayed inside the project
 * (a defense-in-depth pairing with the walk-time check, not a replacement for it).
 * `table` is a test seam. A folder of a row's `legacyCommandPaths` directory entry goes once
 * nothing is left in it, as upstream's `settleLegacyCommandDir` does, never recursively:
 * whatever remains is the user's. A folder that is itself a link is never followed.
 */
function removeOpsxFiles(
  cwd: string,
  files: OpsxFile[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): void {
  const cwdReal = realpathSync(cwd)
  const dirs = new Set<string>()
  for (const f of files) {
    const abs = join(cwd, f.relpath)
    if (
      existsSync(abs) &&
      !isOutsideProject(cwdReal, abs) &&
      !isInsideNestedCheckout(cwd, cwdReal, abs)
    ) {
      rmSync(abs)
    }
    dirs.add(join(abs, '..'))
  }
  // Prune now-empty containing dirs (openspec-* skill dirs, opsx command dir).
  for (const dir of dirs) {
    if (
      existsSync(dir) &&
      !isOutsideProject(cwdReal, dir) &&
      !isInsideNestedCheckout(cwd, cwdReal, dir) &&
      readdirSync(dir).length === 0
    ) {
      rmSync(dir, { recursive: true })
    }
  }
  for (const rel of legacyCommandDirs(table)) {
    const abs = join(cwd, rel)
    if (
      existsSync(abs) &&
      lstatSync(abs).isDirectory() &&
      !isOutsideProject(cwdReal, abs) &&
      !isInsideNestedCheckout(cwd, cwdReal, abs) &&
      readdirSync(abs).length === 0
    ) {
      rmdirSync(abs)
    }
  }
}

// --- receipt ----------------------------------------------------------------

/**
 * The receipt's closing block: each selected row's `setupNote` in selection order, then
 * upstream's single IDE restart line when a selected row needs one. A note is dropped when
 * `delivery` writes none of the surface it is about for that row (a commands note under
 * delivery `skills`, a skills note when no row on its root gets skills), and the restart line
 * follows the same rule. `table` is a test seam for rows the shipped table does not carry.
 */
export function setupNoteLines(
  harnesses: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
  delivery: Delivery = 'both',
): string[] {
  const rows = harnesses.map((h) => adapterFor(h, table))
  const applies = (row: HarnessAdapter): boolean => {
    if (row.setupNoteSurface === 'commands') return shouldGenerateCommands(row, delivery)
    // Rows sharing a skills root share one tree, so a sibling that gets skills writes it.
    const root = skillsRoot(row)
    return rows.some((other) => {
      const at = skillsRoot(other)
      return (
        at.root === root.root && at.scope === root.scope && shouldGenerateSkills(other, delivery)
      )
    })
  }
  const lines = rows.flatMap((row) =>
    row.setupNote !== undefined && applies(row) ? [row.setupNote] : [],
  )
  const restart = ideRestartLine(rows, delivery)
  if (restart !== undefined) lines.push(restart)
  return lines
}

/**
 * One receipt line per skills root that two or more rows resolve to, printed
 * when any selected row writes there. It names every row on that root, in table
 * order, whether selected or not, and the one row the tree was written for
 * (`writers`, the arbiter's answer that `generate` returns; a configured owner kept beside
 * the selection counts). A root the `delivery` writes no skills into gets no line. `table` is
 * a test seam.
 */
export function sharedSkillsRootLines(
  harnesses: readonly string[],
  writers: ReadonlySet<string>,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
  delivery: Delivery = 'both',
): string[] {
  const byRoot = new Map<string, { root: string; ids: string[] }>()
  for (const row of table) {
    const { root, scope } = skillsRoot(row)
    const shown = scope === 'home' ? `~/${root}` : root
    const group = byRoot.get(shown) ?? { root: shown, ids: [] }
    group.ids.push(row.id)
    byRoot.set(shown, group)
  }
  return [...byRoot.values()]
    .filter(({ ids }) => ids.length > 1 && ids.some((id) => harnesses.includes(id)))
    .filter(({ ids }) =>
      skillsRootGenerated(
        ids
          .filter((id) => harnesses.includes(id) || writers.has(id))
          .map((id) => adapterFor(id, table)),
        delivery,
      ),
    )
    .map(({ root, ids }) => {
      // The writer may be a configured owner kept beside the selection, so it need not be
      // selected itself.
      const writer = ids.find((id) => writers.has(id))
      if (writer === undefined) throw new Error(`internal: no writer for the ${root} root`)
      return `         skills for ${ids.join('/')} share the ${root} root (one tree, written for ${writer})`
    })
}

/**
 * The receipt's closing hint lines, spelled the way the first selected row that generates
 * something invokes the workflow they name: through that row's body dialect and invocation
 * prefix, the respelling its generated bodies get (`hintSpelling` picks the surface the
 * delivery leaves it). The first selected row is the first id of an explicit list as typed,
 * else the first in table order; with none selected the canonical spelling stays. When rows
 * are selected but the delivery generates nothing for any of them, there is no start hint:
 * the zero-artifact line is the whole story, as in upstream.
 *
 * They name `propose` when the installed set holds it, else `new`, else the raw gated
 * command `cospec new feat <slug>` and a pointer at `config profile` (`workflows`: absent
 * means every workflow). `table` is a test seam for rows the shipped table does not carry.
 */
export function receiptHintLines(
  harnesses: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
  workflows?: ReadonlySet<string>,
  delivery: Delivery = 'both',
): string[] {
  const rows = harnesses.map((h) => adapterFor(h, table))
  const row = rows.find((r) => generatesSurface(r, delivery))
  if (rows.length > 0 && row === undefined) return []
  const has = (id: string): boolean => workflows === undefined || workflows.has(id)
  const lines = has('propose')
    ? [
        'Try: /cospec:propose "feat: <what you want to build>"',
        'Lightweight change? /cospec:propose "ci: fix release workflow" — 3 short artifacts.',
      ]
    : has('new')
      ? ['Try: /cospec:new "feat: <what you want to build>"']
      : [
          'Try: cospec new feat <slug>',
          "Done. Run 'cospec config profile' to configure your workflows.",
        ]
  if (row === undefined || lines.every((line) => !line.includes('/cospec:'))) return lines
  const skillById = skillByWorkflowId(readWorkflowManifest())
  const spelling = hintSpelling(row, delivery)
  return lines.map((line) => respellInvocationHint(line, row, skillById, spelling))
}

// --- command entrypoint -----------------------------------------------------

export async function run(ctx: CommandContext): Promise<number> {
  const parsed = ctx.parsed!
  const resolved = resolveTarget(ctx.cwd, parsed)
  if (!resolved.ok) {
    process.stderr.write(`${resolved.error}\n`)
    return 1
  }
  const target = resolved.target
  const flags = ctx.flags
  const yes = hasFlag(parsed, '--yes')
  const force = hasFlag(parsed, '--force')
  const removeOpsx = hasFlag(parsed, '--remove-opsx')
  const harnessArg = flagValue(parsed, '--harness')

  // Refused before any write, in the binary's order: the language value, the language against
  // the target, then the profile. The profile is explicit only when a flag or the global
  // file's own key says so.
  const languageArg = flagValue(parsed, '--language')
  let directive: string | undefined
  if (languageArg !== undefined) {
    const value = normalizeLanguage(languageArg)
    if (!value.ok) {
      process.stderr.write(`cospec: ${value.message}\n`)
      return 1
    }
    directive = languageDirective(value.language)
    const refusal = languageRefusal(target, directive)
    if (refusal !== undefined) {
      process.stderr.write(`cospec: ${refusal}\n`)
      return 1
    }
  }
  const profileArg = flagValue(parsed, '--profile')
  if (profileArg !== undefined && !isProfile(profileArg)) {
    process.stderr.write(
      `cospec: Invalid profile "${profileArg}". Available profiles: core, custom\n`,
    )
    return 1
  }
  const workflowSel = selectWorkflows(
    profileArg as Profile | undefined,
    await readGlobalProfile(ctx.cwd, { warn: true }),
  )

  const state = detectState(target)
  // A state-A (fresh) repo defaults the gate on; otherwise re-init resyncs an
  // already-adopted gate by default and stays opt-in when none was adopted —
  // see gateAlreadyPresent().
  const gateEnabled = hasFlag(parsed, '--gate')
    ? true
    : hasFlag(parsed, '--no-gate')
      ? false
      : state === 'A'
        ? true
        : gateAlreadyPresent(target)

  const notGitTree = !existsSync(join(target, '.git'))

  // Upstream's order: roots needing no consent move first, whichever tools are selected,
  // so a renamed tool's files sit where detection and generation look.
  const moves: LegacyToolMove[] = moveLegacyToolRoots(target, {
    timing: 'before-generation',
    dryRun: false,
  })

  const selection = selectHarnesses(target, state, harnessArg, flagSpelling(parsed, '--harness'))
  if (selection.error !== undefined) {
    process.stderr.write(`cospec: ${selection.error}\n`)
    return 1
  }
  const { harnesses } = selection

  // Whether to write GitHub Copilot's cloud files is decided before anything is written, as
  // upstream does, so the prompt and the ignored-flag notice come first.
  const cloudDecision = decideCopilotCloud({
    cwd: target,
    selected: copilotSelected(harnesses),
    flag: lastFlagOf(parsed, '--copilot-cloud', '--no-copilot-cloud'),
    harnessGiven: harnessArg !== undefined,
    json: flags.json,
    terminal: { interactive: isInteractive(), ask: (q) => askLine(`${q} (y/N)`) },
  })
  if (cloudDecision.ignoredFlag) {
    // `--json` keeps stdout one document; the notice goes to stderr with it.
    const notice = `${COPILOT_CLOUD_IGNORED_FLAG}\n`
    if (flags.json) process.stderr.write(notice)
    else process.stdout.write(notice)
  }

  // Scaffold the tree.
  mkdirSync(join(target, 'openspec', 'specs'), { recursive: true })
  mkdirSync(join(target, 'openspec', 'changes', 'archive'), { recursive: true })

  // Selecting a renamed tool is consent to leave its former root (`.windsurf`).
  moves.push(
    ...moveLegacyToolRoots(target, {
      timing: 'before-generation',
      toolIds: harnesses,
      dryRun: false,
    }),
  )

  // Schemas + harness files + manifest.
  // A selected row may share its skills root with a configured owner; the owner joins the
  // generation so the arbiter keeps its marker (design decision 6). Read before anything is
  // written, as `generate` reads the marker itself.
  const generated = withSharedRootOwners(target, harnesses, new Set(detectHarnesses(target)))
  const { results, failed, migration, skillWriters, cloud } = generate(target, {
    harnesses: generated as HarnessName[],
    force,
    cloud: copilotCloudDirective(cloudDecision),
    workflows: workflowSel.installed,
    delivery: workflowSel.delivery,
  })
  const emitted = emittedPaths(results)
  // After generation, so cospec's replacement exists before a legacy file moves.
  moves.push(
    ...moveLegacyToolRoots(target, {
      timing: 'after-generation',
      toolIds: harnesses,
      emitted,
      dryRun: false,
    }),
  )

  // config.yaml — only if neither config file exists (never modified once present). A
  // config.yml-only repo already has its config; a config.yaml beside it would shadow it.
  let configWritten = false
  if (resolveConfigFilePath(target) === undefined) {
    writeFileSync(join(target, 'openspec', 'config.yaml'), configYaml(directive))
    configWritten = true
  }

  // Only a decision made this run is remembered (a flag or an answered confirm), and only once
  // config.yaml exists, so a later `update`, which never asks, honors it.
  const cloudPersisted =
    cloudDecision.persist !== undefined && persistCopilotCloudOptIn(target, cloudDecision.persist)
      ? cloudDecision.persist
      : null
  const cloudReport = cloud ?? emptyCopilotCloudReport()
  const copilotOk = copilotSucceeded(
    harnesses,
    failed.map((f) => f.path),
  )

  // Gate.
  const gate = gateEnabled ? scaffoldGate(target) : undefined

  // Claude settings merge.
  let settings: SettingsMergeResult | undefined
  if (harnesses.includes('claude')) {
    const settingsPath = join(target, '.claude', 'settings.json')
    settings = mergeClaudeSettings(
      existsSync(settingsPath) ? readFileSync(settingsPath, 'utf8') : null,
    )
    if (settings.content !== undefined && settings.status !== 'unchanged') {
      mkdirSync(join(target, '.claude'), { recursive: true })
      writeFileSync(settingsPath, settings.content)
    }
  }

  // Opsx detection / removal.
  // A directory the scan cannot read is reported with the failed writes, unless a failed write
  // under it already names it.
  const unreadable: FailedWrite[] = []
  const opsx = findOpsxFiles(target, undefined, unreadable)
  failed.push(...unreadable.filter((u) => !failed.some((f) => f.path.startsWith(`${u.path}/`))))
  // The pre-opsx block in a root config file (CLAUDE.md, AGENTS.md, ...) is stripped under the
  // same consent, and the file is never deleted, as the binary's cleanup never deletes it.
  const legacyBlocks = findLegacyConfigBlocks(target)
  const opsxRemoved = (opsx.length > 0 || legacyBlocks.length > 0) && (removeOpsx || yes)
  const legacyStripped = new Set<string>()
  if (opsxRemoved) {
    removeOpsxFiles(target, opsx)
    for (const relpath of stripLegacyConfigBlocks(target, legacyBlocks)) legacyStripped.add(relpath)
  }
  // Outside the project: only the explicit flag removes them, and only once this run wrote
  // the skill that replaces each one.
  const homeOpsx: HomeLeftover[] = [
    ...findGlobalPromptLeftovers(harnesses),
    ...homeSkillLeftovers(harnesses),
  ].map((p) => {
    const removed = removeOpsx && emitted.has(p.replacement)
    if (removed) removeHomeSkillFile(p.path)
    return { path: p.path, replacement: p.replacement, removed }
  })

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          path: target,
          state,
          harnesses,
          profile: workflowSel.profile ?? null,
          delivery: workflowSel.delivery,
          gate: gate
            ? {
                written: gate.written,
                snippets: gate.snippets.map((s) => s.file),
                mise: gate.mise
                  ? {
                      status: gate.mise.status,
                      added: gate.mise.added,
                      conflicts: gate.mise.conflicts,
                    }
                  : null,
              }
            : null,
          config: { written: configWritten },
          copilotCloud: {
            tier: cloudDecision.tier,
            enabled: cloudDecision.write,
            persisted: cloudPersisted,
            ignoredFlag: cloudDecision.ignoredFlag,
            present: cloudDecision.write && copilotOk ? cloudReport.present : [],
            collisions: cloudDecision.write && copilotOk ? cloudReport.collisions : [],
            removed: cloudReport.removed,
            leftInPlace: cloudReport.leftInPlace,
          },
          settings: settings ? { status: settings.status, added: settings.added } : null,
          opsx: {
            found: [
              ...opsx.map((o) => o.relpath),
              ...legacyBlocks.map((b) => b.relpath),
              ...homeOpsx.map((h) => ({ path: h.path, scope: 'home', removed: h.removed })),
            ],
            removed: opsxRemoved,
          },
          notGitTree,
          files: results,
          failed,
          migration: [...migration, ...legacyMoveEntries(moves)],
        },
        null,
        2,
      )}\n`,
    )
    return failed.length > 0 ? 1 : 0
  }

  printReceipt(target, {
    state,
    harnesses,
    skillWriters,
    results,
    failed,
    migration,
    moves,
    configWritten,
    gate,
    settings,
    opsx,
    opsxRemoved,
    legacyBlocks,
    legacyStripped,
    homeOpsx,
    removeOpsx,
    notGitTree,
    autoNote: selection.note,
    workflows: workflowSel,
    cloudLines: copilotCloudReceiptLines(cloudDecision, cloudReport, copilotOk),
  })
  return failed.length > 0 ? 1 : 0
}

type TargetResolution = { ok: true; target: string } | { ok: false; error: string }

/**
 * The positional [path], already isolated from every flag by the shared
 * parser. A bare `help` positional is rejected outright — `cospec init help`
 * is almost always a typo for `cospec init --help`, and silently scaffolding a
 * directory literally named `help` would be a surprising, hard-to-notice
 * mutation. Anyone who really wants that directory can pass `./help`.
 */
function resolveTarget(cwd: string, parsed: ParsedArgs): TargetResolution {
  const pathArg = parsed.positionals[0]
  if (pathArg === 'help') {
    return {
      ok: false,
      error:
        "cospec: 'help' is not a path — did you mean 'cospec init --help'? " +
        "To scaffold into a directory literally named 'help', pass './help'.",
    }
  }
  return { ok: true, target: pathArg !== undefined ? resolve(cwd, pathArg) : cwd }
}

interface ReceiptData {
  state: RepoState
  harnesses: HarnessName[]
  skillWriters: ReadonlySet<string>
  results: WriteResult[]
  failed: FailedWrite[]
  migration: WriteResult[]
  moves: LegacyToolMove[]
  configWritten: boolean
  gate?: GateResult
  settings?: SettingsMergeResult
  opsx: OpsxFile[]
  opsxRemoved: boolean
  /** Root config files holding a pre-opsx block, and those whose content the strip changed. */
  legacyBlocks: LegacyConfigBlock[]
  legacyStripped: ReadonlySet<string>
  homeOpsx: HomeLeftover[]
  removeOpsx: boolean
  notGitTree: boolean
  autoNote?: string
  workflows: WorkflowSelection
  /** The Copilot cloud files' outcome (`copilotCloudReceiptLines`); empty for any other tool. */
  cloudLines: string[]
}

function printReceipt(target: string, d: ReceiptData): void {
  const lines: string[] = []
  const created = d.results.filter((r) => r.outcome === 'created').length
  const preserved = d.results.filter(
    (r) => r.outcome === 'preserved-modified' || r.outcome === 'preserved-foreign',
  )

  lines.push(`cospec initialized in ${target}  (state ${d.state})`)
  if (d.notGitTree) lines.push('  note: not a git work tree — hooks and drift gating assume git.')
  if (d.autoNote !== undefined) lines.push(`  ${d.autoNote}`)
  lines.push('')

  lines.push(`Schemas: 11 types in openspec/schemas/`)
  if (d.configWritten) lines.push('Config:  openspec/config.yaml (schema: feat)')
  if (created > 0) lines.push(`Files:   ${created} created`)
  if (preserved.length > 0) {
    lines.push(`Preserved: ${preserved.length} edited file(s) — new versions in .cospec-new`)
  }

  const workflowsNote = workflowsLine(d.workflows)
  if (workflowsNote !== undefined) lines.push(workflowsNote)

  if (d.harnesses.length > 0) {
    lines.push(`Harness: ${d.harnesses.join(', ')}`)
    lines.push(
      ...sharedSkillsRootLines(d.harnesses, d.skillWriters, HARNESS_TABLE, d.workflows.delivery),
    )
  } else {
    lines.push('Harness: none (schemas only)')
  }

  if (d.settings !== undefined) {
    if (d.settings.status === 'unparseable') {
      lines.push('')
      lines.push('.claude/settings.json is not valid JSON — add this permission yourself:')
      lines.push(indent(d.settings.snippet))
    } else if (d.settings.added.length > 0) {
      lines.push(`Permissions: merged ${COSPEC_PERMISSION} into .claude/settings.json`)
    }
  }

  if (d.gate !== undefined) {
    if (d.gate.written.length > 0) lines.push(`Gate:    wrote ${d.gate.written.join(', ')}`)
    // hk.pkl / commitlint are whole-file configs: absent → written above,
    // present → paste-ready snippet (there is no additive-merge story for them).
    for (const snippet of d.gate.snippets) {
      lines.push('')
      lines.push(`Gate: ${snippet.file} already exists — paste-ready snippet:`)
      lines.push(indent(snippet.content))
    }
    // mise.toml is additively merged; report the outcome.
    const mise = d.gate.mise
    if (mise !== undefined) {
      if (mise.status === 'merged') {
        lines.push(
          `Gate:    merged ${mise.added.length} addition(s) into mise.toml (${mise.added.join(', ')})`,
        )
      } else if (mise.status === 'conflict') {
        lines.push('')
        lines.push(
          `Gate: mise.toml — merged ${mise.added.length} addition(s); ${mise.conflicts.length} key(s) differ from the gate and were left as-is:`,
        )
        for (const c of mise.conflicts) {
          lines.push(`  ${c.path}: yours=${c.existing} gate=${c.template}`)
        }
        lines.push(indent(mise.snippet))
      } else if (mise.status === 'unparseable') {
        lines.push('')
        lines.push('Gate: mise.toml is not valid TOML — add this yourself:')
        lines.push(indent(mise.snippet))
      }
      // 'unchanged' / 'created' (already in `written`) print nothing extra.
    }
  } else if (d.state !== 'A' && existsSync(join(target, 'mise.toml'))) {
    // The gate is off and this isn't a fresh scaffold — never let that go
    // unmentioned when a mise.toml is already there to merge into.
    lines.push(
      "Gate: no commit gate configured. Run 'cospec init --gate' to add it (merges into your mise.toml).",
    )
  }

  const migrationReport = [
    ...migrationLines(d.migration, false),
    ...legacyMoveLines(d.moves, false),
  ]
  if (migrationReport.length > 0) {
    lines.push('')
    lines.push(...migrationReport)
  }
  if (d.failed.length > 0) {
    lines.push('')
    lines.push(...failedLines(d.failed))
  }

  if (d.opsx.length > 0) {
    lines.push('')
    if (d.opsxRemoved) {
      lines.push(`Removed ${d.opsx.length} leftover openspec (opsx) file(s).`)
    } else {
      lines.push(
        `Found ${d.opsx.length} leftover openspec (opsx) file(s) — two propose commands confuse agents:`,
      )
      for (const o of d.opsx) lines.push(`  ${o.relpath}`)
      lines.push(
        'Re-run with --remove-opsx to delete them (only provably openspec-generated files).',
      )
    }
  }

  if (d.legacyBlocks.length > 0) {
    lines.push('')
    if (d.opsxRemoved) {
      for (const block of d.legacyBlocks) {
        lines.push(
          d.legacyStripped.has(block.relpath)
            ? `Removed OpenSpec markers from ${block.relpath}`
            : `Left ${block.relpath} unchanged: its OpenSpec markers share a line with other text.`,
        )
      }
    } else {
      lines.push(
        `Found an OpenSpec block in ${d.legacyBlocks.length} project config file(s) — its instructions are superseded:`,
      )
      for (const block of d.legacyBlocks) lines.push(`  ${block.relpath}`)
      lines.push(
        'Re-run with --remove-opsx to strip each block (the rest of the file is kept, and no file is deleted).',
      )
    }
  }

  const homeRemoved = d.homeOpsx.filter((h) => h.removed)
  const homeKept = d.homeOpsx.filter((h) => !h.removed)
  if (homeRemoved.length > 0) {
    lines.push('')
    lines.push(`Removed ${homeRemoved.length} openspec file(s) outside this project:`)
    for (const h of homeRemoved) lines.push(`  ${h.path}`)
  }
  if (homeKept.length > 0) {
    lines.push('')
    lines.push(`Found ${homeKept.length} openspec file(s) outside this project:`)
    for (const h of homeKept) lines.push(`  ${h.path}`)
    lines.push(
      d.removeOpsx
        ? 'Kept: this run wrote no cospec skill to replace them.'
        : 'Re-run with --remove-opsx to delete them (only the names openspec wrote there).',
    )
  }

  if (d.cloudLines.length > 0) {
    lines.push('')
    lines.push(...d.cloudLines)
  }

  const noArtifacts = zeroArtifactLine(
    d.harnesses.map((h) => adapterFor(h)),
    d.workflows.delivery,
  )
  if (noArtifacts !== undefined) {
    lines.push('')
    lines.push(noArtifacts)
  }

  const setup = setupNoteLines(d.harnesses, HARNESS_TABLE, d.workflows.delivery)
  if (setup.length > 0) {
    lines.push('')
    lines.push(...setup)
  }

  const hints = receiptHintLines(
    d.harnesses,
    HARNESS_TABLE,
    d.workflows.installed,
    d.workflows.delivery,
  )
  if (hints.length > 0) {
    lines.push('')
    lines.push(...hints)
  }

  process.stdout.write(`${lines.join('\n')}\n`)
}

function indent(text: string): string {
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => (l === '' ? '' : `    ${l}`))
    .join('\n')
}
