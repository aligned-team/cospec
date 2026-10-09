import { stringify } from 'yaml'

/**
 * How a harness surface respells in-body `/cospec:<id>` references. Keyed by dialect rather
 * than by harness name so that `codex` and `agents` are provably byte-identical.
 */
export type BodyDialect = 'canonical' | 'shared' | 'flat' | 'skill' | 'prose'

export const BODY_DIALECTS: readonly BodyDialect[] = [
  'canonical',
  'shared',
  'flat',
  'skill',
  'prose',
]

export function isBodyDialect(value: string): value is BodyDialect {
  return (BODY_DIALECTS as readonly string[]).includes(value)
}

/** The sigil a tool's users type before a command name (Amazon Q uses `@`). */
export type InvocationPrefix = '/' | '@'

/** What a tool's users type before a skill name (Kimi Code uses `/skill:`). */
export type SkillInvocationPrefix = '/' | '/skill:'

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

export type ArgumentPlaceholder = '$ARGUMENTS' | '$@'

export type CommandSerializer = 'markdown' | 'toml' | 'markdown-header' | 'plain'

/** Whether a serializer's files carry YAML frontmatter, so cospec's own provenance. */
export function carriesFrontmatter(serializer: CommandSerializer): boolean {
  return serializer === 'markdown'
}

/** A tool's slash-command surface. Independent of its skills root. */
export interface CommandSurface {
  /** Repo-relative commands root. */
  readonly dir: string
  /** Declared beside `file`; a table-invariant test keeps the two in agreement. */
  readonly namespacing: 'namespaced' | 'flat'
  /** Filename template under `dir`, without extension: `cospec/{command}` or `cospec-{command}`. */
  readonly file: string
  readonly extension: '.md' | '.prompt' | '.prompt.md' | '.toml'
  /**
   * `markdown` carries YAML frontmatter, and with it cospec's provenance. The other three
   * carry none and are manifest-tracked: `toml` (Gemini), `markdown-header` (a `# <name>`
   * title, the description, then the body) and `plain` (the body alone).
   */
  readonly serializer: CommandSerializer
  /** Markdown serializer only. */
  readonly frontmatter?: CommandFrontmatterBuilder
  /**
   * The placeholder a tool substitutes a command's arguments into (`$ARGUMENTS` for OpenCode,
   * `$@` for Pi). Present: an arg-taking workflow's command body carries a
   * `**Provided arguments**: <placeholder>` paragraph (see `injectArgumentPlaceholder`).
   */
  readonly injectArguments?: ArgumentPlaceholder
}

/** A tool root an earlier OpenSpec used, whose files move to the current root (`LEGACY_TOOL_ROOTS`). */
export interface LegacyToolRoot {
  readonly root: string
  /** Whether `update` asks before moving it. */
  readonly needsConsent: boolean
  /** `before-generation` when absent. */
  readonly timing?: 'before-generation' | 'after-generation'
  /** Why `update` asks before the move (upstream's `legacyMigrationNotice` for the tool). */
  readonly consentNotice?: string
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
  /** Upstream's `LEGACY_TOOL_ROOTS` entries for this tool; row data, moved by `legacy-skills.ts`. */
  readonly legacyToolRoots?: readonly LegacyToolRoot[]
  /**
   * Upstream's `LEGACY_GLOBAL_SLASH_COMMAND_PATHS` entry: the home directory OpenSpec once wrote
   * this tool's `prompts/opsx-<workflow>.md` into — `$<env>` when set and non-blank, else
   * `<home>/<fallback>`. Read by the leftover scan only when the row is selected.
   */
  readonly legacyGlobalPrompts?: { readonly env: string; readonly fallback: string }
  readonly commands?: CommandSurface
  readonly invocationPrefix: InvocationPrefix
  /** Spells the row's command bodies, and its skill bodies unless `skillDialect` is set. */
  readonly bodyDialect: BodyDialect
  /** Spells the row's skill bodies when they differ from its commands' (Devin). */
  readonly skillDialect?: BodyDialect
  /** The `skill` dialect's prefix; `/` when absent. */
  readonly skillInvocationPrefix?: SkillInvocationPrefix
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
    legacyToolRoots: [{ root: '.codex', needsConsent: false, timing: 'after-generation' }],
    legacyGlobalPrompts: { env: 'CODEX_HOME', fallback: '.codex' },
    invocationPrefix: '/',
    bodyDialect: 'shared',
    rulesPath: '.codex/rules/cospec.rules',
    requiresIdeRestart: false,
    // Upstream's paths; `.agents/skills` selects codex only as that root's writer
    // (`availableHarnesses`), so an agents-only repo stays agents-only.
    detectionPaths: ['.agents/skills', '.codex/skills'],
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
      injectArguments: '$ARGUMENTS',
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
  {
    id: 'amazon-q',
    displayName: 'Amazon Q Developer',
    skillsDir: '.amazonq',
    commands: {
      dir: '.amazonq/prompts',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
    invocationPrefix: '@',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.amazonq'],
  },
  {
    id: 'auggie',
    displayName: 'Auggie (Augment CLI)',
    skillsDir: '.augment',
    commands: {
      dir: '.augment/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildArgumentHintCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.augment'],
  },
  {
    id: 'bob',
    displayName: 'Bob Shell',
    skillsDir: '.bob',
    commands: {
      dir: '.bob/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildArgumentHintCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.bob'],
  },
  {
    id: 'cline',
    displayName: 'Cline',
    skillsDir: '.cline',
    commands: {
      dir: '.clinerules/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown-header',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.cline'],
  },
  {
    id: 'command-code',
    displayName: 'Command Code',
    skillsDir: '.commandcode',
    commands: {
      dir: '.commandcode/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'plain',
      injectArguments: '$ARGUMENTS',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.commandcode'],
  },
  {
    id: 'codeartsagent',
    displayName: 'CodeArts',
    skillsDir: '.codeartsdoer',
    invocationPrefix: '/',
    bodyDialect: 'skill',
    requiresIdeRestart: false,
    detectionPaths: ['.codeartsdoer'],
  },
  {
    id: 'devin',
    displayName: 'Devin Desktop (formerly Windsurf)',
    skillsDir: '.devin',
    legacyToolRoots: [
      {
        root: '.windsurf',
        needsConsent: true,
        consentNotice:
          'Windsurf is now Devin Desktop, and its config directory moved from .windsurf/ to ' +
          '.devin/. Devin Desktop reads .windsurf/ only as a fallback, and Devin Local does ' +
          'not read it at all.',
      },
    ],
    commands: {
      dir: '.devin/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    skillDialect: 'skill',
    requiresIdeRestart: true,
    detectionPaths: ['.devin', '.windsurf'],
  },
  {
    id: 'forgecode',
    displayName: 'ForgeCode',
    skillsDir: '.forge',
    invocationPrefix: '/',
    bodyDialect: 'skill',
    requiresIdeRestart: false,
    detectionPaths: ['.forge'],
  },
  {
    id: 'codebuddy',
    displayName: 'CodeBuddy Code (CLI)',
    skillsDir: '.codebuddy',
    commands: {
      dir: '.codebuddy/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildNameDescriptionHintCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: false,
    detectionPaths: ['.codebuddy'],
  },
  {
    id: 'continue',
    displayName: 'Continue',
    skillsDir: '.continue',
    commands: {
      dir: '.continue/prompts',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.prompt',
      serializer: 'markdown',
      frontmatter: buildInvokableCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.continue'],
  },
  {
    id: 'costrict',
    displayName: 'CoStrict',
    skillsDir: '.cospec',
    commands: {
      // CoStrict keeps its commands under `openspec/`, not at the `<root>/commands` path.
      dir: '.cospec/openspec/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildArgumentHintCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.cospec'],
  },
  {
    id: 'crush',
    displayName: 'Crush',
    skillsDir: '.crush',
    commands: {
      dir: '.crush/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: false,
    detectionPaths: ['.crush'],
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.cursor',
    commands: {
      dir: '.cursor/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildCursorCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.cursor'],
  },
  {
    id: 'factory',
    displayName: 'Factory Droid',
    skillsDir: '.factory',
    commands: {
      dir: '.factory/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildArgumentHintCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.factory'],
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    skillsDir: '.gemini',
    commands: {
      dir: '.gemini/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.toml',
      serializer: 'toml',
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: false,
    detectionPaths: ['.gemini'],
  },
  {
    id: 'hermes',
    displayName: 'Hermes Agent',
    skillsDir: '.hermes',
    invocationPrefix: '/',
    bodyDialect: 'skill',
    requiresIdeRestart: false,
    detectionPaths: ['.hermes', 'HERMES.md', '.hermes.md'],
    setupNote:
      "Setup required for Hermes Agent: Hermes only loads skills from ~/.hermes/skills by default. Add this project's .hermes/skills directory to skills.external_dirs in ~/.hermes/config.yaml so Hermes picks up the generated OpenSpec skills.",
  },
  {
    id: 'iflow',
    displayName: 'iFlow',
    skillsDir: '.iflow',
    commands: {
      dir: '.iflow/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildCursorCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.iflow'],
  },
  {
    id: 'junie',
    displayName: 'Junie',
    skillsDir: '.junie',
    commands: {
      dir: '.junie/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      // Upstream's key set is description alone, the same as OpenCode's.
      frontmatter: buildOpencodeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.junie'],
  },
  {
    id: 'kilocode',
    displayName: 'Kilo Code',
    skillsDir: '.kilocode',
    commands: {
      dir: '.kilocode/workflows',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'plain',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.kilocode'],
  },
  {
    id: 'kimi',
    displayName: 'Kimi Code',
    skillsDir: '.kimi-code',
    legacyToolRoots: [{ root: '.kimi', needsConsent: false }],
    invocationPrefix: '/',
    bodyDialect: 'skill',
    skillInvocationPrefix: '/skill:',
    requiresIdeRestart: false,
    detectionPaths: ['.kimi-code', '.kimi'],
  },
  {
    id: 'kiro',
    displayName: 'Kiro',
    skillsDir: '.kiro',
    commands: {
      dir: '.kiro/prompts',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.prompt.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.kiro'],
  },
  {
    id: 'lingma',
    displayName: 'Lingma',
    skillsDir: '.lingma',
    commands: {
      dir: '.lingma/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: true,
    detectionPaths: ['.lingma'],
  },
  {
    id: 'vibe',
    displayName: 'Mistral Vibe',
    skillsDir: '.vibe',
    invocationPrefix: '/',
    bodyDialect: 'skill',
    requiresIdeRestart: false,
    detectionPaths: ['.vibe'],
  },
  {
    id: 'oh-my-pi',
    displayName: 'Oh My Pi',
    skillsDir: '.omp',
    commands: {
      dir: '.omp/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
      injectArguments: '$@',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.omp'],
  },
  {
    id: 'pi',
    displayName: 'Pi',
    skillsDir: '.pi',
    commands: {
      dir: '.pi/prompts',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
      injectArguments: '$@',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.pi'],
  },
  {
    id: 'codeassistant',
    displayName: 'SourceCraft Code Assistant',
    skillsDir: '.codeassistant',
    commands: {
      dir: '.codeassistant/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.codeassistant'],
  },
  {
    id: 'qoder',
    displayName: 'Qoder',
    skillsDir: '.qoder',
    commands: {
      dir: '.qoder/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: true,
    detectionPaths: ['.qoder'],
  },
  {
    id: 'qwen',
    displayName: 'Qwen Code',
    skillsDir: '.qwen',
    commands: {
      dir: '.qwen/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildOpencodeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: false,
    detectionPaths: ['.qwen'],
  },
  {
    id: 'rovodev',
    displayName: 'Rovo Dev CLI',
    skillsDir: '.rovodev',
    invocationPrefix: '/',
    bodyDialect: 'prose',
    requiresIdeRestart: false,
    detectionPaths: ['.rovodev/skills', '.rovodev'],
  },
  {
    id: 'roocode',
    displayName: 'Zoo Code',
    skillsDir: '.roo',
    commands: {
      dir: '.roo/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown-header',
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.roo'],
  },
  {
    id: 'trae',
    displayName: 'Trae',
    skillsDir: '.trae',
    commands: {
      dir: '.trae/commands',
      namespacing: 'flat',
      file: 'cospec-{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildNameDescriptionCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'flat',
    requiresIdeRestart: true,
    detectionPaths: ['.trae'],
  },
  {
    id: 'zcode',
    displayName: 'ZCode',
    skillsDir: '.zcode',
    commands: {
      dir: '.zcode/commands',
      namespacing: 'namespaced',
      file: 'cospec/{command}',
      extension: '.md',
      serializer: 'markdown',
      frontmatter: buildClaudeCommandFrontmatter,
    },
    invocationPrefix: '/',
    bodyDialect: 'canonical',
    requiresIdeRestart: false,
    detectionPaths: ['.zcode'],
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
 * Which files under the scan roots are harness documents, the ones doctor's stale-harness,
 * mixed-versions and dangling-ref checks read: only paths cospec generates (cospec-roadmap
 * ruling 2026-10-04). That is `<skills root>/<skill>/SKILL_FILE`, with exactly one
 * directory between a row's project or legacy skills root and the file, and each
 * markdown-serializer row's command paths, `<commands.dir>/<commands.file><extension>` with
 * `{command}` as one path segment. Both match on the full root, so a user's own markdown
 * under a harness dir, a deeper `SKILL.md` and a nested worktree's checkout are not
 * harness documents. A TOML command carries no frontmatter and is left to the manifest
 * (DESIGN decision 9). The opsx leftover scan reads a wider set (init's
 * `isLeftoverCandidate`), since what openspec wrote lives at its own paths.
 */
export function isHarnessDocument(
  relpath: string,
  table: readonly HarnessAdapter[] = HARNESS_TABLE,
): boolean {
  return table.some((row) => {
    const roots = legacySkillsRoots(row)
    const skills = skillsRoot(row)
    if (skills.scope === 'project') roots.push(skills.root)
    if (roots.some((root) => isSkillFileUnder(relpath, root))) return true
    const c = row.commands
    return c !== undefined && c.serializer === 'markdown' && commandPathPattern(c).test(relpath)
  })
}

function isSkillFileUnder(relpath: string, root: string): boolean {
  if (!relpath.startsWith(`${root}/`)) return false
  const rest = relpath.slice(root.length + 1).split('/')
  return rest.length === 2 && rest[0] !== '' && rest[1] === SKILL_FILE
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function commandPathPattern(c: CommandSurface): RegExp {
  const file = c.file.split('{command}').map(escapeRegExp).join('[^/]+')
  return new RegExp(`^${escapeRegExp(c.dir)}/${file}${escapeRegExp(c.extension)}$`)
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
 * - `skill` — `<prefix>cospec-<skill>` (`/` by default, `/skill:` for Kimi Code), for a
 *   tool that invokes a skill by name and has no command for it.
 * - `prose` — `the cospec-<skill> skill`, for a tool with no invocation syntax at all.
 *
 * `shared`, `skill` and `prose` map an id through `skillById` and leave an unknown one verbatim.
 */
export function transformBody(
  body: string,
  dialect: BodyDialect,
  skillById: ReadonlyMap<string, string>,
  invocationPrefix: InvocationPrefix | SkillInvocationPrefix = '/',
): string {
  if (dialect === 'canonical') return body
  if (dialect === 'flat') return body.replaceAll('/cospec:', `${invocationPrefix}cospec-`)
  return body.replace(WORKFLOW_REF_RE, (whole, id: string) => {
    const skill = skillById.get(id)
    if (skill === undefined) return whole
    if (dialect === 'skill') return `${invocationPrefix}${skill}`
    if (dialect === 'prose') return `the ${skill} skill`
    return `$${skill} (Codex) or /${skill} (other agents)`
  })
}

/** The dialect and prefix that spell a row's skill bodies. */
export function skillSpelling(row: HarnessAdapter): {
  dialect: BodyDialect
  prefix: InvocationPrefix | SkillInvocationPrefix
} {
  const dialect = row.skillDialect ?? row.bodyDialect
  return {
    dialect,
    prefix: dialect === 'skill' ? (row.skillInvocationPrefix ?? '/') : row.invocationPrefix,
  }
}

/** The dialect and prefix that spell a row's command bodies. */
export function commandSpelling(row: HarnessAdapter): {
  dialect: BodyDialect
  prefix: InvocationPrefix | SkillInvocationPrefix
} {
  const dialect = row.bodyDialect
  return {
    dialect,
    prefix: dialect === 'skill' ? (row.skillInvocationPrefix ?? '/') : row.invocationPrefix,
  }
}

/**
 * Respell one `/cospec:<id>` invocation in a receipt hint the way the row's SKILLS are
 * referenced. A prose row has no invocation syntax, so the hint asks the tool by name:
 * `ask <tool> to use the cospec-<skill> skill with <arguments>`.
 */
export function respellInvocationHint(
  line: string,
  row: HarnessAdapter,
  skillById: ReadonlyMap<string, string>,
): string {
  const { dialect, prefix } = skillSpelling(row)
  if (dialect !== 'prose') return transformBody(line, dialect, skillById, prefix)
  return line.replace(/\/cospec:([a-z][a-z0-9-]*) /, (whole, id: string) => {
    const skill = skillById.get(id)
    return skill === undefined ? whole : `ask ${row.displayName} to use the ${skill} skill with `
  })
}

/**
 * The pattern that finds a row's workflow references in a body, with the workflow id or skill
 * suffix as capture group 1: `/cospec:<id>`, the row's own prefix (`@cospec-<id>`), and the
 * spellings its dialects emit: `/skill:cospec-<skill>` and `the cospec-<skill> skill`.
 */
export function workflowReferencePattern(row: HarnessAdapter): RegExp {
  const dialects = new Set([row.bodyDialect, row.skillDialect ?? row.bodyDialect])
  const sigils = [...new Set(['/', row.invocationPrefix])].map((s) => escapeRegExp(s))
  const behind = [`(?:${sigils.join('|')})cospec[:-]`]
  if (dialects.has('skill') && row.skillInvocationPrefix === '/skill:') {
    behind.push(`${escapeRegExp(row.skillInvocationPrefix)}cospec-`)
  }
  const branches = behind.map((b) => `(?<=${b})`)
  if (dialects.has('prose')) branches.push('(?<=the cospec-)(?=[a-z][a-z-]* skill)')
  return new RegExp(`(?:${branches.join('|')})([a-z][a-z-]*)`, 'g')
}

/**
 * Some tools (OpenCode, Command Code, Pi, Oh My Pi) pass a slash command's arguments ONLY
 * through an explicit placeholder: a body with none silently drops everything the user typed
 * after `/cospec-new`. Claude and Codex bind the argument implicitly, so this is a
 * command-only transform; a skill body never gets the placeholder, since nothing substitutes
 * it there and the literal text would leak to the model.
 *
 * The placeholder is inserted as its own paragraph immediately before the body's
 * first `## ` section — the point where cospec bodies stop describing the workflow
 * and start reading input. Idempotent: a body that already carries `$ARGUMENTS`, `$@` or
 * `$1`… is returned unchanged. CRLF bodies keep CRLF.
 */
const ARGUMENT_PLACEHOLDER_RE = /\$(?:ARGUMENTS\b|@|[1-9]\d*\b)/
const FIRST_SECTION_RE = /^## /m

export function injectArgumentPlaceholder(
  body: string,
  placeholder: ArgumentPlaceholder = '$ARGUMENTS',
): string {
  if (ARGUMENT_PLACEHOLDER_RE.test(body)) return body
  const eol = body.includes('\r\n') ? '\r\n' : '\n'
  const line = `**Provided arguments**: ${placeholder}`
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

/**
 * `description` plus an `argument-hint` on every command, as upstream writes it for Auggie,
 * Bob, CoStrict and Factory: the hint is the same for all workflows.
 */
export function buildArgumentHintCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    description: w.description,
    'argument-hint': 'command arguments',
    metadata: provenance(version, contentHash),
  }
}

/** Cursor's `name` (a slash command), `id`, `category` and `description`; iFlow writes the same. */
export function buildCursorCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: `/cospec-${w.command}`,
    id: `cospec-${w.command}`,
    category: 'Workflow',
    description: w.description,
    metadata: provenance(version, contentHash),
  }
}

/** A `name` (Trae's `COSPEC: <title>`) and a `description`, as upstream writes them for Trae. */
export function buildNameDescriptionCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: `COSPEC: ${w.title}`,
    description: w.description,
    metadata: provenance(version, contentHash),
  }
}

/**
 * `name`, `description` and a bracketed `argument-hint`, as upstream writes them for
 * CodeBuddy; its hint differs from Auggie's by the brackets.
 */
export function buildNameDescriptionHintCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: `COSPEC: ${w.title}`,
    description: w.description,
    'argument-hint': '[command arguments]',
    metadata: provenance(version, contentHash),
  }
}

/** Continue's `name` (the file's own command name), `description` and `invokable: true`. */
export function buildInvokableCommandFrontmatter(
  w: WorkflowDef,
  version: string,
  contentHash: string,
): Record<string, unknown> {
  return {
    name: `cospec-${w.command}`,
    description: w.description,
    invokable: true,
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
