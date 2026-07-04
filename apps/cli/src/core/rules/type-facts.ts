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

/** The 5 canonical artifact ids (DESIGN §3.1). */
export const ARTIFACT_IDS = ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'] as const

export type ArtifactId = (typeof ARTIFACT_IDS)[number]

/** Artifact id → the file path (relative to a change dir) that marks it present. */
export const ARTIFACT_FILES: Record<Exclude<ArtifactId, 'specs'>, string> = {
  proposal: 'proposal.md',
  'blocking-changes': 'blocking-changes.md',
  design: 'design.md',
  tasks: 'tasks.md',
}

/** Artifact id → its `generates` path/glob (relative to a change dir). */
export const ARTIFACT_GENERATES: Record<ArtifactId, string> = {
  proposal: 'proposal.md',
  'blocking-changes': 'blocking-changes.md',
  specs: 'specs/**/*.md',
  design: 'design.md',
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
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'specs', 'tasks'],
  },
  fix: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  perf: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  refactor: {
    declared: ['proposal', 'blocking-changes', 'specs', 'design', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'design', 'tasks'],
  },
  revert: {
    declared: ['proposal', 'blocking-changes', 'specs', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  build: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
    applyRequires: ['proposal', 'blocking-changes', 'tasks'],
  },
  ci: {
    declared: ['proposal', 'blocking-changes', 'tasks'],
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

export interface TypeFacts {
  proposalVariant: 'full' | 'lite'
  /** whether `## Capabilities` is a required proposal H2 (DESIGN §4.3 proposal/sections). */
  requiresCapabilities: 'always' | 'if-specs' | 'never'
  /** perf only: `## Benchmarks` required (DESIGN §4.3 proposal/benchmarks). */
  requiresBenchmarks: boolean
  /** revert only: `## Reverts` citation required (DESIGN §4.3 proposal/revert-citation). */
  requiresRevertCitation: boolean
}

export const TYPE_FACTS: Record<CospecType, TypeFacts> = {
  feat: {
    proposalVariant: 'full',
    requiresCapabilities: 'always',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  fix: {
    proposalVariant: 'full',
    requiresCapabilities: 'if-specs',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  perf: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: true,
    requiresRevertCitation: false,
  },
  refactor: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  revert: {
    proposalVariant: 'full',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: true,
  },
  build: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  ci: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  chore: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  docs: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  style: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
  test: {
    proposalVariant: 'lite',
    requiresCapabilities: 'never',
    requiresBenchmarks: false,
    requiresRevertCitation: false,
  },
}

export function isCospecType(name: string): name is CospecType {
  return (COSPEC_TYPES as readonly string[]).includes(name)
}
