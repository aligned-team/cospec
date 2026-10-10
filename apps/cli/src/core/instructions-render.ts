// cospec's `instructions <artifact>` answer, built from the pinned binary's
// own `--json` document (change `upstream-spellings`, design decision 11): the
// document's command-bearing fields are spelled through cospec structurally
// (`respellCommandFields` with the whole-value remedy rule), and the human
// text is rendered from the rewritten document by a port of the binary's
// printer (`dist/commands/workflow/instructions.js` `printInstructionsText`
// and `dist/core/references.js` `renderReferencedStoresBlock` with its
// escape helpers, `@fission-ai/openspec` 1.13.1). The rendered text is never
// pattern-matched: a user's template, context, rule, spec Purpose, store id or
// path reaches the answer exactly as the binary prints it.

import { join } from 'node:path'

import { type CommandField, respellCommandFields } from './passthrough-command.ts'
import { respellSchemaLines } from './remedies.ts'

/** The fields of the binary's document the printer reads. */
export interface InstructionsDocument {
  artifactId: string
  changeName: string
  schemaName: string
  changeDir: string
  resolvedOutputPath: string
  description: string
  instruction?: string
  context?: string
  rules?: string[]
  references?: ReferenceEntry[]
  skipped?: boolean
  warning?: string
  template: string
  dependencies: {
    id: string
    done: boolean
    path: string
    description: string
    skipped?: boolean
  }[]
  unlocks: string[]
}

export interface ReferenceEntry {
  store_id: string
  root?: string
  specs?: { id: string; summary: string }[]
  fetch?: string
  status: { message: string; fix?: string }[]
}

/**
 * The command-bearing fields of an `instructions` document: the fields
 * `dist/core/references.js` fills with a command for the user to run. Each
 * is rewritten only when its whole value is an allowlisted remedy.
 */
export const INSTRUCTIONS_COMMAND_FIELDS: readonly CommandField[] = [
  { path: ['references', '[]', 'fetch'], rule: 'remedy' },
  { path: ['references', '[]', 'status', '[]', 'fix'], rule: 'remedy' },
]

/** `doc` with only its command-bearing reference fields spelled through cospec. */
export function respellInstructionsDocument<T>(doc: T): T {
  return respellCommandFields(doc, INSTRUCTIONS_COMMAND_FIELDS)
}

/**
 * `doc` with the pinned built-in schema's own lines in its `instruction` and
 * `template` spelled through cospec (`SCHEMA_LINES`). Only for a document
 * whose schema resolves from the package; every other line is unchanged.
 */
export function respellBuiltInSchemaLines<T extends object>(doc: T): T {
  const out = structuredClone(doc) as Record<string, unknown>
  for (const key of ['instruction', 'template'])
    if (typeof out[key] === 'string') out[key] = respellSchemaLines(out[key])
  return out as T
}

/** The binary's text answer for `doc`, as `printInstructionsText` prints it. */
export function renderInstructionsText(doc: InstructionsDocument): string {
  const out: string[] = []
  const log = (line = '') => out.push(`${line}\n`)
  const { artifactId, changeName, schemaName, changeDir, resolvedOutputPath, description } = doc
  const { instruction, context, rules, template, dependencies, unlocks } = doc
  log(
    `<artifact id="${escapeEnvelopeAttribute(artifactId)}"` +
      ` change="${escapeEnvelopeAttribute(changeName)}"` +
      ` schema="${escapeEnvelopeAttribute(schemaName)}">`,
  )
  log()
  if (doc.skipped) {
    log('<warning>')
    log(doc.warning ?? 'This artifact is skipped (skip_specs is set in .openspec.yaml).')
    log('</warning>')
    log()
    log('</artifact>')
    return out.join('')
  }
  if (dependencies.some((d) => !d.done)) {
    const missing = dependencies.filter((d) => !d.done).map((d) => d.id)
    log('<warning>')
    log('This artifact has unmet dependencies. Complete them first or proceed with caution.')
    log(`Missing: ${missing.join(', ')}`)
    log('</warning>')
    log()
  }
  log('<task>')
  log(
    `Create the ${escapeEnvelopeTags(artifactId)} artifact for change "${escapeEnvelopeTags(changeName)}".`,
  )
  log(escapeEnvelopeTags(description))
  log('</task>')
  log()
  if (context) {
    log('<project_context>')
    log('<!-- This is background information for you. Do NOT include this in your output. -->')
    log(escapeEnvelopeTags(context))
    log('</project_context>')
    log()
  }
  if (doc.references && doc.references.length > 0) {
    log(renderReferencedStoresBlock(doc.references))
    log()
  }
  if (rules && rules.length > 0) {
    log('<rules>')
    log('<!-- These are constraints for you to follow. Do NOT include this in your output. -->')
    for (const rule of rules) log(`- ${escapeEnvelopeTags(sanitizeInline(rule, Infinity))}`)
    log('</rules>')
    log()
  }
  if (dependencies.length > 0) {
    log('<dependencies>')
    log(
      'Read the current contents of these files before creating this artifact (re-read them from disk even if you saw them earlier - they may have been edited):',
    )
    log()
    for (const dep of dependencies) {
      if (dep.skipped) {
        log(`<dependency id="${dep.id}" status="skipped">`)
        log(
          `  <description>Skipped: the change declares skip_specs, so this artifact has no files to read.</description>`,
        )
        log('</dependency>')
        continue
      }
      log(`<dependency id="${dep.id}" status="${dep.done ? 'done' : 'missing'}">`)
      log(`  <path>${join(changeDir, dep.path)}</path>`)
      log(`  <description>${escapeEnvelopeTags(dep.description)}</description>`)
      log('</dependency>')
    }
    log('</dependencies>')
    log()
  }
  log('<output>')
  log(`Write to: ${resolvedOutputPath}`)
  log('</output>')
  log()
  if (instruction) {
    log('<instruction>')
    log(escapeEnvelopeTags(instruction.trim()))
    log('</instruction>')
    log()
  }
  log('<template>')
  log('<!-- Use this as the structure for your output file. Fill in the sections. -->')
  log(escapeEnvelopeTags(template.trim()))
  log('</template>')
  log()
  log('<success_criteria>')
  log('<!-- To be defined in schema validation rules -->')
  log('</success_criteria>')
  log()
  if (unlocks.length > 0) {
    log('<unlocks>')
    log(`Completing this artifact enables: ${unlocks.join(', ')}`)
    log('</unlocks>')
    log()
  }
  log('</artifact>')
  return out.join('')
}

function renderReferencedStoresBlock(entries: readonly ReferenceEntry[]): string {
  const lines = [
    '<referenced_stores>',
    '<!-- Read-only upstream context. Fetch what you need; cite what you use. -->',
  ]
  for (const entry of entries) lines.push(...renderEntryLines(entry))
  lines.push('</referenced_stores>')
  return lines.join('\n')
}

/**
 * The apply-instructions markdown section for `entries`, as the binary's
 * `renderReferencedStoresSection` prints it (`dist/core/references.js`).
 */
export function renderReferencedStoresSection(entries: readonly ReferenceEntry[]): string {
  const lines = [
    '### Referenced Stores',
    '',
    'Read-only upstream context. Fetch what you need; cite what you use.',
    '',
  ]
  for (const entry of entries) lines.push(...renderEntryLines(entry))
  return lines.join('\n')
}

function renderEntryLines(entry: ReferenceEntry): string[] {
  const lines: string[] = []
  if (entry.root !== undefined) {
    lines.push(`Store ${entry.store_id} (${entry.root}):`)
    for (const spec of entry.specs ?? []) lines.push(specLine(spec))
    if (entry.fetch) lines.push(`  Fetch: ${entry.fetch}`)
    for (const diagnostic of entry.status) {
      lines.push(`  Note: ${diagnostic.message}`)
      if (diagnostic.fix) lines.push(`  Fix: ${diagnostic.fix}`)
    }
  } else {
    for (const diagnostic of entry.status) {
      lines.push(`Store ${entry.store_id}: ${diagnostic.message}`)
      if (diagnostic.fix) lines.push(`  Fix: ${diagnostic.fix}`)
    }
  }
  return lines
}

function specLine(spec: { id: string; summary: string }): string {
  const id = sanitizeInline(spec.id, 100)
  return spec.summary ? `  - ${id}: ${spec.summary}` : `  - ${id}`
}

export function sanitizeInline(value: string, maxLength = 300): string {
  // oxlint-disable-next-line no-control-regex -- the binary's own class, verbatim
  const flattened = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}…` : flattened
}

const ENVELOPE_TAGS = [
  'artifact',
  'dependencies',
  'dependency',
  'description',
  'instruction',
  'output',
  'path',
  'project_context',
  'rules',
  'success_criteria',
  'task',
  'template',
  'unlocks',
  'warning',
]

const ENVELOPE_TAG = new RegExp(`<(/?)(${ENVELOPE_TAGS.join('|')})(\\s[^<>]*)?>`, 'gi')

function escapeEnvelopeTags(value: string): string {
  return value.replace(
    ENVELOPE_TAG,
    (_match, slash: string, tag: string, attrs: string | undefined) =>
      `&lt;${slash}${tag}${attrs ?? ''}&gt;`,
  )
}

function escapeEnvelopeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
