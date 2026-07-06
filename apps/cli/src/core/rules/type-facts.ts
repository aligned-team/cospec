// Cospec's 11 conventional-commit types and the per-type facts the validator
// needs that are not recoverable from the composed schema.yaml alone (proposal
// weight, required special sections). Derived directly from the binding matrix in
// DESIGN §3.2 / §3.7. Kept independent of Track D's composer: validation must not
// depend on the canon composer, and DESIGN §3.2 is frozen.

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

/** The 6 canonical artifact ids (DESIGN §3.1, §1.1). */
export const ARTIFACT_IDS = [
  'proposal',
  'blocking-changes',
  'specs',
  'design',
  'verification',
  'tasks',
] as const

export type ArtifactId = (typeof ARTIFACT_IDS)[number]

/** Artifact id → the file path (relative to a change dir) that marks it present. */
export const ARTIFACT_FILES: Record<Exclude<ArtifactId, 'specs'>, string> = {
  proposal: 'proposal.md',
  'blocking-changes': 'blocking-changes.md',
  design: 'design.md',
  verification: 'verification.md',
  tasks: 'tasks.md',
}

/** Artifact id → its `generates` path/glob (relative to a change dir). */
export const ARTIFACT_GENERATES: Record<ArtifactId, string> = {
  proposal: 'proposal.md',
  'blocking-changes': 'blocking-changes.md',
  specs: 'specs/**/*.md',
  design: 'design.md',
  verification: 'verification.md',
  tasks: 'tasks.md',
}

export interface TypeArtifacts {
  /** artifact ids this type DECLARES (R or O in the §3.2 matrix). */
  declared: ArtifactId[]
  /** artifact ids gated by `cospec apply` (`apply.requires`). */
  applyRequires: ArtifactId[]
}

/**
 * The per-type artifact matrix, transcribed verbatim from the binding DESIGN
 * §3.2 table. `declared` are the artifacts a type declares (any not listed are
 * FORBIDDEN — `meta/forbidden-artifact`); `applyRequires` is the mechanically
 * gated set. Derived from the frozen matrix independently of Track D's composer
 * so validation never depends on canon composition.
 */
export const TYPE_ARTIFACTS: Record<CospecType, TypeArtifacts> = {
  feat: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'specs', 'verification', 'tasks'],
  },
  fix: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'verification', 'tasks'],
  },
  perf: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'verification', 'tasks'],
  },
  refactor: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'design', 'verification', 'tasks'],
  },
  revert: {
    declared: ['proposal', 'blocking-changes', 'specs', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  build: {
    declared: ['proposal', 'blocking-changes', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  ci: {
    declared: ['proposal', 'blocking-changes', 'verification', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  chore: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  docs: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  style: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  test: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
}

/**
 * An artifact's build-order dependencies (the `requires` edges in DESIGN §3.2):
 * every declared artifact requires `proposal`, and `tasks` additionally requires
 * `specs` where specs is required (feat) and `design` where design is required
 * (refactor). Mirrors the composer's `computeTasksRequires` but derived from the
 * frozen matrix so status stays independent of canon composition. Returns [] for
 * `proposal` and for artifacts a type does not declare.
 */
export function artifactRequires(type: CospecType, id: ArtifactId): ArtifactId[] {
  const facts = TYPE_ARTIFACTS[type]
  if (id === 'proposal' || !facts.declared.includes(id)) return []
  if (id === 'tasks') {
    const req: ArtifactId[] = ['proposal']
    if (facts.applyRequires.includes('specs')) req.push('specs')
    if (facts.applyRequires.includes('design')) req.push('design')
    return req
  }
  return ['proposal']
}

/**
 * The schema version at which an artifact BECAME enforced for a type (DESIGN §5,
 * disagreement G). verification was introduced at v2 for the four types that
 * gate on it; every other (artifact, type) pair has existed since v1. Values are
 * monotonic — they may only ever increase — so a future artifact grandfathers
 * independently, per type.
 */
export function introducedAt(artifact: ArtifactId, type: CospecType): number {
  if (
    artifact === 'verification' &&
    (type === 'feat' || type === 'fix' || type === 'perf' || type === 'refactor')
  ) {
    return 2
  }
  return 1
}

/**
 * `apply.requires` filtered to the artifacts a change's stamped `schemaVersion`
 * actually enforces (DESIGN §5). A uniform monotonic version filter — NOT
 * content-derived promotion — applied identically at apply and archive: an
 * artifact whose `introducedAt(artifact, type)` exceeds `schemaVersion` is
 * grandfathered out. The unfiltered v2 matrix (TYPE_ARTIFACTS) is what
 * matrix-parity tests; this filter never forks it.
 */
export function enforcedApplyRequires(type: CospecType, schemaVersion: number): ArtifactId[] {
  return TYPE_ARTIFACTS[type].applyRequires.filter(
    (artifact) => introducedAt(artifact, type) <= schemaVersion,
  )
}

export interface TypeFacts {
  proposalVariant: 'full' | 'lite'
  /** whether `## Capabilities` is a required proposal H2 (DESIGN §4.3 proposal/sections). */
  requiresCapabilities: 'always' | 'if-specs' | 'never'
  /** perf only: `## Benchmarks` required (DESIGN §4.3 proposal/benchmarks). */
  requiresBenchmarks: boolean
  /** revert only: `## Reverts` citation required (DESIGN §4.3 proposal/revert-citation). */
  requiresRevertCitation: boolean
  /** whether the proposal carries a `## Surfaces` flag block (DESIGN §1.2, canon `surfaces:`). */
  hasSurfaces: boolean
}

export const TYPE_FACTS: Record<CospecType, TypeFacts> = {
  feat: {
    proposalVariant: 'full',
    requiresCapabilities: 'always',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  fix: {
    proposalVariant: 'full',
    requiresCapabilities: 'if-specs',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  perf: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: true,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  refactor: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  revert: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: true,
    hasSurfaces: true,
  },
  build: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  ci: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: true,
  },
  chore: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: false,
  },
  docs: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: false,
  },
  style: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: false,
  },
  test: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
    hasSurfaces: false,
  },
}

export function isCospecType(name: string): name is CospecType {
  return (COSPEC_TYPES as readonly string[]).includes(name)
}
