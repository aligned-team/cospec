// The cospec rule orchestrator: composes every synchronous rule family for a
// change on a cospec schema (DESIGN §4.1). Openspec delegation and issue
// merging for spec-bearing changes are the validate command's job — this stays
// pure and side-effect-free so the full rule composition is unit-testable
// without the wrapped binary.

import { archiveRules } from './archive.ts'
import { blockersRules } from './blockers.ts'
import { deltasRules } from './deltas.ts'
import type { Issue } from './issue.ts'
import { metaRules } from './meta.ts'
import { proposalRules } from './proposal.ts'
import type { LoadedChange, SchemaInfo, ValidateContext } from './schema-info.ts'
import { tasksRules } from './tasks.ts'

export interface RuleOptions {
  /** promote warnings to blocking (report layer decides exit; recorded per rule). */
  strict: boolean
  /** skip the archive-precondition family (used by `apply`, DESIGN §2.5/§5.1). */
  fast: boolean
}

/**
 * Every cospec rule for a change whose schema is one of the 11 types. Always
 * runs meta/proposal/blockers/tasks; runs deltas (and, unless `fast`, the
 * archive-precondition family) only when the schema declares specs and the
 * change actually carries delta files. `meta/forbidden-artifact` for a specs/
 * dir under a light type is emitted by `metaRules` (via `schema.forbidden`).
 */
export function runChangeRules(
  change: LoadedChange,
  schema: SchemaInfo,
  ctx: ValidateContext,
  opts: RuleOptions,
): Issue[] {
  const issues: Issue[] = []
  issues.push(...metaRules(change, schema, opts))
  issues.push(...proposalRules(change, schema, ctx, opts))
  issues.push(...blockersRules(change, ctx))
  issues.push(...tasksRules(change))

  const declaresSpecs = schema.declared.has('specs')
  const hasDeltaFiles = change.deltaFiles.length > 0
  if (declaresSpecs && hasDeltaFiles) {
    issues.push(...deltasRules(change))
    if (!opts.fast) issues.push(...archiveRules(change))
  }

  return issues
}

export { archiveRules, blockersRules, deltasRules, metaRules, proposalRules, tasksRules }
export { specsRules } from './specs.ts'
