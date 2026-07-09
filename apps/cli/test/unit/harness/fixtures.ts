import type { TypeTableEntry } from '../../../src/harness/render.ts'

/**
 * A stand-in for Track D's `core/schema-compose.ts` type-table export. Values mirror DESIGN
 * §3.2/§3.7 so the rendered propose table is representative; the harness track only consumes the
 * three fields below.
 */
export const TYPE_TABLE: TypeTableEntry[] = [
  {
    type: 'feat',
    description: 'A new feature — the full workflow',
    summary: 'proposal → blocking-changes, specs (+ design) → tasks',
  },
  {
    type: 'fix',
    description: 'A bug fix',
    summary: 'proposal → blocking-changes (+ specs, design) → tasks',
  },
  {
    type: 'perf',
    description: 'A performance change with identical behavior',
    summary: 'proposal (+ Benchmarks) → blocking-changes → tasks',
  },
  {
    type: 'refactor',
    description: 'A structure change with no behavior change',
    summary: 'proposal → blocking-changes, design → tasks',
  },
  {
    type: 'revert',
    description: 'Roll back a previously shipped change',
    summary: 'proposal (+ Reverts) → blocking-changes → tasks',
  },
  {
    type: 'build',
    description: 'Dependency or build-config change',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
  {
    type: 'ci',
    description: 'CI configuration and automation pipeline change',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
  {
    type: 'chore',
    description: 'Maintenance not affecting src or tests',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
  {
    type: 'docs',
    description: 'Documentation content only',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
  {
    type: 'style',
    description: 'Formatting or whitespace only',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
  {
    type: 'test',
    description: 'Tests for already-specified behavior',
    summary: 'proposal → blocking-changes → tasks (3 short artifacts)',
  },
]

/** A fixed generatedBy stamp so snapshots do not churn on version bumps. */
export const TEST_VERSION = 'cospec@test'

/** The eleven canonical workflow ids and their skill names (DESIGN §6.1). */
export const WORKFLOW_COMMANDS = [
  'propose',
  'new',
  'continue',
  'ff',
  'apply',
  'verify',
  'archive',
  'bulk-archive',
  'sync-specs',
  'explore',
  'onboard',
] as const

export const WORKFLOW_SKILLS = [
  'cospec-propose',
  'cospec-new-change',
  'cospec-continue-change',
  'cospec-ff-change',
  'cospec-apply-change',
  'cospec-verify-change',
  'cospec-archive-change',
  'cospec-bulk-archive-change',
  'cospec-sync-specs',
  'cospec-explore',
  'cospec-onboard',
] as const
