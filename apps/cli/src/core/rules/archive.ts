// archive/* rules (DESIGN §4.3) — the archive-precondition family. These are
// set-membership checks against living-spec requirement names that mirror the
// openspec-core §6.1 preconditions, moving hard reality #2 left to validate
// time. Run for spec-bearing changes only, skipped by `--fast`. Policy: cospec
// may be strictly MORE conservative than the binary; a false PASS is a release
// blocker (parity is contract-tested). Rule IDs are frozen public API.

import { findScenarioDrops, parseDeltaSpec, type DeltaOp } from '../deltas.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

function opTargetName(op: DeltaOp): string | undefined {
  if (op.operation === 'RENAMED') return op.fromName
  return op.name
}

export interface ArchiveRuleOptions {
  strict: boolean
}

export function archiveRules(
  change: LoadedChange,
  opts: ArchiveRuleOptions = { strict: false },
): Issue[] {
  const issues: Issue[] = []

  // Group parsed ops by capability (one delta file per capability in practice,
  // but tolerate more than one file mapping to the same capability).
  interface CapGroup {
    ops: DeltaOp[]
    /** the delta file path an op belongs to, parallel to `ops`. */
    paths: string[]
  }
  const byCap = new Map<string, CapGroup>()

  for (const file of change.deltaFiles) {
    const parsed = parseDeltaSpec(file.text, file.path, file.capability)

    // archive/no-ops — a delta file with a recognized header but zero parsed
    // operations aborts openspec's merge ("Delta parsing found no operations").
    if (parsed.headerPresent && parsed.ops.length === 0)
      issues.push({
        level: 'ERROR',
        rule: 'archive/no-ops',
        path: file.path,
        message: 'delta file has requirement headers but no parseable operations',
        hint: 'add ADDED/MODIFIED/REMOVED/RENAMED entries or remove the empty section',
      })

    const group = byCap.get(file.capability) ?? { ops: [], paths: [] }
    for (const op of parsed.ops) {
      group.ops.push(op)
      group.paths.push(file.path)
    }
    byCap.set(file.capability, group)
  }

  for (const [capability, group] of byCap) {
    const living = change.livingSpecs.get(capability)
    const pathFor = (i: number): string => group.paths[i] ?? `specs/${capability}/spec.md`

    if (living === undefined) {
      // archive/new-spec-non-added — a brand-new capability may only ADD.
      for (let i = 0; i < group.ops.length; i++) {
        const op = group.ops[i]!
        if (op.operation === 'ADDED') continue
        const name = op.operation === 'RENAMED' ? op.fromName : op.name
        issues.push({
          level: 'ERROR',
          rule: 'archive/new-spec-non-added',
          path: pathFor(i),
          line: op.line,
          message: `${op.operation} "${name}" targets capability '${capability}', which has no living spec — only ADDED is allowed for a new spec`,
        })
      }
      continue
    }

    // archive/target-invalid — the living spec must be a well-formed main spec.
    if (!living.hasPurpose || !living.hasRequirements || living.hasDeltaHeaders) {
      const reason = living.hasDeltaHeaders
        ? 'it contains delta headers (## ADDED/MODIFIED/… Requirements)'
        : `it is missing ${!living.hasPurpose ? '## Purpose' : '## Requirements'}`
      issues.push({
        level: 'ERROR',
        rule: 'archive/target-invalid',
        path: `specs/${capability}/spec.md`,
        message: `living spec openspec/specs/${capability}/spec.md is structurally invalid — ${reason}`,
      })
    }

    // ADDED names declared in this delta set — RENAMED-TO may not collide with them.
    const addedNames = new Set<string>()
    for (const op of group.ops)
      if (op.operation === 'ADDED' && op.name !== undefined) addedNames.add(op.name)

    for (let i = 0; i < group.ops.length; i++) {
      const op = group.ops[i]!
      const path = pathFor(i)

      // archive/target-missing — MODIFIED/REMOVED/RENAMED-FROM must already exist.
      if (op.operation === 'MODIFIED' || op.operation === 'REMOVED' || op.operation === 'RENAMED') {
        const target = opTargetName(op)
        if (target !== undefined && !living.requirementNames.has(target))
          issues.push({
            level: 'ERROR',
            rule: 'archive/target-missing',
            path,
            line: op.line,
            message: `${op.operation} target "${target}" does not exist in living spec openspec/specs/${capability}/spec.md`,
          })
      }

      // archive/added-exists — ADDED must not already exist; RENAMED-TO must not
      // collide with an existing requirement or another ADDED in this delta.
      if (op.operation === 'ADDED' && op.name !== undefined && living.requirementNames.has(op.name))
        issues.push({
          level: 'ERROR',
          rule: 'archive/added-exists',
          path,
          line: op.line,
          message: `ADDED "${op.name}" already exists in living spec openspec/specs/${capability}/spec.md`,
        })

      if (op.operation === 'RENAMED' && op.toName !== undefined) {
        const collidesLiving = living.requirementNames.has(op.toName)
        const collidesAdded = addedNames.has(op.toName)
        if (collidesLiving || collidesAdded)
          issues.push({
            level: 'ERROR',
            rule: 'archive/added-exists',
            path,
            line: op.line,
            message: `RENAMED target "${op.toName}" collides with an ${collidesLiving ? 'existing requirement' : 'ADDED requirement'} in capability '${capability}'`,
          })
      }
    }
  }

  // archive/scenario-preservation — the advisory mirror of the hard archive-command
  // step (DESIGN §3.5). WARNING by default, ERROR under --strict; the real block
  // is the explicit `cospec archive` step, never this validate-time rule.
  const caps = [...byCap.entries()].map(([capability, group]) => ({ capability, ops: group.ops }))
  for (const drop of findScenarioDrops(caps, change.livingSpecs)) {
    issues.push({
      level: opts.strict ? 'ERROR' : 'WARNING',
      rule: 'archive/scenario-preservation',
      path: `specs/${drop.capability}/spec.md`,
      message: `MODIFIED "${drop.name}" drops scenario count from ${drop.livingCount} to ${drop.deltaCount} with no \`Scenario removed: <reason>\` note or matching REMOVED operation`,
      hint: 'add a `- Scenario removed: <reason>` line under the requirement, or restore the scenario',
    })
  }

  return issues
}
