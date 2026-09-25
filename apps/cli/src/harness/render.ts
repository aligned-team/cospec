import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import pkg from '../../package.json'
import { canonFile } from '../canon/embedded.ts'
import {
  adapterFor,
  buildSkillFrontmatter,
  commandPath,
  HARNESS_TABLE,
  type HarnessAdapter,
  type HarnessName,
  injectOpenCodeArgs,
  renderCodexRules,
  serializeFrontmatter,
  skillsRoot,
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

interface WorkflowManifest {
  workflows: WorkflowDef[]
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
  const manifest = parse(readFileSync(workflowFile('harness.yaml'), 'utf8')) as WorkflowManifest
  const table = opts.adapters ?? HARNESS_TABLE

  const skillById = new Map(manifest.workflows.map((w) => [w.id, w.skill] as const))

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
    if (commands !== undefined && commands.serializer !== 'markdown') {
      throw new Error(
        `internal: harness '${harness}' uses the ${commands.serializer} command serializer, ` +
          'which render does not implement yet',
      )
    }
    if (commands !== undefined && commands.frontmatter === undefined) {
      throw new Error(
        `internal: harness '${harness}' has markdown commands but no frontmatter builder`,
      )
    }
    for (const w of manifest.workflows) {
      const rawBody = normalizeBody(readFileSync(workflowFile(`${w.id}.md`), 'utf8'))
      const injected = w.injectTypeTable
        ? rawBody.replace('{{TYPE_TABLE}}', renderTypeTable(opts.typeTable))
        : rawBody
      const skillBody = transformBody(injected, row.bodyDialect, skillById, row.invocationPrefix)
      // OpenCode drops a slash command's arguments unless the body names them, so an
      // arg-taking workflow's COMMAND body carries `$ARGUMENTS` while its skill body
      // does not — which is why each surface hashes its own body.
      const commandBody =
        commands?.injectArguments === true && w.takesArguments === true
          ? injectOpenCodeArgs(skillBody)
          : skillBody
      const skillSection = `\n${skillBody}`
      const skillHash = hashBody(skillSection)

      emit(
        assemble({
          harness,
          kind: 'skill',
          workflow: w.id,
          path: `${skills.root}/${w.skill}/SKILL.md`,
          scope: skills.scope,
          frontmatter: buildSkillFrontmatter(w, version, skillHash),
          body: skillBody,
          bodySection: skillSection,
          contentHash: skillHash,
        }),
      )

      const path = commandPath(row, w.command)
      if (commands?.frontmatter !== undefined && path !== undefined) {
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
