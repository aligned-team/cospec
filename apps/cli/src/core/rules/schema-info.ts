// Resolved-schema view + the loaded-change bundle the rule layer consumes. These
// are plain data so every rule is a pure function testable without Track B. The
// validate command (glue) assembles a LoadedChange from the filesystem + Track B's
// change discovery and hands it to runCospecRules.

import type { LivingSpec } from '../deltas.ts'
import { ARTIFACT_FILES, isCospecType, TYPE_FACTS, type TypeFacts } from './type-facts.ts'

export interface ArtifactSpec {
  id: string
  generates: string
  requires: string[]
}

export interface SchemaInfo {
  /** schema/type name from .openspec.yaml. */
  name: string
  /** whether name ∈ the 11 cospec types. */
  isCospec: boolean
  /** whether the schema resolves anywhere (project/user/package) — legacy detection. */
  resolvable: boolean
  /** declared artifact ids. */
  declared: Set<string>
  artifacts: ArtifactSpec[]
  applyRequires: string[]
  /** cospec artifacts NOT declared by this schema (their files are forbidden). */
  forbidden: Set<string>
  /** cospec type facts (only when isCospec). */
  facts?: TypeFacts
}

/**
 * Build a SchemaInfo from a schema name and its parsed schema.yaml artifacts.
 * `resolvable` reflects whether Track B could resolve the schema at all.
 */
export function deriveSchemaInfo(
  name: string,
  artifacts: ArtifactSpec[],
  applyRequires: string[],
  resolvable: boolean,
): SchemaInfo {
  const declared = new Set(artifacts.map((a) => a.id))
  const cospec = isCospecType(name)
  const forbidden = new Set<string>()
  for (const id of Object.keys(ARTIFACT_FILES)) if (!declared.has(id)) forbidden.add(id)
  if (!declared.has('specs')) forbidden.add('specs')
  return {
    name,
    isCospec: cospec,
    resolvable,
    declared,
    artifacts,
    applyRequires,
    forbidden,
    facts: cospec ? TYPE_FACTS[name as keyof typeof TYPE_FACTS] : undefined,
  }
}

export interface OpenspecYaml {
  present: boolean
  parseable: boolean
  schema?: string
  created?: string
  /** the change-creation schema version (DESIGN §5); absent ⇒ callers treat it as 1. */
  schemaVersion?: number
  /** a `schemaVersion:` key present but not a positive integer (meta/openspec-yaml). */
  schemaVersionInvalid?: boolean
}

export interface DeltaFileInput {
  /** repo-relative path, e.g. `specs/widgets/spec.md`. */
  path: string
  capability: string
  text: string
}

export interface LoadedChange {
  id: string
  openspecYaml: OpenspecYaml
  /** repo-relative file paths under the change dir (files only). */
  files: string[]
  proposalText?: string
  blockersText?: string
  tasksText?: string
  verificationText?: string
  designExists: boolean
  /** design.md content, when present — the design/* section rules parse this. */
  designText?: string
  deltaFiles: DeltaFileInput[]
  /** living specs by capability (openspec/specs/<cap>/spec.md), parsed. */
  livingSpecs: Map<string, LivingSpec>
}

export interface ValidateContext {
  archiveSlugs: Set<string>
  activeSlugs: Set<string>
  /** project-extended verification layers (openspec/config.yaml verification.layers). */
  verificationLayers?: readonly string[]
}
