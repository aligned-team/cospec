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

  const skillById = skillByWorkflowId(manifest)

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

  for (const harness of opts.harnesses) {
    const row = adapterFor(harness, table)
    const skills = skillsRoot(row)
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
    for (const w of manifest.workflows) {
      const rawBody = normalizeBody(readFileSync(workflowFile(`${w.id}.md`), 'utf8'))
      const injected = w.injectTypeTable
        ? rawBody.replace('{{TYPE_TABLE}}', renderTypeTable(opts.typeTable))
        : rawBody
      const skillSpell = skillSpelling(row)
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
      const skillSection = `\n${skillBody}`
      const skillHash = hashBody(skillSection)

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

      const path = commandPath(row, w.command)
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

function normalizeBody(raw: string): string {
  return `${raw.replace(/^\n+/, '').replace(/\s+$/, '')}\n`
}
