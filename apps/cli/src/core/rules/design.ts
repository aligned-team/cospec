// design/* rules (DESIGN §1.2, §3.2, §3.4). Rule IDs are frozen public API.
// Fire only when the matching `## Surfaces` flag is checked — except
// seam-ownership, which fires unconditionally for `refactor`. All soft
// (WARNING, ERROR under --strict): design's own matrix placement (Optional for
// feat/fix/perf, Required for refactor, Forbidden for revert + the light
// types) is unchanged by this family. Section parsing reuses proposal.ts's
// generic H2 parser — design.md shares the same house grammar as proposal.md,
// so no new parser is introduced for a handful of presence checks.

import { checkedSurfaces, hasSection, parseProposal } from '../proposal.ts'
import type { Issue, IssueLevel } from './issue.ts'
import type { LoadedChange, SchemaInfo } from './schema-info.ts'
import { isCospecType } from './type-facts.ts'

const FILE = 'design.md'

function hasDesignSection(change: LoadedChange, title: string): boolean {
  return change.designText !== undefined && hasSection(parseProposal(change.designText), title)
}

export function designRules(
  change: LoadedChange,
  schema: SchemaInfo,
  opts: { strict: boolean },
): Issue[] {
  const issues: Issue[] = []
  const type = isCospecType(schema.name) ? schema.name : undefined
  if (type === undefined) return issues

  const level: IssueLevel = opts.strict ? 'ERROR' : 'WARNING'
  const surfaces = checkedSurfaces(change.proposalText)

  // design/operational-surface, design/integration-contract: feat/fix/refactor
  // only (DESIGN §3.4 table — perf's covenant is equivalence, not topology).
  if (type === 'feat' || type === 'fix' || type === 'refactor') {
    if (
      (surfaces.has('interactive') || surfaces.has('deploy')) &&
      !hasDesignSection(change, 'Operational surface')
    ) {
      issues.push({
        level,
        rule: 'design/operational-surface',
        path: FILE,
        message:
          'the interactive/deploy surface needs a `## Operational surface` section (bind address, container-vs-runner, required secrets, connection limits, binary versions/arches)',
      })
    }
    if (surfaces.has('integration') && !hasDesignSection(change, 'Integration contract')) {
      issues.push({
        level,
        rule: 'design/integration-contract',
        path: FILE,
        message:
          'the integration surface needs a `## Integration contract` section (mount/route ownership, SDK/fixture shape, id-type/schema reconciliation)',
      })
    }
  }

  // design/seam-ownership: always for refactor, independent of any flag.
  if (type === 'refactor' && !hasDesignSection(change, 'Seam ownership')) {
    issues.push({
      level,
      rule: 'design/seam-ownership',
      path: FILE,
      message:
        'refactor needs a `## Seam ownership` section naming which lane owns shared runtime state',
    })
  }

  return issues
}
