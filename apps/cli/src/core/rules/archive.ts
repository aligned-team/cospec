// archive/* rules (DESIGN §4.3) — the archive-precondition family. These are
// set-membership checks against living-spec requirement names that mirror the
// openspec-core §6.1 preconditions, moving hard reality #2 left to validate
// time. Run for spec-bearing changes only, skipped by `--fast`. Policy: cospec
// may be strictly MORE conservative than the binary; a false PASS is a release
// blocker (parity is contract-tested). Rule IDs are frozen public API.

import {
  findScenarioDrops,
  foldRequirementName,
  normalizeBlockRaw,
  parseDeltaSpec,
  SCENARIO_DROP_HINT,
  SCENARIO_DROP_NOTE_RETIRED,
  scenarioDropMessage,
  type DeltaOp,
} from '../deltas.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

function opTargetName(op: DeltaOp): string | undefined {
  if (op.operation === 'RENAMED') return op.fromName
  return op.name
}

/**
 * The living requirement `name` folds onto, if any — openspec's own near-miss
 * search (`specs-apply.ts`, RENAMED/REMOVED/ADDED arms): two spellings that
 * differ only in case or interior whitespace are one requirement written twice,
 * which the binary refuses rather than writing both copies into the spec.
 *
 * `exempt` holds the names that are not collisions for this op — the rename's
 * own source, and the living names the delta vacates before the op applies.
 */
function foldNearMiss(
  livingNames: ReadonlySet<string>,
  name: string,
  exempt: ReadonlySet<string | undefined>,
): string | undefined {
  const folded = foldRequirementName(name)
  return [...livingNames].find((n) => !exempt.has(n) && foldRequirementName(n) === folded)
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

    // Ops whose target was absent for an upstream early-sync reason; the
    // RENAMED-TO collision arm must not fire on those.
    const earlySynced = new Set<DeltaOp>()

    // ADDED names declared in this delta set — RENAMED-TO may not collide with them.
    const addedNames = new Set<string>()
    for (const op of group.ops)
      if (op.operation === 'ADDED' && op.name !== undefined) addedNames.add(op.name)

    // Living names this delta vacates. openspec applies RENAMED, then REMOVED,
    // then MODIFIED, then ADDED (`specs-apply.ts`), so by the time its ADDED
    // near-miss check runs, a requirement this delta renamed away or removed is
    // already gone from the map it folds against. Folding against it here would
    // refuse an archive the binary performs. The RENAMED-TO arm below does NOT
    // get this exemption: renames run first, so a requirement removed later in
    // the same delta is still present when the target is checked, and upstream
    // refuses there too.
    const vacated = new Set<string>()
    for (const op of group.ops) {
      if (op.operation === 'REMOVED' && op.name !== undefined) vacated.add(op.name)
      if (op.operation === 'RENAMED' && op.fromName !== undefined) vacated.add(op.fromName)
    }

    for (let i = 0; i < group.ops.length; i++) {
      const op = group.ops[i]!
      const path = pathFor(i)

      // archive/target-missing — MODIFIED/REMOVED/RENAMED-FROM must already
      // exist, except for the two early-sync no-ops openspec performs at
      // exit 0 (`specs-apply.ts`, RENAMED and REMOVED arms):
      //
      //   - a REMOVED target already absent — the removal was already synced;
      //   - a RENAMED whose source is absent while its target is present —
      //     the rename was already applied.
      //
      // Both exemptions are withheld when a fold-equal living name survives:
      // that is a mistyped header, which the binary aborts on, so cospec keeps
      // refusing it and names the exact living header the way upstream does.
      // A MODIFIED target that is absent has no upstream early-sync path and
      // stays an unconditional ERROR.
      if (op.operation === 'MODIFIED' || op.operation === 'REMOVED' || op.operation === 'RENAMED') {
        const target = opTargetName(op)
        if (target !== undefined && !living.requirementNames.has(target)) {
          const renameAlreadyApplied =
            op.operation === 'RENAMED' &&
            op.toName !== undefined &&
            living.requirementNames.has(op.toName)
          const earlySync = op.operation === 'REMOVED' || renameAlreadyApplied
          // A case-only rename lands its source on the target itself; upstream
          // excludes the target from the RENAMED near-miss search for exactly
          // that reason, so `Foo` -> `foo` stays a no-op rather than a typo.
          const nearMiss = earlySync
            ? foldNearMiss(
                living.requirementNames,
                target,
                new Set(renameAlreadyApplied ? [op.toName] : []),
              )
            : undefined
          if (!earlySync || nearMiss !== undefined)
            issues.push({
              level: 'ERROR',
              rule: 'archive/target-missing',
              path,
              line: op.line,
              message: `${op.operation} target "${target}" does not exist in living spec openspec/specs/${capability}/spec.md`,
              ...(nearMiss === undefined
                ? {}
                : {
                    hint: `"### Requirement: ${nearMiss}" exists — fix the header to match it exactly`,
                  }),
            })
          if (earlySync && nearMiss === undefined) earlySynced.add(op)
        }
      }

      // archive/added-exists — ADDED must not already exist; RENAMED-TO must not
      // collide with an existing requirement or another ADDED in this delta.
      //
      // An ADDED block whose normalized raw text equals the living requirement's
      // is openspec's early-sync no-op (`specs-apply.ts`, ADDED arm): the spec
      // was already synced to the baseline, so re-applying it is not a
      // collision and the archive proceeds. Only a DIFFERING body collides.
      // Comparison is `normalizeBlockRaw` and nothing more — any looser folding
      // would call a real collision identical and manufacture a false PASS.
      if (
        op.operation === 'ADDED' &&
        op.name !== undefined &&
        living.requirementNames.has(op.name) &&
        normalizeBlockRaw(op.raw) !== normalizeBlockRaw(living.requirementBlocks.get(op.name) ?? '')
      )
        issues.push({
          level: 'ERROR',
          rule: 'archive/added-exists',
          path,
          line: op.line,
          message: `ADDED "${op.name}" already exists with different content in living spec openspec/specs/${capability}/spec.md`,
          hint: 'openspec treats an ADDED block identical to the living requirement as an already-synced no-op; a differing body is a real collision — MODIFY the requirement instead',
        })

      // The same collision one keystroke away: openspec 1.13.1 refuses an ADDED
      // whose name folds onto a living requirement's, because applying it would
      // leave two contradicting copies of one requirement in the spec. Exact
      // matching alone waved that through, so cospec reported clean on a delta
      // the binary aborts.
      if (
        op.operation === 'ADDED' &&
        op.name !== undefined &&
        !living.requirementNames.has(op.name)
      ) {
        const nearMiss = foldNearMiss(living.requirementNames, op.name, vacated)
        if (nearMiss !== undefined)
          issues.push({
            level: 'ERROR',
            rule: 'archive/added-exists',
            path,
            line: op.line,
            message: `ADDED "${op.name}" differs only in case or spacing from "${nearMiss}" in living spec openspec/specs/${capability}/spec.md`,
            hint: `openspec refuses this as a second copy of one requirement — use MODIFIED with the exact header "### Requirement: ${nearMiss}", or choose a distinct name`,
          })
      }

      // An already-applied rename's target is present by definition; that is
      // the same no-op, not a collision, so the LIVING arm is skipped for it.
      // The delta-internal ADDED collision is a separate upstream check
      // (`specs-apply.ts` pre-validation, `addedNames.has(toNorm)`) that runs
      // unconditionally, before any early-sync classification — so early-sync
      // must not suppress it.
      if (op.operation === 'RENAMED' && op.toName !== undefined) {
        const toName = op.toName
        const collidesLiving = !earlySynced.has(op) && living.requirementNames.has(toName)
        const collidesAdded = addedNames.has(toName)
        if (collidesLiving || collidesAdded)
          issues.push({
            level: 'ERROR',
            rule: 'archive/added-exists',
            path,
            line: op.line,
            message: `RENAMED target "${toName}" collides with an ${collidesLiving ? 'existing requirement' : 'ADDED requirement'} in capability '${capability}'`,
          })
        // The fold arm of the same collision (openspec 1.13.1). The source is
        // exempt — a case-only rename (`Foo` -> `foo`) lands on the requirement
        // being renamed, which is the rename, not a collision — and an
        // early-synced rename never reaches this check upstream at all.
        else if (!earlySynced.has(op)) {
          const nearMiss = foldNearMiss(living.requirementNames, toName, new Set([op.fromName]))
          if (nearMiss !== undefined)
            issues.push({
              level: 'ERROR',
              rule: 'archive/added-exists',
              path,
              line: op.line,
              message: `RENAMED target "${toName}" differs only in case or spacing from "${nearMiss}" in capability '${capability}'`,
              hint: `openspec refuses this as a second copy of one requirement — rename it to something distinct from "### Requirement: ${nearMiss}"`,
            })
        }
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
      message: scenarioDropMessage(drop),
      hint: drop.noted
        ? `${SCENARIO_DROP_NOTE_RETIRED} — ${SCENARIO_DROP_HINT}`
        : SCENARIO_DROP_HINT,
    })
  }

  return issues
}
