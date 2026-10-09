// `cospec init [path]` (DESIGN §2.1). Detects the repo state (A fresh / B
// existing-no-openspec / C existing-openspec), scaffolds `openspec/`, composes
// and writes the 11 schemas + harness files through the shared managed-file
// engine (update.ts / §6.5), writes `config.yaml` only when absent, optionally
// scaffolds the commit gate (§7), additively merges Claude permissions (§6.4),
// detects/removes leftover opsx files (§6.6), and prints the receipt. Every
// write is idempotent: a second `init` returns `unchanged` for every file and
// leaves the tree clean.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { canonFile } from '../canon/embedded.ts'
import type { CommandContext } from '../cli.ts'
import { openspecDir } from '../core/change.ts'
import { flagSpelling, flagValue, hasFlag, type ParsedArgs } from '../core/command-table.ts'
import { splitFrontmatter, type WriteResult } from '../core/managed-files.ts'
import {
  adapterFor,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  HARNESS_NAMES,
  ideRestartLine,
  isHarnessName,
  legacySkillsRoots,
  scanRoots,
  SKILL_EXTENSION,
  skillsRoot,
  respellInvocationHint,
} from '../harness/adapters.ts'
import { mergeMiseToml, type MiseMergeResult } from '../harness/mise-merge.ts'
import { readWorkflowManifest, skillByWorkflowId } from '../harness/render.ts'
import { isInsideNestedCheckout, isOutsideProject, walkProjectFiles } from '../harness/scan-walk.ts'
import {
  COSPEC_PERMISSION,
  mergeClaudeSettings,
  type SettingsMergeResult,
} from '../harness/settings-merge.ts'
import { generate, migrationLines } from './update.ts'

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
 * comma-separated name matched case-insensitively. An empty list is refused
 * with upstream's own sentence (naming the `spelling` the user typed), an
 * unknown name with cospec's list of the valid ones.
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
    if (!isHarnessName(name))
      return { error: `invalid ${spelling} '${value}'; ${VALID_HARNESS_MSG}` }
    if (!out.includes(name)) out.push(name)
  }
  return { harnesses: out }
}

const VALID_HARNESS_MSG = `valid values: ${[...HARNESS_NAMES, 'all', 'none'].join(', ')} (comma-separate for multiple, e.g. --harness ${HARNESS_NAMES.slice(0, 2).join(',')})`

/**
 * Whether one of the row's `detectionPaths` exists. A bare `.agents/` proves
 * nothing — it commonly holds only an `AGENTS.md` source or shared notes — which
 * is why the `agents` row detects by its skills dir instead.
 */
function isDetected(cwd: string, h: HarnessName): boolean {
  return adapterFor(h).detectionPaths.some((p) => existsSync(join(cwd, p)))
}

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
  const detected = HARNESS_NAMES.filter((h) => isDetected(cwd, h))
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

const CONFIG_YAML = `# openspec project config — owned by you, never regenerated by cospec.
# 'schema' is the default change type. Change types are conventional-commit types;
# create a change with 'cospec new <type> <slug>'.
schema: feat

# context: injected into every artifact's authoring instructions.
# context: |
#   One or two sentences of project-wide context for the agent.

# rules: extra per-artifact constraints, keyed by artifact id (repo-wide, not per-type).
# rules:
#   proposal:
#     - Keep the proposal focused on a single capability.
`

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

/** A leftover openspec-generated ("opsx") file — never something cospec authored. */
export interface OpsxFile {
  relpath: string
}

/** Shared skills root openspec ≥1.8.0 writes Codex (and agents/zed/antigravity) skills into. */
export const OPSX_SHARED_SKILL_ROOT = '.agents/skills'

/**
 * The 12 workflow file names the pinned 1.13.1 dist ever writes, across every adapter (dist
 * `core/command-generation/workflowIdsByFileName`, confirmed against the vendored bundle):
 * `opsx-<id>.md` for exactly these `<id>`s, never an arbitrary `opsx-*` spelling. Matching the
 * id list, not a bare `opsx-[^/]+` wildcard, is itself part of the provenance — a user's own
 * `.opencode/commands/opsx-status.md` (or any id the pinned dist never generates) can never
 * satisfy it regardless of its frontmatter or body.
 */
const OPENCODE_OPSX_IDS = [
  'apply',
  'archive',
  'bulk-archive',
  'continue',
  'explore',
  'ff',
  'new',
  'onboard',
  'propose',
  'sync',
  'update',
  'verify',
] as const

/**
 * The exact path the pinned 1.13.1 OpenCode command adapter (dist
 * `core/command-generation/adapters/opencode.js`) writes to: `.opencode/commands/opsx-<id>.md`
 * for one of `OPENCODE_OPSX_IDS`. cospec's own OpenCode commands live at
 * `.opencode/commands/cospec-<id>.md` and never match this.
 */
const OPENCODE_OPSX_COMMAND_RE = new RegExp(
  `^\\.opencode/commands/opsx-(?:${OPENCODE_OPSX_IDS.join('|')})\\.md$`,
)

/**
 * The pinned dist's shared `PROJECT_ROOT_GUARD` template's distinctive lead sentence,
 * interpolated verbatim into all but one of its workflow bodies (probed from the pinned
 * binary's own `init --tools opencode` output). Requiring this whole sentence, not only the
 * bare `` `openspec list --json` `` command reference it goes on to make, is itself part of
 * the provenance check: a user's own command that happens to document or invoke that same
 * command (e.g. "run `openspec list --json` and summarize each change") would otherwise
 * satisfy a bare-substring check while never containing this exact upstream boilerplate
 * sentence, which only the pinned dist's own generated bodies ever carry.
 */
const PROJECT_ROOT_GUARD_LEAD =
  '**Project check:** These steps expect a project that already uses OpenSpec.'

/**
 * OpenCode's command adapter emits frontmatter with only `description` — no `name`, no
 * `metadata` — so neither marker in `isOpsxMarkdown` below ever matches a real OpenCode
 * opsx leftover (probed from the pinned binary's own `init --tools opencode` output).
 * Detected instead by the combination the adapter's output always has: the exact path it
 * writes to (one of the 12 ids the dist ever generates), frontmatter with no key but
 * `description`, and the `PROJECT_ROOT_GUARD` lead sentence plus the literal bare
 * `` `openspec list --json` `` reference every opsx workflow body carries — a string
 * cospec's own shipped bodies never contain, since cospec always respells its own commands
 * as `cospec`, never bare `openspec`. The combination is provenance, not a path/name
 * convention: a hand-written `.opencode/commands/opsx-notes.md` with its own prose body, or
 * a user's own command at a path outside the 12 ids, never matches.
 */
function isOpenCodeOpsxCommand(relpath: string, frontmatter: unknown, body: string): boolean {
  if (!OPENCODE_OPSX_COMMAND_RE.test(relpath)) return false
  if (frontmatter === null || typeof frontmatter !== 'object') return false
  const keys = Object.keys(frontmatter as Record<string, unknown>)
  if (keys.length !== 1 || keys[0] !== 'description') return false
  return body.includes(PROJECT_ROOT_GUARD_LEAD) && body.includes('`openspec list --json`')
}

// Provenance-only: a file is opsx only when its own frontmatter (or, for OpenCode's
// description-only shape, its frontmatter plus body) proves openspec authored it (DESIGN
// §2.1/§6.6 — "user-authored files (no generatedBy) never touched"). Path/name conventions
// alone are NOT provenance: a plain `.opencode/commands/opsx/notes.md` or `opsx-helper.md`
// a user wrote by hand carries no marker and must never be deleted.
export function isOpsxMarkdown(relpath: string, text: string): boolean {
  const { frontmatter, body } = splitFrontmatter(text)
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
  return isOpenCodeOpsxCommand(relpath, frontmatter, body)
}

/**
 * Which files the opsx leftover scan reads. Wider than `isHarnessDocument`, because what
 * openspec wrote sits at its own paths (`.claude/commands/opsx/<id>.md`,
 * `.opencode/commands/opsx-<id>.md` in the pinned dist's command adapters): every
 * `SKILL_EXTENSION` file under a top-level dir holding a row's project or legacy skills
 * root, each markdown-serializer row's files with its own `commands.extension` under its
 * `commands.dir`, and every `SKILL_EXTENSION` file under the shared `.agents/skills` root.
 * Provenance, never this path set, decides what is a leftover.
 */
export function isLeftoverCandidate(
  relpath: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  if (relpath.startsWith(`${OPSX_SHARED_SKILL_ROOT}/`) && relpath.endsWith(SKILL_EXTENSION)) {
    return true
  }
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
    return (
      c !== undefined &&
      c.serializer === 'markdown' &&
      relpath.startsWith(`${c.dir}/`) &&
      relpath.endsWith(c.extension)
    )
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
 */
export function leftoverScanFiles(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): { relpath: string; text: string }[] {
  // Keyed by relpath: `.agents` (a harness dir) strictly contains `.agents/skills`, so
  // the two walk ranges overlap and an unguarded scan would list every file there twice.
  const out = new Map<string, { relpath: string; text: string }>()
  walkProjectFiles(cwd, [...scanRoots(table), OPSX_SHARED_SKILL_ROOT], (relpath) => {
    if (!out.has(relpath) && isLeftoverCandidate(relpath, table)) {
      out.set(relpath, { relpath, text: readFileSync(join(cwd, relpath), 'utf8') })
    }
  })
  return [...out.values()]
}

/** `table` is a test seam for rows the shipped table does not carry. */
export function findOpsxFiles(
  cwd: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): OpsxFile[] {
  // cospec writes its own `cospec-*` skills to `.agents/skills` too; the two prefixes
  // cannot collide, and `isOpsxMarkdown` excludes anything cospec authored.
  return leftoverScanFiles(cwd, table)
    .filter((f) => isOpsxMarkdown(f.relpath, f.text))
    .map(({ relpath }) => ({ relpath }))
    .toSorted((a, b) => a.relpath.localeCompare(b.relpath))
}

/**
 * Re-checks `isOutsideProject` right before every delete, independent of `leftoverScanFiles`'
 * own guard: removal must never trust the found-list alone to have stayed inside the project
 * (a defense-in-depth pairing with the walk-time check, not a replacement for it).
 */
function removeOpsxFiles(cwd: string, files: OpsxFile[]): void {
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
}

// --- receipt ----------------------------------------------------------------

/**
 * The receipt's closing block: each selected row's `setupNote` in selection
 * order, then upstream's single IDE restart line when a selected row needs one.
 * `table` is a test seam for rows the shipped table does not carry.
 */
export function setupNoteLines(
  harnesses: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): string[] {
  const rows = harnesses.map((h) => adapterFor(h, table))
  const lines = rows.flatMap((row) => (row.setupNote === undefined ? [] : [row.setupNote]))
  const restart = ideRestartLine(rows)
  if (restart !== undefined) lines.push(restart)
  return lines
}

/**
 * One receipt line per skills root that two or more rows resolve to, printed
 * when any selected row writes there. It names every row on that root, in table
 * order, whether selected or not, and the one selected row the tree was written
 * for (`writers`, the arbiter's answer that `generate` returns). `table` is a
 * test seam.
 */
export function sharedSkillsRootLines(
  harnesses: readonly string[],
  writers: ReadonlySet<string>,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
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
    .map(({ root, ids }) => {
      const writer = ids.find((id) => harnesses.includes(id) && writers.has(id))
      if (writer === undefined) throw new Error(`internal: no writer for the ${root} root`)
      return `         skills for ${ids.join('/')} share the ${root} root (one tree, written for ${writer})`
    })
}

/**
 * The receipt's two closing hint lines, spelled the way the first selected row invokes the
 * propose workflow: through that row's body dialect and invocation prefix, the respelling
 * its generated bodies get. The first selected row is the first id of an explicit list as
 * typed, else the first in table order; with none selected the canonical spelling stays.
 * `table` is a test seam for rows the shipped table does not carry.
 */
export function receiptHintLines(
  harnesses: readonly string[],
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): string[] {
  const lines = [
    'Try: /cospec:propose "feat: <what you want to build>"',
    'Lightweight change? /cospec:propose "ci: fix release workflow" — 3 short artifacts.',
  ]
  const first = harnesses[0]
  if (first === undefined) return lines
  const row = adapterFor(first, table)
  const skillById = skillByWorkflowId(readWorkflowManifest())
  return lines.map((line) => respellInvocationHint(line, row, skillById))
}

// --- command entrypoint -----------------------------------------------------

export function run(ctx: CommandContext): number {
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

  const selection = selectHarnesses(target, state, harnessArg, flagSpelling(parsed, '--harness'))
  if (selection.error !== undefined) {
    process.stderr.write(`cospec: ${selection.error}\n`)
    return 1
  }
  const { harnesses } = selection

  // Scaffold the tree.
  mkdirSync(join(target, 'openspec', 'specs'), { recursive: true })
  mkdirSync(join(target, 'openspec', 'changes', 'archive'), { recursive: true })

  // Schemas + harness files + manifest.
  const { results, migration, skillWriters } = generate(target, { harnesses, force })

  // config.yaml — only if absent (never modified once present).
  const configPath = join(target, 'openspec', 'config.yaml')
  let configWritten = false
  if (!existsSync(configPath)) {
    writeFileSync(configPath, CONFIG_YAML)
    configWritten = true
  }

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
  const opsx = findOpsxFiles(target)
  const opsxRemoved = opsx.length > 0 && (removeOpsx || yes)
  if (opsxRemoved) removeOpsxFiles(target, opsx)

  if (flags.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          version: 1,
          path: target,
          state,
          harnesses,
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
          settings: settings ? { status: settings.status, added: settings.added } : null,
          opsx: { found: opsx.map((o) => o.relpath), removed: opsxRemoved },
          notGitTree,
          files: results,
          migration,
        },
        null,
        2,
      )}\n`,
    )
    return 0
  }

  printReceipt(target, {
    state,
    harnesses,
    skillWriters,
    results,
    migration,
    configWritten,
    gate,
    settings,
    opsx,
    opsxRemoved,
    notGitTree,
    autoNote: selection.note,
  })
  return 0
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
  migration: WriteResult[]
  configWritten: boolean
  gate?: GateResult
  settings?: SettingsMergeResult
  opsx: OpsxFile[]
  opsxRemoved: boolean
  notGitTree: boolean
  autoNote?: string
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

  if (d.harnesses.length > 0) {
    lines.push(`Harness: ${d.harnesses.join(', ')}`)
    lines.push(...sharedSkillsRootLines(d.harnesses, d.skillWriters))
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

  const migrationReport = migrationLines(d.migration, false)
  if (migrationReport.length > 0) {
    lines.push('')
    lines.push(...migrationReport)
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

  const setup = setupNoteLines(d.harnesses)
  if (setup.length > 0) {
    lines.push('')
    lines.push(...setup)
  }

  lines.push('')
  lines.push(...receiptHintLines(d.harnesses))

  process.stdout.write(`${lines.join('\n')}\n`)
}

function indent(text: string): string {
  return text
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => (l === '' ? '' : `    ${l}`))
    .join('\n')
}
