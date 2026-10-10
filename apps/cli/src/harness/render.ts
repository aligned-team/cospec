import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import pkg from '../../package.json'
import { canonFile } from '../canon/embedded.ts'
import {
  adapterFor,
  buildSkillFrontmatter,
  carriesFrontmatter,
  commandPath,
  commandSpelling,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  injectArgumentPlaceholder,
  renderCodexRules,
  serializeFrontmatter,
  skillPath,
  skillsRoot,
  skillSpelling,
  transformBody,
  type WorkflowDef,
} from './adapters.ts'
import {
  commandSurfaceCapability,
  type Delivery,
  shouldGenerateCommands,
  skillReferenceSpelling,
  skillsRootGenerated,
} from './delivery.ts'
import {
  assertWorkflowConditionalsResolved,
  commandWriteReason,
  resolveOptionalWorkflows,
  skillWriteReason,
} from './optional-workflow.ts'

export { type BodyDialect, type HarnessName, HARNESS_NAMES, isHarnessName } from './adapters.ts'

/** The provenance version stamped into generatedBy, single-sourced from package.json. */
export const CANON_VERSION = `cospec@${pkg.version}`

/**
 * One row of the conventional-commit type table (DESIGN §3.3). Track D's `core/schema-compose.ts`
 * owns the canonical values; render only needs these three fields to build the propose table.
 */
export interface TypeTableEntry {
  type: string
  description: string
  summary: string
}

export interface RenderOptions {
  /** Which harnesses to emit files for. */
  harnesses: HarnessName[]
  /** The 11-type table, from Track D's composer. Only needed by the propose workflow. */
  typeTable: TypeTableEntry[]
  /** Override the generatedBy stamp (defaults to CANON_VERSION). Used by tests for stability. */
  version?: string
  /** Override the canon workflows directory (defaults to ../canon/workflows). */
  canonDir?: string
  /**
   * Override the tool rows (defaults to HARNESS_TABLE). A test seam: fixture rows exercise
   * shapes no shipped row uses, and never enter HARNESS_TABLE.
   */
  adapters?: readonly HarnessAdapter[]
  /**
   * The rows that write a shared skills root's skills: when two or more selected rows resolve
   * to one skills root, only the row named here renders that root's skills (its commands and
   * rules files are still every row's own). Absent, every row renders its own skills and the
   * conflict guard below is the only arbiter. A shared root with no writer named is a
   * caller's bug and throws, rather than silently writing no skills.
   */
  skillWriters?: ReadonlySet<string>
  /**
   * The installed workflow ids: only these are emitted, and every optional-workflow
   * conditional resolves against them. Absent, every manifest workflow is installed.
   */
  workflows?: ReadonlySet<string>
  /**
   * A row's own installed set, which replaces `workflows` for that row: `update` keeps every
   * workflow a row already has installed, so rows of one run can hold different sets.
   */
  workflowsByHarness?: ReadonlyMap<string, ReadonlySet<string>>
  /** Which surfaces each row generates (design D5). Absent, `both`. */
  delivery?: Delivery
}

export interface RenderedFile {
  harness: HarnessName
  kind: 'command' | 'skill' | 'rules'
  /** The workflow id, or null for non-workflow files (codex rules). */
  workflow: string | null
  /** Output path: repo-relative, or home-relative when `scope` is `home`. */
  path: string
  scope: 'project' | 'home'
  frontmatter: Record<string, unknown> | null
  /** The markdown body (after slash-substitution and type-table injection). */
  body: string
  /** `sha256:<hex>` over the body section, or null for files without frontmatter. */
  contentHash: string | null
  /** The full file content (frontmatter block + body), ready to write. */
  content: string
}

export interface WorkflowManifest {
  workflows: WorkflowDef[]
}

/**
 * The canon workflow manifest, `canon/workflows/harness.yaml`. With no `canonDir` it
 * resolves through the embedded registry, so the standalone compiled binary (which has no
 * canon dir on disk) reads it too.
 */
export function readWorkflowManifest(canonDir?: string): WorkflowManifest {
  const file =
    canonDir === undefined ? canonFile('workflows/harness.yaml') : join(canonDir, 'harness.yaml')
  return parse(readFileSync(file, 'utf8')) as WorkflowManifest
}

/** Workflow id → skill dir name, the map `transformBody`'s shared dialect spells with. */
export function skillByWorkflowId(manifest: WorkflowManifest): Map<string, string> {
  return new Map(manifest.workflows.map((w) => [w.id, w.skill] as const))
}

/**
 * Compose the per-harness project file set from canon. The body of a workflow is identical
 * across a harness's command and skill file, so both carry the same contentHash.
 */
export function renderHarnessFiles(opts: RenderOptions): RenderedFile[] {
  const version = opts.version ?? CANON_VERSION
  // With no canonDir override, resolve through the embedded registry so the
  // standalone compiled binary works (no canon dir exists on disk there).
  const workflowFile = (name: string): string =>
    opts.canonDir === undefined ? canonFile(`workflows/${name}`) : join(opts.canonDir, name)
  const manifest = readWorkflowManifest(opts.canonDir)
  const table = opts.adapters ?? HARNESS_TABLE

  // References are spelled over the whole manifest; a reference to a workflow outside the set
  // is the canon's to wrap in a conditional, not render's to drop.
  const skillById = skillByWorkflowId(manifest)
  const everyWorkflow = new Set(manifest.workflows.map((w) => w.id))
  const delivery = opts.delivery ?? 'both'

  // Keyed by output path: `codex` and `agents` share the `.agents/skills` root and render
  // byte-identical files there, so selecting both must emit each file exactly once rather
  // than twice (a duplicate row makes writeMarkdown run twice and doctor double-count).
  const out = new Map<string, RenderedFile>()
  const emit = (file: RenderedFile): void => {
    const seen = out.get(file.path)
    if (seen === undefined) {
      out.set(file.path, file)
      return
    }
    if (seen.content !== file.content) {
      throw new Error(
        `harness render conflict: ${seen.harness} and ${file.harness} both write ${file.path} ` +
          'with different content. Harnesses sharing an output root must share a bodyDialect.',
      )
    }
  }

  const sharedRoots = sharedSkillRoots(opts.harnesses, table)
  if (opts.skillWriters !== undefined) {
    for (const [root, ids] of sharedRoots) {
      if (!ids.some((id) => opts.skillWriters!.has(id))) {
        throw new Error(
          `internal: skillWriters names none of ${ids.join(', ')}, which share the ${root.split(':')[1]} skills root`,
        )
      }
    }
  }

  for (const harness of opts.harnesses) {
    const row = adapterFor(harness, table)
    const installed = opts.workflowsByHarness?.get(harness) ?? opts.workflows ?? everyWorkflow
    const workflows = manifest.workflows.filter((w) => installed.has(w.id))
    const skills = skillsRoot(row)
    const rootRows = (sharedRoots.get(skillsRootKey(row)) ?? [harness]).map((id) =>
      adapterFor(id, table),
    )
    const writesSkills =
      skillsRootGenerated(rootRows, delivery) &&
      (opts.skillWriters === undefined ||
        !sharedRoots.has(skillsRootKey(row)) ||
        opts.skillWriters.has(harness))
    const commands = row.commands
    if (commands?.serializer === 'markdown' && commands.frontmatter === undefined) {
      throw new Error(
        `internal: harness '${harness}' has markdown commands but no frontmatter builder`,
      )
    }
    if (
      commands !== undefined &&
      !carriesFrontmatter(commands.serializer) &&
      commands.frontmatter !== undefined
    ) {
      throw new Error(
        `internal: harness '${harness}' has ${commands.serializer} commands, which carry no ` +
          'frontmatter, but declares a frontmatter builder',
      )
    }
    // With no command files to point at, an adapter-backed row's skills name skills instead.
    const skillSpell =
      delivery === 'skills' && commandSurfaceCapability(row) === 'adapter-backed'
        ? skillReferenceSpelling(row)
        : skillSpelling(row)
    for (const w of workflows) {
      // Fragments interpolate first, so the resolver and every later step read the final text.
      // Conditionals resolve on the raw canon body, before the type table and any respelling,
      // so no transformer ever sees a dropped branch.
      const rawBody = resolveOptionalWorkflows(
        interpolateFragments(
          normalizeBody(readFileSync(workflowFile(`${w.id}.md`), 'utf8')),
          w.id,
          (name) => normalizeBody(readFileSync(workflowFile(name), 'utf8')),
        ),
        installed,
      )
      const injected = w.injectTypeTable
        ? rawBody.replace('{{TYPE_TABLE}}', renderTypeTable(opts.typeTable))
        : rawBody
      const skillBody = transformBody(injected, skillSpell.dialect, skillById, skillSpell.prefix)
      // A row's commands spell references by `bodyDialect`, its skills by `skillDialect`
      // (Devin's differ), so a differing command body is respelled from the injected canon.
      const commandSpell = commandSpelling(row)
      const spelled =
        commandSpell.dialect === skillSpell.dialect && commandSpell.prefix === skillSpell.prefix
          ? skillBody
          : transformBody(injected, commandSpell.dialect, skillById, commandSpell.prefix)
      // OpenCode drops a slash command's arguments unless the body names them, so an
      // arg-taking workflow's COMMAND body carries the row's placeholder while its skill body
      // does not — which is why each surface hashes its own body.
      const commandBody =
        commands?.injectArguments !== undefined && w.takesArguments === true
          ? injectArgumentPlaceholder(spelled, commands.injectArguments)
          : spelled
      assertWorkflowConditionalsResolved(skillBody, skillWriteReason(w.skill))
      assertWorkflowConditionalsResolved(commandBody, commandWriteReason(w.id))
      const skillSection = `\n${skillBody}`
      const skillHash = hashBody(skillSection)

      if (writesSkills) {
        emit(
          assemble({
            harness,
            kind: 'skill',
            workflow: w.id,
            path: skillPath(row, w.skill),
            scope: skills.scope,
            frontmatter: buildSkillFrontmatter(w, version, skillHash),
            body: skillBody,
            bodySection: skillSection,
            contentHash: skillHash,
          }),
        )
      }

      const path = shouldGenerateCommands(row, delivery) ? commandPath(row, w.command) : undefined
      if (
        commands !== undefined &&
        !carriesFrontmatter(commands.serializer) &&
        path !== undefined
      ) {
        // Provenance for a frontmatter-less command lives in the manifest, like the rules
        // file, so it has no frontmatter and no body hash. normalizeBody leaves exactly one
        // trailing newline, which upstream's TOML template supplies itself.
        const content =
          commands.serializer === 'toml'
            ? serializeTomlCommand(w.description, commandBody.replace(/\n$/, ''))
            : commands.serializer === 'markdown-header'
              ? serializeMarkdownHeaderCommand(`COSPEC: ${w.title}`, w.description, commandBody)
              : commandBody
        emit({
          harness,
          kind: 'command',
          workflow: w.id,
          path,
          scope: 'project',
          frontmatter: null,
          body: commandBody,
          contentHash: null,
          content,
        })
      } else if (commands?.frontmatter !== undefined && path !== undefined) {
        const commandSection = `\n${commandBody}`
        const commandHash = hashBody(commandSection)
        emit(
          assemble({
            harness,
            kind: 'command',
            workflow: w.id,
            path,
            scope: 'project',
            frontmatter: commands.frontmatter(w, version, commandHash),
            body: commandBody,
            bodySection: commandSection,
            contentHash: commandHash,
          }),
        )
      }
    }

    if (row.rulesPath !== undefined) {
      const body = renderCodexRules(version)
      emit({
        harness,
        kind: 'rules',
        workflow: null,
        path: row.rulesPath,
        scope: 'project',
        frontmatter: null,
        body,
        contentHash: null,
        content: body,
      })
    }
  }
  return [...out.values()]
}

/** A skills root's identity: a project root and a home root of the same name are two roots. */
function skillsRootKey(row: HarnessAdapter): string {
  const { root, scope } = skillsRoot(row)
  return `${scope}:${root}`
}

/** The skills roots two or more of `harnesses` resolve to, each with its rows in selection order. */
function sharedSkillRoots(
  harnesses: readonly HarnessName[],
  table: readonly HarnessAdapter[],
): Map<string, HarnessName[]> {
  const byRoot = new Map<string, HarnessName[]>()
  for (const id of new Set(harnesses)) {
    const key = skillsRootKey(adapterFor(id, table))
    byRoot.set(key, [...(byRoot.get(key) ?? []), id])
  }
  return new Map([...byRoot].filter(([, ids]) => ids.length > 1))
}

/**
 * Compute the body-only content hash exactly as the managed-file layer must (DESIGN §6.3/§6.5).
 * `bodySection` is everything after the closing `---\n` frontmatter delimiter, verbatim
 * (a leading blank line plus the markdown). Track B's split must recover the same substring.
 */
export function hashBody(bodySection: string): string {
  return `sha256:${createHash('sha256').update(bodySection, 'utf8').digest('hex')}`
}

/** Build the propose workflow's AskUserQuestion type table as markdown. */
export function renderTypeTable(entries: TypeTableEntry[]): string {
  const header = '| Type | What it is for | Artifacts |\n| --- | --- | --- |'
  const rows = entries.map((e) => `| ${e.type} | ${e.description} | ${e.summary} |`)
  return [header, ...rows].join('\n')
}

// Ported from the pinned OpenSpec Gemini adapter (dist/core/command-generation/adapters/
// gemini.js); a unit test compares against its formatFile, so keep the replace order.
// C0 except tab/LF/CR, plus DEL, are invalid raw inside any TOML string. A per-character scan
// rather than upstream's regex class, which oxlint's no-control-regex rejects; same set.
function escapeTomlControlChars(value: string): string {
  let out = ''
  for (const c of value) {
    const code = c.charCodeAt(0)
    const invalid =
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    out += invalid ? `\\u${code.toString(16).padStart(4, '0')}` : c
  }
  return out
}

/** Escape a value for a single-line TOML basic string (`"…"`). */
export function escapeTomlBasicString(value: string): string {
  return escapeTomlControlChars(
    value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t'),
  )
}

/**
 * Escape a value for a TOML multiline basic string (`"""…"""`). CRLF is normalized to LF
 * before backslashes are doubled, and `"""` is broken after, so no escape is re-doubled.
 */
export function escapeTomlMultilineBasicString(value: string): string {
  return escapeTomlControlChars(
    value
      .replace(/\r\n/g, '\n')
      .replace(/\\/g, '\\\\')
      .replace(/"""/g, '""\\"')
      .replace(/\r/g, '\\r'),
  )
}

/** A TOML command file: upstream Gemini's `description` + multiline `prompt` layout. */
export function serializeTomlCommand(description: string, body: string): string {
  return `description = "${escapeTomlBasicString(description)}"

prompt = """
${escapeTomlMultilineBasicString(body)}
"""
`
}

/**
 * A Markdown-header command file (Cline, Zoo Code): the title as the one `# ` header the tool
 * reads as the command's name, the description, then the body. A frontmatter block would show
 * up as literal text there.
 */
export function serializeMarkdownHeaderCommand(
  title: string,
  description: string,
  body: string,
): string {
  return `# ${title}\n\n${description}\n\n${body}`
}

interface AssembleArgs {
  harness: HarnessName
  kind: 'command' | 'skill'
  workflow: string
  path: string
  scope: 'project' | 'home'
  frontmatter: Record<string, unknown>
  body: string
  bodySection: string
  contentHash: string
}

function assemble(args: AssembleArgs): RenderedFile {
  const content = `---\n${serializeFrontmatter(args.frontmatter)}---\n${args.bodySection}`
  return {
    harness: args.harness,
    kind: args.kind,
    workflow: args.workflow,
    path: args.path,
    scope: args.scope,
    frontmatter: args.frontmatter,
    body: args.body,
    contentHash: args.contentHash,
    content,
  }
}

/**
 * The shared fragments a canon body names by token, each a canon file read once per render.
 * `{{TYPE_TABLE}}` is injected separately, per workflow, so it is not here.
 */
export const FRAGMENTS: Readonly<Record<string, string>> = {
  '{{ROOT_GUARD}}': '_shared/root-guard.md',
}

const TOKEN_PATTERN = /\{\{[^{}\n]*\}\}/g

/**
 * Replace each registered `{{NAME}}` token in a workflow body with its fragment's text. A body
 * must carry every registered token exactly once, so a guard cannot be forgotten or doubled,
 * and any other `{{NAME}}` token (bar `{{TYPE_TABLE}}`) is a typo that must not reach a user.
 */
export function interpolateFragments(
  body: string,
  workflow: string,
  read: (fragment: string) => string,
): string {
  for (const token of body.match(TOKEN_PATTERN) ?? []) {
    if (token !== '{{TYPE_TABLE}}' && FRAGMENTS[token] === undefined) {
      throw new Error(
        `workflow '${workflow}' carries the unregistered token ${token}; ` +
          `registered fragments: ${Object.keys(FRAGMENTS).join(', ')}`,
      )
    }
  }
  let out = body
  for (const [token, file] of Object.entries(FRAGMENTS)) {
    const count = body.split(token).length - 1
    if (count !== 1) {
      throw new Error(`workflow '${workflow}' must carry ${token} exactly once, found ${count}`)
    }
    out = out.replace(token, () => read(file).replace(/\n$/, ''))
  }
  return out
}

function normalizeBody(raw: string): string {
  return `${raw.replace(/^\n+/, '').replace(/\s+$/, '')}\n`
}
