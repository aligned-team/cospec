// Test helpers for the rule-layer unit tests (not a test file itself). Builds a
// LoadedChange / SchemaInfo without touching the filesystem so every rule is
// exercised as the pure function it is.

import {
  deriveSchemaInfo,
  type ArtifactSpec,
  type LoadedChange,
  type SchemaInfo,
  type ValidateContext,
} from '../../../src/core/rules/schema-info.ts'
import {
  ARTIFACT_GENERATES,
  TYPE_ARTIFACTS,
  type ArtifactId,
  type CospecType,
} from '../../../src/core/rules/type-facts.ts'

export function cospecSchema(type: CospecType): SchemaInfo {
  const ta = TYPE_ARTIFACTS[type]
  const artifacts: ArtifactSpec[] = ta.declared.map((id: ArtifactId) => ({
    id,
    generates: ARTIFACT_GENERATES[id],
    requires: [],
  }))
  return deriveSchemaInfo(type, artifacts, ta.applyRequires, true)
}

export function legacySchema(name: string, resolvable = true): SchemaInfo {
  return deriveSchemaInfo(name, [], [], resolvable)
}

export function makeChange(overrides: Partial<LoadedChange> = {}): LoadedChange {
  return {
    id: 'a-change',
    openspecYaml: { present: true, parseable: true, schema: 'feat' },
    files: [],
    designExists: false,
    deltaFiles: [],
    livingSpecs: new Map(),
    ...overrides,
  }
}

export function ctx(overrides: Partial<ValidateContext> = {}): ValidateContext {
  return { archiveSlugs: new Set(), activeSlugs: new Set(), ...overrides }
}

export function rules(issues: { rule: string }[]): string[] {
  return issues.map((i) => i.rule)
}
