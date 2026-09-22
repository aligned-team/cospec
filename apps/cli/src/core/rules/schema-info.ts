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
  /**
   * `skip_specs:` — a persisted declaration that this change carries no delta
   * specs, the durable equivalent of `cospec archive --skip-specs`. Only a
   * boolean lands here; a present-but-non-boolean value sets the flag below.
   */
  skipSpecs?: boolean
  /** a `skip_specs:` key present but not a boolean (meta/skip-specs-type). */
  skipSpecsInvalid?: boolean
  /** `retire_capabilities:` — this change intentionally retires capabilities. */
  retireCapabilities?: boolean
  /** a `retire_capabilities:` key present but not a boolean (meta/retire-capabilities-type). */
  retireCapabilitiesInvalid?: boolean
}

export interface DeltaFileInput {
  /** repo-relative path, e.g. `specs/widgets/spec.md`. */
  path: string
  capability: string
  text: string
}

export interface UnreadSpecFileInput {
  /** change-relative path, e.g. `specs/widgets/notes.md` or `specs/widgets.md`. */
  path: string
  /**
   * The `spec.md` the merge path reads instead, change-relative — openspec's
   * `UnreadDeltaFile.expected`, prefixed the way cospec reports paths.
   */
  expected: string
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
  /**
   * Markdown under the change's `specs/` that is NOT a capability's `spec.md`,
   * so neither openspec's change parser nor cospec's `deltaFiles` above ever
   * reads it. Carried so `deltas/unread-file` can tell a companion note (fine)
   * from a delta written at a path the merge drops (data loss).
   */
  unreadSpecFiles: UnreadSpecFileInput[]
  /** living specs by capability (openspec/specs/<cap>/spec.md), parsed. */
  livingSpecs: Map<string, LivingSpec>
}

export interface ValidateContext {
  archiveSlugs: Set<string>
  activeSlugs: Set<string>
  /** project-extended verification layers (openspec/config.yaml verification.layers). */
  verificationLayers?: readonly string[]
}
