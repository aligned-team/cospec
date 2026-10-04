import { stringify } from 'yaml'

/**
 * How a harness surface respells in-body `/cospec:<id>` references. Keyed by dialect rather
 * than by harness name so that `codex` and `agents` are provably byte-identical.
 */
export type BodyDialect = 'canonical' | 'shared' | 'flat'

export const BODY_DIALECTS: readonly BodyDialect[] = ['canonical', 'shared', 'flat']

export function isBodyDialect(value: string): value is BodyDialect {
  return (BODY_DIALECTS as readonly string[]).includes(value)
}

/** The sigil a tool's users type before a command name (Amazon Q uses `@`). */
export type InvocationPrefix = '/' | '@'

/**
 * Builds a command file's YAML frontmatter from the workflow, the generatedBy stamp and the
 * body-only content hash. A function rather than an enum so a new tool's keys need no
 * render.ts edit.
 */
export type CommandFrontmatterBuilder = (
  w: WorkflowDef,
  version: string,
  contentHash: string,
) => Record<string, unknown>

/** A tool's slash-command surface. Independent of its skills root. */
export interface CommandSurface {
  /** Repo-relative commands root. */
  readonly dir: string
  /** Declared beside `file`; a table-invariant test keeps the two in agreement. */
  readonly namespacing: 'namespaced' | 'flat'
  /** Filename template under `dir`, without extension: `cospec/{command}` or `cospec-{command}`. */
  readonly file: string
  readonly extension: '.md' | '.prompt' | '.prompt.md' | '.toml'
  readonly serializer: 'markdown' | 'toml'
  /** Markdown serializer only. */
  readonly frontmatter?: CommandFrontmatterBuilder
  /** OpenCode's `$ARGUMENTS` paragraph on arg-taking workflows (see `injectOpenCodeArgs`). */
  readonly injectArguments?: boolean
}

/**
 * One tool's complete layout. Field names follow the pinned OpenSpec `AI_TOOLS` entries
 * wherever upstream has the field, with upstream's meaning: `skillsDir`, `globalSkillsDir`
 * and `legacySkillsDirs` are tool ROOTS, with skills at `<root>/skills/<skill>/SKILL.md`.
 */
export interface HarnessAdapter {
  /** The `--harness` value. */
  readonly id: string
  /** Upstream `AI_TOOLS` `name`. */
  readonly displayName: string
  readonly skillsDir?: string
  /** Home-relative root; used only when the row has no `skillsDir`. */
  readonly globalSkillsDir?: string
  readonly legacySkillsDirs?: readonly string[]
  readonly commands?: CommandSurface
  readonly invocationPrefix: InvocationPrefix
  readonly bodyDialect: BodyDialect
  /** A non-markdown, manifest-tracked rules file (Codex's prefix-rule allowlist). */
  readonly rulesPath?: string
  readonly requiresIdeRestart: boolean
  /** Paths whose existence makes init auto-select this tool. */
  readonly detectionPaths: readonly string[]
  /** The line the init receipt prints for this tool, in selection order. */
  readonly setupNote?: string
  readonly searchAliases?: readonly string[]
}

/**
 * The one declaration of every tool cospec generates project files for (DESIGN §6.1).
 * `agents` is the vendor-neutral `.agents/skills` root read by Codex, Zed, Antigravity and
 * other AGENTS.md-aware assistants; `codex` writes the same files there plus its own rules
 * file. Rows are appended rather than sorted: receipts, detection output and doctor's
 * findings follow this order.
 */
export const HARNESS_TABLE = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    skillsDir: '.claude',
    commands: {
      dir: '.claude/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: false,
    detectionPaths: ['.claude'],
    setupNote: 'Restart Claude Code to pick up /cospec commands.',
  },
  {
    id: 'codex',
    displayName: 'Codex',
    skillsDir: '.agents',
    legacySkillsDirs: ['.codex'],
    invocationPrefix: '/',
    bodyDialect: 'shared',
    rulesPath: '.codex/rules/cospec.rules',
    requiresIdeRestart: false,
    // Upstream's is ['.agents/skills', '.codex/skills'], which would select codex on an
    // agents-only repo; aligning it is a behaviour change owned by a later change.
    detectionPaths: ['.codex'],
    setupNote:
      'Codex: skills now live in .agents/skills and are invoked as $cospec-<skill>; they load per-session, so start a new one. .codex/rules/cospec.rules still pre-approves the read-only and gate cospec calls.',
  },
  {
    id: 'opencode',
    displayName: 'OpenCode',
    skillsDir: '.opencode',
    commands: {
      dir: '.opencode/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
      injectArguments: true,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.opencode'],
    setupNote: 'OpenCode: reload the project to pick up /cospec- commands.',
  },
  {
    id: 'agents',
    displayName: 'Other / Universal (shared .agents skills)',
    skillsDir: '.agents',
    invocationPrefix: '/',
    bodyDialect: 'shared',
    requiresIdeRestart: false,
    detectionPaths: ['.agents/skills'],
    setupNote:
      'Shared .agents/skills — read by Codex ($cospec-*), Zed, Antigravity and other AGENTS.md-aware assistants; start a new session to load the skills. No slash commands are generated for this target.',
    searchAliases: [
      'universal',
      'other',
      'generic',
      'custom',
      'proprietary',
      'unlisted',
      'unsupported',
      'vendor-neutral',
      'agents.md',
    ],
  },
] as const satisfies readonly HarnessAdapter[]

export type HarnessName = (typeof HARNESS_TABLE)[number]['id']

export const HARNESS_NAMES: readonly HarnessName[] = HARNESS_TABLE.map((row) => row.id)

export function isHarnessName(value: string): value is HarnessName {
  return (HARNESS_NAMES as readonly string[]).includes(value)
}

/** The row for `id` in `table`. An id the table does not declare is a programming error. */
export function adapterFor(
  id: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): HarnessAdapter {
  const row = table.find((r) => r.id === id)
  if (row === undefined) throw new Error(`internal: no harness adapter row for '${id}'`)
  return row
}

/** Where a row's skills land: a repo-relative root, or a home-relative one. */
export interface SkillsRoot {
  root: string
  scope: 'project' | 'home'
}

export function skillsRoot(row: HarnessAdapter): SkillsRoot {
  if (row.skillsDir !== undefined) return { root: `${row.skillsDir}/skills`, scope: 'project' }
  if (row.globalSkillsDir !== undefined) {
    return { root: `${row.globalSkillsDir}/skills`, scope: 'home' }
  }
  throw new Error(`internal: harness adapter row '${row.id}' declares no skills root`)
}

/** The file every row writes per skill, at `<skills root>/<skill>/SKILL_FILE`. */
export const SKILL_FILE = 'SKILL.md'

/** The skill file's extension: every skill, on every row, is markdown. */
export const SKILL_EXTENSION = '.md'

export function skillPath(row: HarnessAdapter, skill: string): string {
  return `${skillsRoot(row).root}/${skill}/${SKILL_FILE}`
}

/** Skills roots this tool used in an earlier cospec version (`<legacy>/skills`). */
export function legacySkillsRoots(row: HarnessAdapter): string[] {
  return (row.legacySkillsDirs ?? []).map((dir) => `${dir}/skills`)
}

/** `<commands.dir>/<commands.file><extension>`, or undefined for a skills-only row. */
export function commandPath(row: HarnessAdapter, command: string): string | undefined {
  const c = row.commands
  if (c === undefined) return undefined
  return `${c.dir}/${c.file.replaceAll('{command}', command)}${c.extension}`
}

function topSegment(path: string): string {
  return path.split('/')[0]!
}

/** The top-level repo dirs a row writes under, primary first; home-scoped skills excluded. */
function rowRoots(row: HarnessAdapter): string[] {
  const roots: string[] = []
  if (row.commands !== undefined) roots.push(topSegment(row.commands.dir))
  if (row.rulesPath !== undefined) roots.push(topSegment(row.rulesPath))
  const skills = skillsRoot(row)
  if (skills.scope === 'project') roots.push(topSegment(skills.root))
  roots.push(...legacySkillsRoots(row).map(topSegment))
  return roots
}

/**
 * The top-level repo dir that identifies a row: its commands dir, else its rules file, else
 * its skills root. Doctor attributes a file on no row's surface to the row whose primary
 * root prefixes it, and breaks a tie between rows sharing a surface the same way.
 */
export function primaryRoot(row: HarnessAdapter): string | undefined {
  return rowRoots(row)[0]
}

/**
 * Upstream's single IDE restart line (`formatIdeRestart`), printed after the setup notes
 * when any of `rows` sets `requiresIdeRestart`; commands win over skills as in upstream's
 * `resolveIdeRestartSurface`. Undefined when no row needs a restart.
 */
export function ideRestartLine(rows: readonly HarnessAdapter[]): string | undefined {
  const flagged = rows.filter((row) => row.requiresIdeRestart)
  if (flagged.some((row) => row.commands !== undefined)) {
    return 'Restart your IDE to refresh commands.'
  }
  if (flagged.length > 0) return 'Restart your IDE to refresh skills.'
  return undefined
}

/**
 * Top-level dirs to walk for leftovers, drift and sidecars. Two passes — each row's primary
 * root in table order, then any remaining roots — so the four rows derive today's `.<id>`
 * walk order; a single first-occurrence pass would put `.agents` before `.codex`.
 */
export function scanRoots(table: readonly HarnessAdapter[] = HARNESS_TABLE): string[] {
  const out = new Set<string>()
  for (const row of table) {
    const primary = primaryRoot(row)
    if (primary !== undefined) out.add(primary)
  }
  for (const row of table) for (const root of rowRoots(row)) out.add(root)
  return [...out]
}

/**
 * Which files under the scan roots are markdown harness documents, the ones doctor's
 * frontmatter and reference checks and init's leftover scan read: every
 * `SKILL_EXTENSION` file under a top-level dir holding a row's project skills root or
 * legacy skills root, and each markdown-serializer row's command files, by that row's
 * own `commands.extension` under its `commands.dir`. A TOML command carries no
 * frontmatter and is left to the manifest (DESIGN decision 9). For the four rows this
 * is every `.md` file under the scan roots.
 */
export function isHarnessDocument(
  relpath: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  const top = topSegment(relpath)
  return table.some((row) => {
    const skills = skillsRoot(row)
    const skillRoots = legacySkillsRoots(row)
    if (skills.scope === 'project') skillRoots.push(skills.root)
    if (relpath.endsWith(SKILL_EXTENSION) && skillRoots.some((root) => topSegment(root) === top)) {
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

/** Dirs cospec owns and may delete manifest-tracked files from: `openspec` plus every row root. */
export function removalRoots(table: readonly HarnessAdapter[] = HARNESS_TABLE): string[] {
  return [...new Set(['openspec', ...scanRoots(table)])]
}

/**
 * A workflow's identity fields, as declared in canon/workflows/harness.yaml — which holds
 * workflow identity only; tool layout lives in HARNESS_TABLE above.
 */
export interface WorkflowDef {
  id: string
  command: string
  skill: string
  title: string
  description: string
  injectTypeTable?: boolean
  /**
   * Whether the workflow reads a positional argument (a type + description, or a
   * change slug). Audited per workflow in canon/workflows/harness.yaml; drives the
   * OpenCode `$ARGUMENTS` injection below.
   */
  takesArguments?: boolean
}

const WORKFLOW_REF_RE = /\/cospec:([a-z][a-z0-9-]*)/g

/**
 * Respell a body's `/cospec:<id>` references for the target dialect.
 *
 * - `canonical` — unchanged; Claude registers `/cospec:<id>` slash commands.
 * - `flat` — `<invocationPrefix>cospec-<id>`, matching the flat `cospec-<id>` commands a
 *   tool registers (`/cospec-<id>` for OpenCode, `@cospec-<id>` for Amazon Q).
 * - `shared` — `$cospec-<skill> (Codex) or /cospec-<skill> (other agents)`. The shared
 *   `.agents/skills` root emits NO command files, so `/cospec-<id>` would dangle there;
 *   only the skill directory name resolves, and only 4 of the 12 workflows spell their id
 *   the same as their skill suffix. An id absent from `skillById` is left verbatim so
 *   doctor's dangling-ref check still fires on a genuinely bad reference.
 */
export function transformBody(
  body: string,
  dialect: BodyDialect,
  skillById: ReadonlyMap<string, string>,
  invocationPrefix: InvocationPrefix = '/',
): string {
  if (dialect === 'canonical') return body
  if (dialect === 'flat') return body.replaceAll('/cospec:', `${invocationPrefix}cospec-`)
  return body.replace(WORKFLOW_REF_RE, (whole, id: string) => {
    const skill = skillById.get(id)
    if (skill === undefined) return whole
    return `$${skill} (Codex) or /${skill} (other agents)`
  })
}

/**
 * OpenCode passes a slash command's arguments ONLY through an explicit placeholder:
 * a body with no `$ARGUMENTS` silently drops everything the user typed after
 * `/cospec-new`. Claude and Codex bind the argument implicitly, so this is an
 * OpenCode-command-only transform — a skill body never gets the placeholder, since
 * nothing substitutes it there and the literal text would leak to the model.
 *
 * The placeholder is inserted as its own paragraph immediately before the body's
 * first `## ` section — the point where cospec bodies stop describing the workflow
 * and start reading input. Idempotent: a body that already carries `$ARGUMENTS` or
 * `$1`… is returned unchanged. CRLF bodies keep CRLF.
 */
const ARGUMENT_PLACEHOLDER_RE = /\$(?:ARGUMENTS\b|[1-9]\d*\b)/
const FIRST_SECTION_RE = /^## /m

export function injectOpenCodeArgs(body: string): string {
  if (ARGUMENT_PLACEHOLDER_RE.test(body)) return body
  const eol = body.includes('\r\n') ? '\r\n' : '\n'
  const line = `**Provided arguments**: $ARGUMENTS`
  const match = FIRST_SECTION_RE.exec(body)
  if (match === null) return `${body.replace(/\s+$/, '')}${eol}${eol}${line}${eol}`
  return `${body.slice(0, match.index)}${line}${eol}${eol}${body.slice(match.index)}`
}

/** SKILL.md frontmatter — identical shape across every harness (DESIGN §6.3). */
export function buildSkillFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: w.skill,
    description: w.description,
    license: 'MIT',
    compatibility: 'Requires the cospec CLI (@aligned-team/cospec).',
    metadata: provenance(version, contentHash),
  }
}

/** Claude slash-command frontmatter (`.claude/commands/cospec/<name>.md`). */
export function buildClaudeCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: `COSPEC: ${w.title}`,
    description: w.description,
    category: 'Workflow',
    tags: ['cospec', 'workflow'],
    metadata: provenance(version, contentHash),
  }
}

/** OpenCode slash-command frontmatter (`.opencode/commands/cospec-<name>.md`) — minimal. */
export function buildOpencodeCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    description: w.description,
    metadata: provenance(version, contentHash),
  }
}

function provenance(version: string, contentHash: string): Record<string, unknown> {
  return { author: 'cospec', generatedBy: version, contentHash }
}

/** Serialize a frontmatter object to a YAML block body (no delimiters). Deterministic. */
export function serializeFrontmatter(frontmatter: Record<string, unknown>): string {
  return stringify(frontmatter, { lineWidth: 0 })
}

/**
 * Codex prefix-rule allowlist (`.codex/rules/cospec.rules`, DESIGN §6.1). Pre-approves the
 * read-only and gate commands; `archive` is intentionally omitted (it mutates specs + history).
 */
export function renderCodexRules(version: string): string {
  const allow = [
    ['cospec', 'validate'],
    ['cospec', 'status'],
    ['cospec', 'list'],
    ['cospec', 'instructions'],
    ['cospec', 'apply'],
    ['cospec', 'sync-blockers', '--check'],
    ['cospec', 'new'],
    ['cospec', 'doctor'],
    // Read-only config reads and the completion sources. `config set|unset|
    // reset|edit|profile` mutate machine-global state and `feedback` files a
    // public issue over the network, so neither is pre-approved — the same
    // reasoning that keeps `archive` off this list.
    ['cospec', 'config', 'get'],
    ['cospec', 'config', 'list'],
    ['cospec', 'config', 'path'],
    ['cospec', 'completion'],
    ['cospec', '__complete'],
  ]
  const lines = allow.map(
    (pattern) =>
      `prefix_rule(pattern=[${pattern.map((p) => `"${p}"`).join(', ')}], decision="allow")`,
  )
  return [
    `# cospec — pre-approved read-only and gate commands for Codex. Generated by ${version}.`,
    '# Edit cospec canon, not this file. `archive` is intentionally NOT pre-approved.',
    '',
    ...lines,
    '',
  ].join('\n')
}
