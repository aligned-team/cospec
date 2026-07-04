import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

/**
 * Canon → openspec `schema.yaml` composer (DESIGN §3). The 11 `canon/types/<type>.yaml` files plus
 * the 5 shared `canon/artifacts/<id>/meta.yaml` files are the only hand-authored surface; this
 * module merges them into a per-type `schema.yaml` text + `templates/*.md` map, and exports the
 * conventional-commit type table consumed by `new`, `check-commit`, and harness rendering.
 *
 * The serializer is purpose-built (not a generic YAML dump) so the output matches the frozen
 * schema bodies in DESIGN §3.4–§3.6 byte-for-byte.
 */

/** The 11 conventional-commit types, in commitlint/type-enum order (DESIGN §3.2). */
export const COSPEC_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
] as const

export type CospecType = (typeof COSPEC_TYPES)[number]

/** The 5 canonical artifact ids, in canonical schema order (DESIGN §3.1). */
export const ARTIFACT_ORDER = ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'] as const

export type ArtifactId = (typeof ARTIFACT_ORDER)[number]

export type ArtifactState = 'required' | 'optional' | 'forbidden'

export type ProposalVariant = 'full' | 'lite'

/** One composed artifact block as it appears under `artifacts:` in schema.yaml. */
export interface ArtifactDef {
  id: string
  generates: string
  description: string
  template: string
  instruction: string
  requires: string[]
}

/** The composed `apply:` block. */
export interface ApplyDef {
  requires: string[]
  tracks: string
  instruction: string
}

/** A fully composed schema (pre-serialization). */
export interface ComposedSchema {
  name: string
  version: number
  description: string
  artifacts: ArtifactDef[]
  apply: ApplyDef
}

/** A composed type: its schema, the serialized schema.yaml, and its template files. */
export interface ComposedType {
  type: CospecType
  schema: ComposedSchema
  /** The exact `schema.yaml` file body (ends with a trailing newline). */
  schemaYaml: string
  /** template filename (under `templates/`) → body. */
  templates: Record<string, string>
}

/**
 * The frozen type-table row consumed by other tracks. Structurally assignable to the harness
 * track's `TypeTableEntry` ({ type, description, summary }); the extra fields drive `new` and
 * `check-commit`.
 */
export interface CospecTypeInfo {
  type: CospecType
  /** Short human description (DESIGN §3.3), used in the propose/new type table. */
  description: string
  /** Artifact-flow summary (DESIGN §3.3), used in the propose/new type table. */
  summary: string
  proposalVariant: ProposalVariant
  /** Declared artifact ids, in canonical order (not-forbidden). */
  declaredArtifacts: ArtifactId[]
  /** Artifacts declared but not in apply.requires. */
  optionalArtifacts: ArtifactId[]
  /** specs/design ids the type forbids (`meta/forbidden-artifact` fires if present). */
  forbiddenArtifacts: ArtifactId[]
  /** apply.requires — the mechanically gated set. */
  requiredArtifacts: string[]
  /** Number of required (gated) artifacts. */
  artifactCount: number
}

export interface ComposeOptions {
  /** Override the canon root (defaults to ../canon relative to this module). */
  canonDir?: string
}

// ---------------------------------------------------------------------------
// canon loading
// ---------------------------------------------------------------------------

interface TypeCanon {
  type: CospecType
  description: string
  summary: string
  schemaDescription: string
  proposal: ProposalVariant
  blocking: ProposalVariant
  liteDomain?: string
  artifacts: { specs: ArtifactState; design: ArtifactState }
  apply_requires: string[]
  tasks_requires?: string[]
  proposalDescription: string
  proposalInstruction: string
  specsDescription?: string
  specsLead?: string
  designDescription?: string
  designInstruction?: string
  tasksInstruction?: string
}

interface ProposalMeta {
  templates: Record<ProposalVariant, string>
}

interface BlockingMeta {
  generates: string
  template: string
  descriptions: Record<ProposalVariant, string>
  templateBody: string
  instructions: Record<ProposalVariant, string>
}

interface SimpleArtifactMeta {
  generates: string
  template: string
  description: string
  templateBody: string
  instruction: string
}

function defaultCanonDir(): string {
  return join(import.meta.dir, '..', 'canon')
}

function readYaml<T>(path: string): T {
  return parse(readFileSync(path, 'utf8')) as T
}

interface CanonBundle {
  proposal: ProposalMeta
  blocking: BlockingMeta
  specs: SimpleArtifactMeta
  design: SimpleArtifactMeta
  tasks: SimpleArtifactMeta
  applyInstruction: string
}

function loadCanon(canonDir: string): CanonBundle {
  const art = (id: string) => join(canonDir, 'artifacts', id, 'meta.yaml')
  return {
    proposal: readYaml<ProposalMeta>(art('proposal')),
    blocking: readYaml<BlockingMeta>(art('blocking-changes')),
    specs: readYaml<SimpleArtifactMeta>(art('specs')),
    design: readYaml<SimpleArtifactMeta>(art('design')),
    tasks: readYaml<SimpleArtifactMeta>(art('tasks')),
    applyInstruction: readYaml<{ instruction: string }>(join(canonDir, 'apply-instruction.yaml'))
      .instruction,
  }
}

function loadType(canonDir: string, type: string): TypeCanon {
  return readYaml<TypeCanon>(join(canonDir, 'types', `${type}.yaml`))
}

// ---------------------------------------------------------------------------
// composition
// ---------------------------------------------------------------------------

/** Compose lite blocking instruction: substitute {{type}} / {{domain}}. */
function fillLite(body: string, type: string, domain: string): string {
  return body.replaceAll('{{type}}', type).replaceAll('{{domain}}', domain)
}

/** tasks.requires: proposal, plus specs where specs is required, plus design where design is. */
function computeTasksRequires(t: TypeCanon): string[] {
  const req = ['proposal']
  if (t.artifacts.specs === 'required') req.push('specs')
  if (t.artifacts.design === 'required') req.push('design')
  return req
}

/**
 * Compose the structured schema for one type. Reads the type canon and the shared artifact meta;
 * does not serialize. Throws if the type is unknown or the canon is malformed.
 */
export function composeSchema(type: string, opts: ComposeOptions = {}): ComposedSchema {
  if (!(COSPEC_TYPES as readonly string[]).includes(type)) {
    throw new Error(`composeSchema: unknown type '${type}'`)
  }
  const canonDir = opts.canonDir ?? defaultCanonDir()
  const canon = loadCanon(canonDir)
  const t = loadType(canonDir, type)

  const artifacts: ArtifactDef[] = []

  artifacts.push({
    id: 'proposal',
    generates: 'proposal.md',
    description: t.proposalDescription,
    template: 'proposal.md',
    instruction: t.proposalInstruction,
    requires: [],
  })

  artifacts.push({
    id: 'blocking-changes',
    generates: canon.blocking.generates,
    description: canon.blocking.descriptions[t.blocking],
    template: canon.blocking.template,
    instruction:
      t.blocking === 'lite'
        ? fillLite(canon.blocking.instructions.lite, t.type, t.liteDomain ?? t.type)
        : canon.blocking.instructions.full,
    requires: ['proposal'],
  })

  if (t.artifacts.specs !== 'forbidden') {
    const shared = canon.specs.instruction
    artifacts.push({
      id: 'specs',
      generates: canon.specs.generates,
      description: t.specsDescription ?? canon.specs.description,
      template: canon.specs.template,
      instruction: t.specsLead ? `${t.specsLead.trimEnd()}\n${shared}` : shared,
      requires: ['proposal'],
    })
  }

  if (t.artifacts.design !== 'forbidden') {
    artifacts.push({
      id: 'design',
      generates: canon.design.generates,
      description: t.designDescription ?? canon.design.description,
      template: canon.design.template,
      instruction: t.designInstruction ?? canon.design.instruction,
      requires: ['proposal'],
    })
  }

  artifacts.push({
    id: 'tasks',
    generates: canon.tasks.generates,
    description: canon.tasks.description,
    template: canon.tasks.template,
    instruction: t.tasksInstruction ?? canon.tasks.instruction,
    requires: t.tasks_requires ?? computeTasksRequires(t),
  })

  const schema: ComposedSchema = {
    name: t.type,
    version: 1,
    description: t.schemaDescription,
    artifacts,
    apply: {
      requires: t.apply_requires,
      tracks: 'tasks.md',
      instruction: canon.applyInstruction,
    },
  }

  validateComposedSchema(schema)
  return schema
}

/** Compose the template file map (filename under templates/ → body) for a type. */
export function composeTemplates(type: string, opts: ComposeOptions = {}): Record<string, string> {
  const canonDir = opts.canonDir ?? defaultCanonDir()
  const canon = loadCanon(canonDir)
  const t = loadType(canonDir, type)

  const templates: Record<string, string> = {
    'proposal.md': canon.proposal.templates[t.proposal],
    'blocking-changes.md': canon.blocking.templateBody,
    'tasks.md': canon.tasks.templateBody,
  }
  if (t.artifacts.specs !== 'forbidden') templates['spec.md'] = canon.specs.templateBody
  if (t.artifacts.design !== 'forbidden') templates['design.md'] = canon.design.templateBody
  return templates
}

/** Compose one type end to end: structured schema, serialized schema.yaml, and templates. */
export function composeType(type: string, opts: ComposeOptions = {}): ComposedType {
  const schema = composeSchema(type, opts)
  return {
    type: schema.name as CospecType,
    schema,
    schemaYaml: serializeSchema(schema),
    templates: composeTemplates(type, opts),
  }
}

/** Compose every type, in COSPEC_TYPES order. */
export function composeAllTypes(opts: ComposeOptions = {}): ComposedType[] {
  return COSPEC_TYPES.map((type) => composeType(type, opts))
}

// ---------------------------------------------------------------------------
// self-validation (mirrors openspec's Zod shape + reference/acyclicity checks)
// ---------------------------------------------------------------------------

/**
 * Assert the composed schema is structurally valid the way openspec's loader is: positive int
 * version, ≥1 artifact, unique ids, non-empty generates/template, every `requires` target exists,
 * apply.requires non-empty and referencing existing artifacts, and an acyclic requires graph.
 * Throws on the first violation.
 */
export function validateComposedSchema(schema: ComposedSchema): void {
  if (!schema.name) throw new Error('schema.name is empty')
  if (!Number.isInteger(schema.version) || schema.version <= 0) {
    throw new Error(`schema.version must be a positive integer (got ${schema.version})`)
  }
  if (schema.artifacts.length < 1) throw new Error('schema.artifacts is empty')

  const ids = new Set<string>()
  for (const a of schema.artifacts) {
    if (!a.id) throw new Error('artifact id is empty')
    if (ids.has(a.id)) throw new Error(`duplicate artifact id '${a.id}'`)
    ids.add(a.id)
    if (!a.generates) throw new Error(`artifact '${a.id}' has empty generates`)
    if (!a.template) throw new Error(`artifact '${a.id}' has empty template`)
  }
  for (const a of schema.artifacts) {
    for (const r of a.requires) {
      if (!ids.has(r)) {
        throw new Error(`artifact '${a.id}' requires '${r}' which does not exist`)
      }
    }
  }
  if (schema.apply.requires.length < 1) throw new Error('apply.requires is empty')
  for (const r of schema.apply.requires) {
    if (!ids.has(r)) throw new Error(`apply.requires references '${r}' which does not exist`)
  }
  if (!schema.apply.tracks) throw new Error('apply.tracks is empty')

  assertAcyclic(schema.artifacts)
}

function assertAcyclic(artifacts: ArtifactDef[]): void {
  const deps = new Map<string, string[]>(artifacts.map((a) => [a.id, a.requires]))
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string, stack: string[]): void => {
    const s = state.get(id)
    if (s === 'done') return
    if (s === 'visiting') {
      throw new Error(`cyclic requires: ${[...stack, id].join(' → ')}`)
    }
    state.set(id, 'visiting')
    for (const r of deps.get(id) ?? []) visit(r, [...stack, id])
    state.set(id, 'done')
  }
  for (const a of artifacts) visit(a.id, [])
}

// ---------------------------------------------------------------------------
// serialization (purpose-built to match DESIGN §3.4–§3.6 byte-for-byte)
// ---------------------------------------------------------------------------

const HEADER = (type: string): string[] => [
  '# generated by conventional-openspec — do not edit here.',
  `# Customize via openspec/config.yaml (context, rules); full ownership: \`openspec schema fork ${type} <name>\`.`,
]

/** Does a plain scalar need double-quoting to survive a YAML round-trip? */
function needsQuote(v: string): boolean {
  if (v === '') return true
  if (/^[\s]|[\s]$/.test(v)) return true
  if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(v)) return true
  if (/:\s|\s#/.test(v)) return true
  if (/[:*?[\]{}]/.test(v)) return true
  if (/^(true|false|null|~|-?\d)/i.test(v)) return true
  return false
}

/** Single-quote a scalar (YAML single-quote escaping doubles an embedded quote). */
function quote(v: string): string {
  return `'${v.replaceAll("'", "''")}'`
}

function scalar(v: string): string {
  return needsQuote(v) ? quote(v) : v
}

function flowSeq(items: string[]): string {
  return `[${items.join(', ')}]`
}

/** Emit a `key: |` literal block, body indented `indent + 2`. */
function blockScalar(key: string, value: string, indent: number): string[] {
  const pad = ' '.repeat(indent)
  const bodyPad = ' '.repeat(indent + 2)
  const lines = value.replace(/\n$/, '').split('\n')
  const out = [`${pad}${key}: |`]
  for (const line of lines) out.push(line === '' ? '' : `${bodyPad}${line}`)
  return out
}

/** Serialize a composed schema to the exact schema.yaml body (with trailing newline). */
export function serializeSchema(schema: ComposedSchema): string {
  const lines: string[] = [...HEADER(schema.name)]
  lines.push(`name: ${scalar(schema.name)}`)
  lines.push(`version: ${schema.version}`)
  lines.push(`description: ${quote(schema.description)}`)
  lines.push('artifacts:')
  for (const a of schema.artifacts) {
    lines.push(`  - id: ${scalar(a.id)}`)
    lines.push(`    generates: ${scalar(a.generates)}`)
    lines.push(`    description: ${scalar(a.description)}`)
    lines.push(`    template: ${scalar(a.template)}`)
    lines.push(...blockScalar('instruction', a.instruction, 4))
    lines.push(`    requires: ${flowSeq(a.requires)}`)
  }
  lines.push('apply:')
  lines.push(`  requires: ${flowSeq(schema.apply.requires)}`)
  lines.push(`  tracks: ${scalar(schema.apply.tracks)}`)
  lines.push(...blockScalar('instruction', schema.apply.instruction, 2))
  return `${lines.join('\n')}\n`
}

// ---------------------------------------------------------------------------
// type table (frozen export consumed by `new`, `check-commit`, harness render)
// ---------------------------------------------------------------------------

/** Load the full conventional-commit type table from canon. */
export function loadTypeTable(opts: ComposeOptions = {}): CospecTypeInfo[] {
  const canonDir = opts.canonDir ?? defaultCanonDir()
  return COSPEC_TYPES.map((type) => {
    const t = loadType(canonDir, type)
    const declared: ArtifactId[] = ['proposal', 'blocking-changes']
    if (t.artifacts.specs !== 'forbidden') declared.push('specs')
    if (t.artifacts.design !== 'forbidden') declared.push('design')
    declared.push('tasks')
    const forbidden: ArtifactId[] = []
    if (t.artifacts.specs === 'forbidden') forbidden.push('specs')
    if (t.artifacts.design === 'forbidden') forbidden.push('design')
    const optional = declared.filter((id) => !t.apply_requires.includes(id))
    return {
      type,
      description: t.description,
      summary: t.summary,
      proposalVariant: t.proposal,
      declaredArtifacts: declared,
      optionalArtifacts: optional,
      forbiddenArtifacts: forbidden,
      requiredArtifacts: t.apply_requires,
      artifactCount: t.apply_requires.length,
    }
  })
}

/** The type table computed once from the shipped canon. */
export const TYPE_TABLE: CospecTypeInfo[] = loadTypeTable()

/** Look up one type's info, or undefined if not a cospec type. */
export function getTypeInfo(type: string): CospecTypeInfo | undefined {
  return TYPE_TABLE.find((t) => t.type === type)
}

export function isCospecType(name: string): name is CospecType {
  return (COSPEC_TYPES as readonly string[]).includes(name)
}
