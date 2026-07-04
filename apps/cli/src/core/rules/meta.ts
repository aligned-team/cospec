// meta/* and change/artifact-missing rules (DESIGN §4.3). Rule IDs are frozen
// public API — do not rename.

import type { Issue } from './issue.ts'
import type { LoadedChange, SchemaInfo } from './schema-info.ts'
import { ARTIFACT_FILES } from './type-facts.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ARCHIVE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

const EXCLUDED_FILES = new Set(['README.md', '.openspec.yaml'])
/** The five canonical cospec artifact globs (declared or not). */
function matchesArtifactGlob(path: string): boolean {
  if (path === 'proposal.md') return true
  if (path === 'blocking-changes.md') return true
  if (path === 'design.md') return true
  if (path === 'tasks.md') return true
  if (/^specs\/[^/]+\/.*\.md$/.test(path)) return true
  return false
}

function artifactPresent(change: LoadedChange, id: string): boolean {
  switch (id) {
    case 'proposal':
      return change.proposalText !== undefined
    case 'blocking-changes':
      return change.blockersText !== undefined
    case 'tasks':
      return change.tasksText !== undefined
    case 'design':
      return change.designExists
    case 'specs':
      return change.deltaFiles.length > 0
    default:
      return false
  }
}

/**
 * `meta/openspec-yaml` (DESIGN §4.3): the change metadata file is present,
 * parseable, has a non-empty `schema:`, and a well-formed `created:` when set.
 * Exported so the validate command can gate on it before schema classification.
 */
export function openspecYamlIssues(y: LoadedChange['openspecYaml']): Issue[] {
  const issues: Issue[] = []
  if (!y.present) {
    issues.push({
      level: 'ERROR',
      rule: 'meta/openspec-yaml',
      path: '.openspec.yaml',
      message: '.openspec.yaml is missing',
      hint: 'create the change with `cospec new <type> <slug>`',
    })
  } else if (!y.parseable) {
    issues.push({
      level: 'ERROR',
      rule: 'meta/openspec-yaml',
      path: '.openspec.yaml',
      message: '.openspec.yaml is not parseable YAML',
    })
  } else {
    if (y.schema === undefined || y.schema.length === 0)
      issues.push({
        level: 'ERROR',
        rule: 'meta/openspec-yaml',
        path: '.openspec.yaml',
        message: '.openspec.yaml has no `schema:` value',
      })
    if (y.created !== undefined && !DATE_RE.test(y.created))
      issues.push({
        level: 'ERROR',
        rule: 'meta/openspec-yaml',
        path: '.openspec.yaml',
        message: `created: "${y.created}" is not a YYYY-MM-DD date`,
      })
  }
  return issues
}

/** `meta/name-kebab` (DESIGN §4.3). Exported for all schema-classification paths. */
export function nameKebabIssues(id: string): Issue[] {
  if (KEBAB_RE.test(id) && !ARCHIVE_PREFIX_RE.test(id)) return []
  return [
    {
      level: 'ERROR',
      rule: 'meta/name-kebab',
      path: '.openspec.yaml',
      message: `change name '${id}' must be kebab-case with no YYYY-MM-DD- prefix`,
    },
  ]
}

/**
 * `meta/schema-unknown` / `meta/legacy-schema` (DESIGN §4.3). Emits nothing for
 * a cospec type. Exported so the validate command can classify before deciding
 * whether to run cospec rule families or delegate to openspec.
 */
export function schemaClassificationIssues(schema: SchemaInfo): Issue[] {
  if (schema.isCospec) return []
  if (!schema.resolvable)
    return [
      {
        level: 'ERROR',
        rule: 'meta/schema-unknown',
        path: '.openspec.yaml',
        message: `schema '${schema.name}' is not a cospec type and resolves nowhere`,
        hint: 'use one of the 11 cospec types, or `openspec schema fork` for a custom schema',
      },
    ]
  return [
    {
      level: 'INFO',
      rule: 'meta/legacy-schema',
      path: '.openspec.yaml',
      message: `schema '${schema.name}' is a non-cospec schema — legacy mode engaged`,
    },
  ]
}

export function metaRules(
  change: LoadedChange,
  schema: SchemaInfo,
  opts: { strict: boolean },
): Issue[] {
  const issues: Issue[] = []

  issues.push(...openspecYamlIssues(change.openspecYaml))
  issues.push(...schemaClassificationIssues(schema))
  issues.push(...nameKebabIssues(change.id))

  // meta/forbidden-artifact
  for (const id of schema.forbidden) {
    if (artifactPresent(change, id)) {
      const file = id === 'specs' ? 'specs/' : ARTIFACT_FILES[id as keyof typeof ARTIFACT_FILES]
      issues.push({
        level: 'ERROR',
        rule: 'meta/forbidden-artifact',
        path: file ?? id,
        message: `${file} is not allowed for a ${schema.name} change`,
        hint: `retype with \`cospec new <type> ${change.id}\` or remove the file`,
      })
    }
  }

  // meta/unexpected-file
  for (const f of change.files) {
    if (EXCLUDED_FILES.has(f)) continue
    if (f.startsWith('.refine/')) continue
    if (matchesArtifactGlob(f)) continue
    issues.push({
      level: 'WARNING',
      rule: 'meta/unexpected-file',
      path: f,
      message: `${f} is not part of any declared artifact`,
    })
  }

  // meta/empty-change
  const anyArtifact =
    change.proposalText !== undefined ||
    change.blockersText !== undefined ||
    change.tasksText !== undefined ||
    change.designExists ||
    change.deltaFiles.length > 0
  if (change.openspecYaml.present && !anyArtifact) {
    issues.push({
      level: 'INFO',
      rule: 'meta/empty-change',
      path: '.openspec.yaml',
      message: 'change has no artifacts yet — in progress',
      hint: `next: cospec instructions proposal --change ${change.id}`,
    })
  }

  // change/artifact-missing
  for (const id of schema.applyRequires) {
    if (!artifactPresent(change, id)) {
      const file = id === 'specs' ? 'specs/' : ARTIFACT_FILES[id as keyof typeof ARTIFACT_FILES]
      issues.push({
        level: opts.strict ? 'ERROR' : 'INFO',
        rule: 'change/artifact-missing',
        path: file ?? id,
        message: `required artifact '${id}' is not created yet`,
        hint: `cospec instructions ${id} --change ${change.id}`,
      })
    }
  }

  return issues
}
