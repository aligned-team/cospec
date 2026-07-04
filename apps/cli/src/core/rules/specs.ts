// specs/* rules for LIVING specs (openspec/specs/<cap>/spec.md), surfaced by
// `cospec validate --specs`. The bulk of living-spec validation is delegated to
// `openspec validate --specs` and merged by the validate command; this module
// adds the quality-leak diagnostic openspec itself does not flag (DESIGN §4.3
// specs/, PMF10). Rule IDs are frozen public API.

import type { LivingSpec } from '../deltas.ts'
import type { Issue } from './issue.ts'

/** The placeholder openspec writes into a spec created by archiving (probe §5.5). */
const TBD_PLACEHOLDER = /TBD - created by archiving/

/**
 * Cospec-added checks over a single living spec. `path` is the repo-relative
 * spec path used in the report.
 */
export function specsRules(spec: LivingSpec, path: string): Issue[] {
  const issues: Issue[] = []

  // specs/purpose-tbd — the archive-generated Purpose placeholder was never filled.
  if (TBD_PLACEHOLDER.test(spec.purposeText))
    issues.push({
      level: 'WARNING',
      rule: 'specs/purpose-tbd',
      path,
      message:
        '## Purpose still holds the archive-generated "TBD - created by archiving" placeholder',
      hint: 'write a real one-paragraph purpose for this capability',
    })

  return issues
}
