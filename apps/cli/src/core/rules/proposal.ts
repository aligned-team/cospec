// proposal/* rules (DESIGN §4.3). Rule IDs are frozen public API.

import {
  benchmarkDataRows,
  getSection,
  hasCommitSha,
  hasSection,
  parseProposal,
  parseSurfaces,
  revertSlugs,
  SURFACE_TOKENS,
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
  // Fail closed on the trigger block: any type whose canon sets surfaces:true
  // (everything but the four light types) SHALL carry a `## Surfaces` block, so a
  // silently-dropped block cannot suppress its soft-trigger consequences. The
  // block's flags stay optional — an empty-but-present block satisfies this.
  if (facts.hasSurfaces) required.push('Surfaces')
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

  // proposal/surfaces-vocab (DESIGN §1.2, §3.2) — fail-closed: a token outside
  // the closed four-token vocabulary is always an ERROR, never a soft nudge.
  if (facts.hasSurfaces) {
    const knownTokens: readonly string[] = SURFACE_TOKENS
    for (const item of parseSurfaces(change.proposalText)) {
      if (!knownTokens.includes(item.token)) {
        issues.push({
          level: 'ERROR',
          rule: 'proposal/surfaces-vocab',
          path: PROPOSAL,
          line: item.line,
          message: `unknown surface token '${item.token}' — expected one of ${SURFACE_TOKENS.join(', ')}`,
        })
      }
    }
  }

  return issues
}
