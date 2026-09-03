import { stringify } from 'yaml'

/**
 * The harness targets cospec generates project files for (DESIGN §6.1). `agents` is the
 * vendor-neutral `.agents/skills` root read by Codex, Zed, Antigravity and other
 * AGENTS.md-aware assistants; `codex` writes the same files there plus its own rules file.
 * Appended rather than sorted so receipts and detection output keep their existing order.
 */
export type HarnessName = 'claude' | 'codex' | 'opencode' | 'agents'

export const HARNESS_NAMES: readonly HarnessName[] = ['claude', 'codex', 'opencode', 'agents']

export function isHarnessName(value: string): value is HarnessName {
  return (HARNESS_NAMES as readonly string[]).includes(value)
}

/**
 * How a harness surface respells in-body `/cospec:<id>` references. Keyed by dialect rather
 * than by harness name so that `codex` and `agents` are provably byte-identical.
 */
export type BodyDialect = 'canonical' | 'shared' | 'opencode'

export const BODY_DIALECTS: readonly BodyDialect[] = ['canonical', 'shared', 'opencode']

export function isBodyDialect(value: string): value is BodyDialect {
  return (BODY_DIALECTS as readonly string[]).includes(value)
}

/** A workflow's identity fields, as declared in canon/workflows/harness.yaml. */
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
 * - `opencode` — `/cospec-<id>`, matching the slash commands OpenCode registers.
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
): string {
  if (dialect === 'canonical') return body
  if (dialect === 'opencode') return body.replaceAll('/cospec:', '/cospec-')
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
