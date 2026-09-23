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
  type LivingSpec,
} from '../deltas.ts'
import type { Issue } from './issue.ts'
import type { LoadedChange } from './schema-info.ts'

function opTargetName(op: DeltaOp): string | undefined {
  if (op.operation === 'RENAMED') return op.fromName
  return op.name
}

const NO_EXEMPTIONS: ReadonlySet<string | undefined> = new Set()

/**
 * The requirement in `names` that `name` folds onto, if any — openspec's own
 * near-miss search (`specs-apply.ts`, RENAMED/REMOVED/ADDED arms): two
 * spellings that differ only in case or interior whitespace are one
 * requirement written twice, which the binary refuses rather than writing both
 * copies into the spec.
 *
 * `names` is the spec as it stands when the op runs, never the pristine living
 * spec — see `replayDeltaNames`. `exempt` holds the names that are not
 * collisions for this op: a rename's own source.
 */
function foldNearMiss(
  names: Iterable<string>,
  name: string,
  exempt: ReadonlySet<string | undefined> = NO_EXEMPTIONS,
): string | undefined {
  const folded = foldRequirementName(name)
  return [...names].find((n) => !exempt.has(n) && foldRequirementName(n) === folded)
}

/**
 * The requirement names each op in a delta sees, keyed by op.
 *
 * openspec never checks an operation against the pristine living spec: it
 * loads the spec into one map and applies the delta in four ordered phases —
 * RENAMED, then REMOVED, then MODIFIED, then ADDED (`specs-apply.ts`) — with
 * each op's collision and near-miss searches reading that map as it stands by
 * then. So an op collides with what the ops before it left behind, and the
 * binary refuses a delta whose own two operations write one requirement under
 * two spellings: two ADDED names that fold onto each other, an ADDED landing
 * on a RENAMED target, a second RENAMED taking a fold-variant of the first
 * one's target. Folding against the living names alone saw none of those, and
 * cospec reported clean on deltas the binary aborts.
 *
 * Only an operation the binary would apply moves a name. One it refuses aborts
 * the whole merge upstream, so nothing after it runs at all; cospec keeps
 * going to report the rest of the delta, but reports it against the spec the
 * binary would have had.
 *
 * A capability with no living spec starts empty: openspec builds a skeleton
 * spec for it and applies the delta's ADDED ops to that, so two ADDED names
 * that fold onto each other are refused for a brand-new capability too.
 */
function replayDeltaNames(
  living: LivingSpec | undefined,
  ops: readonly DeltaOp[],
): Map<DeltaOp, ReadonlySet<string>> {
  const working = new Set(living?.requirementNames ?? [])
  const seen = new Map<DeltaOp, ReadonlySet<string>>()
  const visit = (op: DeltaOp, apply: () => void): void => {
    seen.set(op, new Set(working))
    apply()
  }

  for (const op of ops)
    if (op.operation === 'RENAMED')
      visit(op, () => {
        const from = op.fromName
        const to = op.toName
        if (from === undefined || to === undefined) return
        // Source gone, target taken, or a target that folds onto a surviving
        // name: upstream either treats the rename as already applied or aborts.
        // Neither one moves a name.
        if (!working.has(from) || working.has(to)) return
        if (foldNearMiss(working, to, new Set([from])) !== undefined) return
        working.delete(from)
        working.add(to)
      })

  for (const op of ops)
    if (op.operation === 'REMOVED')
      visit(op, () => {
        if (op.name !== undefined) working.delete(op.name)
      })

  // MODIFIED replaces a block under its own header, so it moves no name — it
  // still takes a snapshot, because the ops after it see the same spec.
  for (const op of ops) if (op.operation === 'MODIFIED') visit(op, () => {})

  for (const op of ops)
    if (op.operation === 'ADDED')
      visit(op, () => {
        const name = op.name
        if (name === undefined || working.has(name)) return
        if (foldNearMiss(working, name) !== undefined) return
        working.add(name)
      })

  return seen
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
      // No `continue`: openspec still applies this delta's ADDED ops, to the
      // skeleton spec it builds for the new capability, so two ADDED names
      // that fold onto each other are refused here exactly as they are against
      // a living spec. Every arm below that reads the living spec is guarded.
    } else if (!living.hasPurpose || !living.hasRequirements || living.hasDeltaHeaders) {
      // archive/target-invalid — the living spec must be a well-formed main spec.
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

    // RENAMED targets in this delta set. An ADDED landing on one of these is
    // upstream's `RENAMED TO header collides with ADDED` pre-validation, which
    // the RENAMED-TO arm below already reports — so the ADDED arms leave it
    // alone rather than naming one refusal twice.
    const renamedTargets = new Set<string>()
    for (const op of group.ops)
      if (op.operation === 'RENAMED' && op.toName !== undefined) renamedTargets.add(op.toName)

    // What each op's collision arms actually look at: the spec as openspec has
    // it by the time that op runs, not the pristine living spec.
    const spec = replayDeltaNames(living, group.ops)

    /**
     * Where a name an op collides with came from. A fold twin is normally a
     * living requirement, but it can equally be one this delta's own earlier
     * operation wrote — saying "living spec" for that one would be false.
     */
    const whereFor = (name: string): string =>
      living?.requirementNames.has(name) === true
        ? `living spec openspec/specs/${capability}/spec.md`
        : `capability '${capability}', written by an earlier operation in this delta`

    for (let i = 0; i < group.ops.length; i++) {
      const op = group.ops[i]!
      const path = pathFor(i)
      const visible = spec.get(op) ?? new Set<string>()

      // archive/target-missing — MODIFIED/REMOVED/RENAMED-FROM must already
      // exist, except for the two early-sync no-ops openspec performs at
      // exit 0 (`specs-apply.ts`, RENAMED and REMOVED arms):
      //
      //   - a REMOVED target already absent — the removal was already synced;
      //   - a RENAMED whose source is absent while its target is present —
      //     the rename was already applied.
      //
      // "Already exists" means the spec as the merge has it when this op runs,
      // never the pristine living spec: upstream resolves every lookup against
      // `nameToBlock`, which the RENAMED phase has already re-keyed. So a
      // MODIFIED or REMOVED naming a header an earlier RENAMED in this delta
      // created resolves, and a target an earlier operation carried away does
      // not — both the way the binary sees it.
      //
      // Both exemptions are withheld when a fold-equal name survives into that
      // same replayed set: that is a mistyped header, which the binary aborts
      // on, so cospec keeps refusing it and names the exact header the way
      // upstream does. A MODIFIED target that is absent has no upstream
      // early-sync path and stays an unconditional ERROR.
      if (
        living !== undefined &&
        (op.operation === 'MODIFIED' || op.operation === 'REMOVED' || op.operation === 'RENAMED')
      ) {
        const target = opTargetName(op)
        if (target !== undefined && !visible.has(target)) {
          const renameAlreadyApplied =
            op.operation === 'RENAMED' && op.toName !== undefined && visible.has(op.toName)
          const earlySync = op.operation === 'REMOVED' || renameAlreadyApplied
          // A case-only rename lands its source on the target itself; upstream
          // excludes the target from the RENAMED near-miss search for exactly
          // that reason, so `Foo` -> `foo` stays a no-op rather than a typo.
          const nearMiss = earlySync
            ? foldNearMiss(visible, target, new Set(renameAlreadyApplied ? [op.toName] : []))
            : undefined
          if (!earlySync || nearMiss !== undefined)
            issues.push({
              level: 'ERROR',
              rule: 'archive/target-missing',
              path,
              line: op.line,
              message: living.requirementNames.has(target)
                ? `${op.operation} target "${target}" no longer exists in capability '${capability}' — an earlier operation in this delta renamed or removed it`
                : `${op.operation} target "${target}" does not exist in living spec openspec/specs/${capability}/spec.md`,
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
      // "Already exists" is the replayed set, not the pristine living spec:
      // upstream's ADDED phase runs last, so a name this delta's own RENAMED or
      // REMOVED already carried away is free by then and re-using the vacated
      // header is not a collision at all.
      //
      // An ADDED block whose normalized raw text equals the living requirement's
      // is openspec's early-sync no-op (`specs-apply.ts`, ADDED arm): the spec
      // was already synced to the baseline, so re-applying it is not a
      // collision and the archive proceeds. Only a DIFFERING body collides.
      // Comparison is `normalizeBlockRaw` and nothing more — any looser folding
      // would call a real collision identical and manufacture a false PASS. A
      // name an earlier operation in this delta wrote has no such baseline —
      // the block sitting under it is that operation's, not this one's — so it
      // is always a collision.
      if (
        op.operation === 'ADDED' &&
        op.name !== undefined &&
        !renamedTargets.has(op.name) &&
        visible.has(op.name)
      ) {
        const livingBlock =
          living?.requirementNames.has(op.name) === true
            ? normalizeBlockRaw(living.requirementBlocks.get(op.name) ?? '')
            : undefined
        if (livingBlock === undefined || normalizeBlockRaw(op.raw) !== livingBlock)
          issues.push({
            level: 'ERROR',
            rule: 'archive/added-exists',
            path,
            line: op.line,
            message: `ADDED "${op.name}" already exists with different content in ${whereFor(op.name)}`,
            hint: 'openspec treats an ADDED block identical to the living requirement as an already-synced no-op; a differing body is a real collision — MODIFY the requirement instead',
          })
      }

      // The same collision one keystroke away: openspec 1.13.1 refuses an ADDED
      // whose name folds onto a living requirement's, because applying it would
      // leave two contradicting copies of one requirement in the spec. Exact
      // matching alone waved that through, so cospec reported clean on a delta
      // the binary aborts.
      if (op.operation === 'ADDED' && op.name !== undefined && !visible.has(op.name)) {
        const nearMiss = foldNearMiss(visible, op.name)
        if (nearMiss !== undefined)
          issues.push({
            level: 'ERROR',
            rule: 'archive/added-exists',
            path,
            line: op.line,
            message: `ADDED "${op.name}" differs only in case or spacing from "${nearMiss}" in ${whereFor(nearMiss)}`,
            hint:
              living?.requirementNames.has(nearMiss) === true
                ? `openspec refuses this as a second copy of one requirement — use MODIFIED with the exact header "### Requirement: ${nearMiss}", or choose a distinct name`
                : `openspec refuses this as a second copy of one requirement — this delta already writes "### Requirement: ${nearMiss}", so give this one a distinct name`,
          })
      }

      // An already-applied rename's target is present by definition; that is
      // the same no-op, not a collision, so the LIVING arm is skipped for it.
      // The delta-internal ADDED collision is a separate upstream check
      // (`specs-apply.ts` pre-validation, `addedNames.has(toNorm)`) that runs
      // unconditionally, before any early-sync classification — so early-sync
      // must not suppress it.
      if (living !== undefined && op.operation === 'RENAMED' && op.toName !== undefined) {
        const toName = op.toName
        const collidesLiving = !earlySynced.has(op) && visible.has(toName)
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
          const nearMiss = foldNearMiss(visible, toName, new Set([op.fromName]))
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
