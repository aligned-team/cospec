// verification/* rules (DESIGN §1.1, §3.2). Rule IDs are frozen public API.
// The family runs only when the schema declares `verification` (wired in
// rules/index.ts, exactly as deltas/archive are gated on `specs`). Grammar rules
// are fail-closed ERRORs; surface-driven rows are soft (WARNING, ERROR under
// --strict) because they are promoted by an author-declared `## Surfaces` flag.

import { checkedSurfaces } from '../proposal.ts'
import { isKnownLayer, parseVerification } from '../verification.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange, SchemaInfo } from './schema-info.ts'
import { isCospecType } from './type-facts.ts'

const FILE = 'verification.md'

export interface VerificationRuleOptions {
  strict: boolean
  /** project-extended layers (openspec/config.yaml verification.layers). */
  extraLayers?: readonly string[]
}

export function verificationRules(
  change: LoadedChange,
  schema: SchemaInfo,
  opts: VerificationRuleOptions,
): Issue[] {
  const issues: Issue[] = []
  const enforced = schema.applyRequires.includes('verification')

  // verification/missing — required by apply but the file is absent. Optional
  // (soft-promotable) types do not fire here; their absence is a surface nudge.
  if (change.verificationText === undefined) {
    if (enforced) {
      issues.push({
        level: opts.strict ? 'ERROR' : 'INFO',
        rule: 'verification/missing',
        path: FILE,
        message: 'required artifact verification.md is not created yet',
        hint: `cospec instructions verification --change ${change.id}`,
      })
    }
    return issues
  }

  const parsed = parseVerification(change.verificationText)
  const soft = (): 'ERROR' | 'WARNING' => (opts.strict ? 'ERROR' : 'WARNING')

  // verification/structure — ≥1 group, each group ≥1 row.
  if (parsed.groups.length === 0) {
    issues.push({
      level: 'ERROR',
      rule: 'verification/structure',
      path: FILE,
      message: 'verification.md needs at least one `## N. behavior` group with at least one row',
    })
  }
  for (const g of parsed.groups) {
    if (g.rows.length === 0) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/structure',
        path: FILE,
        line: g.line,
        message: `group ${g.num}. has no rows — each behavior needs at least one \`- [ ] N.M …\` row`,
      })
    }
  }

  // verification/row-grammar — a checkbox-like line that is not a conforming row.
  for (const mal of parsed.malformed) {
    issues.push({
      level: 'ERROR',
      rule: 'verification/row-grammar',
      path: FILE,
      line: mal.line,
      message: 'row does not parse as `- [<state>] N.M @<layer> [(<owner>)] <probe> -> <result>`',
    })
  }

  const extraLayers = opts.extraLayers ?? []
  for (const row of parsed.rows) {
    // verification/layer-unknown (fail-closed)
    if (!isKnownLayer(row.layer, extraLayers)) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/layer-unknown',
        path: FILE,
        line: row.line,
        message: `@${row.layer} is not a known layer`,
        hint: 'core layers: @unit @integration @e2e @manual @runtime @regression @equivalence @benchmark @eval — extend via openspec/config.yaml verification.layers',
      })
    }
    // verification/owner-unknown (fail-closed)
    if (row.ownerRaw !== undefined && row.ownerRaw !== 'agent' && row.ownerRaw !== 'human') {
      issues.push({
        level: 'ERROR',
        rule: 'verification/owner-unknown',
        path: FILE,
        line: row.line,
        message: `(${row.ownerRaw}) is not a known owner — use (agent) or (human)`,
      })
    }
    // verification/evidence-required — a checked row must record its evidence.
    if (row.state === 'verified' && row.result.length === 0) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/evidence-required',
        path: FILE,
        line: row.line,
        message: 'a checked [x] row must record observed evidence after ` -> `',
      })
    }
    // verification/deferred-reason — a deferred row must carry a reason.
    if (
      row.state === 'deferred' &&
      (row.deferReason === undefined || row.deferReason.length === 0)
    ) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/deferred-reason',
        path: FILE,
        line: row.line,
        message: 'a deferred [~] row must carry a non-empty `defer: <reason>` after ` -> `',
      })
    }
  }

  if (parsed.rows.length === 0) return issues

  const type = isCospecType(schema.name) ? schema.name : undefined
  const surfaces = checkedSurfaces(change.proposalText)
  const hasLayer = (layer: string): boolean => parsed.rows.some((r) => r.layer === layer)

  // Per-type required-row facts (DESIGN §1.1). Enforced for feat/fix/perf/refactor;
  // soft-promoted for build/ci/revert only when a `## Surfaces` flag is set.
  if (enforced && type === 'feat') {
    for (const g of parsed.groups) {
      if (g.critical && g.rows.length > 0 && !g.rows.some((r) => r.layer !== 'unit')) {
        issues.push({
          level: 'ERROR',
          rule: 'verification/critical-real-layer',
          path: FILE,
          line: g.line,
          message: `[critical] group ${g.num}. needs a non-@unit row (@integration/@e2e/@manual/@runtime)`,
        })
      }
    }
  } else if (enforced && type === 'fix') {
    if (!hasLayer('regression')) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/reproduces-bug',
        path: FILE,
        message: 'a fix needs at least one @regression row (failing before, passing after)',
      })
    }
  } else if (enforced && type === 'perf') {
    if (!hasLayer('benchmark') || !hasLayer('equivalence')) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/equivalence',
        path: FILE,
        message: 'a perf change needs both a @benchmark row and an @equivalence row',
      })
    }
  } else if (enforced && type === 'refactor') {
    if (!hasLayer('equivalence')) {
      issues.push({
        level: 'ERROR',
        rule: 'verification/invariant',
        path: FILE,
        message: 'a refactor needs an @equivalence row (the existing suite passes unchanged)',
      })
    }
  } else if ((type === 'build' || type === 'ci') && surfaces.has('deploy')) {
    // revert's soft-promotion (verification/deploy-real-layer, any layer) is
    // satisfied by any row, which reaching here already guarantees (a rowless
    // ledger fails verification/structure above); only build/ci need @runtime.
    if (!hasLayer('runtime')) {
      issues.push({
        level: soft(),
        rule: 'verification/deploy-real-layer',
        path: FILE,
        message: 'the deploy surface needs a @runtime row proving execution in the real runtime',
      })
    }
  }

  // Surface-driven per-row rules (fire only when the matching flag is set).
  if (
    surfaces.has('interactive') &&
    !parsed.rows.some((r) => r.layer === 'manual' || r.layer === 'e2e')
  ) {
    issues.push({
      level: soft(),
      rule: 'verification/interactive-required',
      path: FILE,
      message: 'the interactive surface needs a @manual or @e2e row',
    })
  }
  if (surfaces.has('agent-behavior') && !hasLayer('eval')) {
    issues.push({
      level: soft(),
      rule: 'verification/eval-check',
      path: FILE,
      message: 'the agent-behavior surface needs an @eval row',
    })
  }
  if (surfaces.has('integration') && !hasLayer('integration')) {
    issues.push({
      level: soft(),
      rule: 'verification/integration-check',
      path: FILE,
      message: 'the integration surface needs an @integration row',
    })
  }

  return issues
}
