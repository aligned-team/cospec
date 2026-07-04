// proposal/* rules (DESIGN §4.3). Rule IDs are frozen public API.

import {
  benchmarkDataRows,
  getSection,
  hasCommitSha,
  hasSection,
  parseProposal,
  revertSlugs,
} from '../proposal.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange, SchemaInfo, ValidateContext } from './schema-info.ts'

const PROPOSAL = 'proposal.md'
const MIN_WHY = 50

export function proposalRules(
  change: LoadedChange,
  schema: SchemaInfo,
  ctx: ValidateContext,
  opts: { strict: boolean },
): Issue[] {
  const issues: Issue[] = []
  const facts = schema.facts
  if (facts === undefined) return issues

  // proposal/missing
  if (change.proposalText === undefined) {
    const otherArtifacts =
      change.blockersText !== undefined ||
      change.tasksText !== undefined ||
      change.designExists ||
      change.deltaFiles.length > 0
    issues.push({
      level: opts.strict && otherArtifacts ? 'ERROR' : 'WARNING',
      rule: 'proposal/missing',
      path: PROPOSAL,
      message: 'proposal.md is missing',
      hint: `cospec instructions proposal --change ${change.id}`,
    })
    return issues
  }

  const p = parseProposal(change.proposalText)

  // proposal/sections
  const required = ['Why', 'What Changes', 'Impact']
  const needsCapabilities =
    facts.requiresCapabilities === 'always' ||
    (facts.requiresCapabilities === 'if-specs' && change.deltaFiles.length > 0)
  if (needsCapabilities) required.push('Capabilities')
  const missing = required.filter((h) => !hasSection(p, h))
  if (missing.length > 0) {
    issues.push({
      level: 'ERROR',
      rule: 'proposal/sections',
      path: PROPOSAL,
      message: `missing required section(s): ${missing.map((m) => `## ${m}`).join(', ')}`,
    })
  }

  // proposal/why-substantive (full variant only)
  if (facts.proposalVariant === 'full') {
    const why = getSection(p, 'Why')
    if (why !== undefined && why.body.length < MIN_WHY) {
      issues.push({
        level: 'WARNING',
        rule: 'proposal/why-substantive',
        path: PROPOSAL,
        line: why.line,
        message: `## Why is shorter than ${MIN_WHY} characters`,
      })
    }
  }

  // proposal/benchmarks (perf)
  if (facts.requiresBenchmarks) {
    const bench = getSection(p, 'Benchmarks')
    if (bench === undefined || benchmarkDataRows(bench.body) < 1) {
      issues.push({
        level: 'ERROR',
        rule: 'proposal/benchmarks',
        path: PROPOSAL,
        line: bench?.line,
        message: '## Benchmarks must be present with at least one before/after row',
      })
    }
  }

  // proposal/revert-citation (revert)
  if (facts.requiresRevertCitation) {
    const reverts = getSection(p, 'Reverts')
    const slugs = reverts !== undefined ? revertSlugs(reverts.body) : []
    const citesArchived = slugs.some((s) => ctx.archiveSlugs.has(s))
    const citesSha = reverts !== undefined && hasCommitSha(reverts.body)
    if (reverts === undefined || (!citesArchived && !citesSha)) {
      issues.push({
        level: 'ERROR',
        rule: 'proposal/revert-citation',
        path: PROPOSAL,
        line: reverts?.line,
        message:
          '## Reverts must cite a backticked archived change slug and/or a 7–40-hex commit sha',
      })
    }
  }

  return issues
}
