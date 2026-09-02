// meta/* and change/artifact-missing rules (DESIGN §4.3). Rule IDs are frozen
// public API — do not rename.

import { checkedSurfaces } from '../proposal.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange, SchemaInfo } from './schema-info.ts'
import {
  ARTIFACT_FILES,
  COSPEC_TYPES,
  isCospecType,
  TYPE_ARTIFACTS,
  type CospecType,
} from './type-facts.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
const ARCHIVE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}-/

const EXCLUDED_FILES = new Set(['README.md', '.openspec.yaml'])
/** The five canonical cospec artifact globs (declared or not). */
function matchesArtifactGlob(path: string): boolean {
  if (path === 'proposal.md') return true
  if (path === 'blocking-changes.md') return true
  if (path === 'design.md') return true
  if (path === 'verification.md') return true
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
    case 'verification':
      return change.verificationText !== undefined
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
    if (y.schemaVersionInvalid === true)
      issues.push({
        level: 'ERROR',
        rule: 'meta/openspec-yaml',
        path: '.openspec.yaml',
        message: 'schemaVersion must be a positive integer when present',
      })
  }
  return issues
}

/**
 * `meta/skip-specs-type` / `meta/retire-capabilities-type` (DESIGN §5,
 * OpenSpec 1.7/1.8 parity): a change may persist `skip_specs:` /
 * `retire_capabilities:` in `.openspec.yaml` as durable booleans, but a
 * present-and-not-boolean value is an ERROR.
 *
 * Standalone from `openspecYamlIssues` rather than folded into
 * `LoadedChange['openspecYaml']`: the raw-record `*Invalid` flags these two
 * keys need mirror `schemaVersionInvalid`, but that struct (schema-info.ts)
 * and its populator (validate.ts's `loadOpenspecYaml`) are owned outside this
 * unit — this is the metadata-key *interface* only. Once that plumbing lands,
 * the caller derives `MetadataKeyFlags` from the same raw record and folds
 * these issues into the change's diagnostics; gate behaviour (honouring
 * `skipSpecs`/`retireCapabilities`, not just recognising them) is also a
 * later unit.
 */
export interface MetadataKeyFlags {
  /** `skip_specs:` present but not a boolean. */
  skipSpecsInvalid?: boolean
  /** `retire_capabilities:` present but not a boolean. */
  retireCapabilitiesInvalid?: boolean
}

export function metadataKeyIssues(flags: MetadataKeyFlags): Issue[] {
  const issues: Issue[] = []
  if (flags.skipSpecsInvalid === true)
    issues.push({
      level: 'ERROR',
      rule: 'meta/skip-specs-type',
      path: '.openspec.yaml',
      message: 'skip_specs must be a boolean when present',
    })
  if (flags.retireCapabilitiesInvalid === true)
    issues.push({
      level: 'ERROR',
      rule: 'meta/retire-capabilities-type',
      path: '.openspec.yaml',
      message: 'retire_capabilities must be a boolean when present',
    })
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
        hint: 'use one of the 11 cospec types, or `cospec schema fork` for a custom schema',
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

/**
 * The O(trig) types whose `verification` artifact is soft-promoted, never
 * required, by the `interactive`/`deploy` surface flags (DESIGN §1.2 table,
 * §3.4) — the types that DECLARE verification but do not `apply.requires` it.
 * Derived from TYPE_ARTIFACTS at module load rather than hand-listed so it can
 * never drift from the twin matrix ({revert, build, ci} today).
 * `integration`/`agent-behavior` do not apply to these types (DESIGN §3.4 table
 * has no row for them here).
 */
const SOFT_PROMOTABLE_TYPES = new Set<CospecType>(
  COSPEC_TYPES.filter(
    (t) =>
      TYPE_ARTIFACTS[t].declared.includes('verification') &&
      !TYPE_ARTIFACTS[t].applyRequires.includes('verification'),
  ),
)
const VERIFICATION_TRIGGER_FLAGS = ['interactive', 'deploy'] as const

export interface SurfaceUnmetConsequence {
  flag: (typeof VERIFICATION_TRIGGER_FLAGS)[number]
}

/**
 * `meta/surface-unmet`'s pure computation (DESIGN §3.2, §3.4), shared between
 * validate's Issue below and apply's soft-blocker step. Scoped to the one gap
 * `verification/*`'s own surface-driven rules structurally cannot reach: an
 * O(trig) type whose `verification.md` does not exist at all, so there is no
 * row to inspect (`verificationRules` returns early on absent text). A row
 * missing from an EXISTING artifact is already owned by `verification/*` —
 * this never double-reports that case.
 */
export function surfaceUnmetConsequences(
  type: CospecType,
  proposalText: string | undefined,
  verificationExists: boolean,
): SurfaceUnmetConsequence[] {
  if (!SOFT_PROMOTABLE_TYPES.has(type) || verificationExists) return []
  const surfaces = checkedSurfaces(proposalText)
  return VERIFICATION_TRIGGER_FLAGS.filter((flag) => surfaces.has(flag)).map((flag) => ({ flag }))
}

/** `meta/surface-unmet` as a validate-time Issue (WARNING; ERROR under --strict). */
export function surfaceUnmetIssues(
  change: LoadedChange,
  schema: SchemaInfo,
  opts: { strict: boolean },
): Issue[] {
  const type = isCospecType(schema.name) ? schema.name : undefined
  if (type === undefined) return []
  const level = opts.strict ? 'ERROR' : 'WARNING'
  return surfaceUnmetConsequences(
    type,
    change.proposalText,
    change.verificationText !== undefined,
  ).map((c) => ({
    level,
    rule: 'meta/surface-unmet',
    path: ARTIFACT_FILES.verification,
    message: `the '${c.flag}' surface flag is checked but verification.md does not exist yet`,
    hint: `cospec instructions verification --change ${change.id}`,
  }))
}

/**
 * `meta/schema-outdated` (DESIGN §5 migration story): a non-blocking nudge for
 * a change still on `schemaVersion` 1 (absent ⇒ 1), naming `cospec migrate`.
 * Never blocks — the grandfathering itself lives in `enforcedApplyRequires`.
 */
export function schemaOutdatedIssues(change: LoadedChange, schema: SchemaInfo): Issue[] {
  if (!schema.isCospec) return []
  const version = change.openspecYaml.schemaVersion ?? 1
  if (version >= 2) return []
  return [
    {
      level: 'INFO',
      rule: 'meta/schema-outdated',
      path: '.openspec.yaml',
      message: `change is on schemaVersion ${version} — some artifacts (e.g. verification) are grandfathered out until migrated`,
      hint: `cospec migrate ${change.id}`,
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
  issues.push(...surfaceUnmetIssues(change, schema, opts))
  issues.push(...schemaOutdatedIssues(change, schema))

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
    change.verificationText !== undefined ||
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

  // change/artifact-missing. verification is skipped here — the verification
  // rule family owns `verification/missing` so the two never double-report.
  for (const id of schema.applyRequires) {
    if (id === 'verification') continue
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
