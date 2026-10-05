// The `archive/scenario-preservation` hard gate (DESIGN §3.5 step 2), shared by
// `cospec archive` and `cospec sync-specs` so the two refuse exactly where the
// binary's archive merge does. It reads both documents the way that merge
// reads them — fences masked, HTML comments kept: the change's deltas through
// `parseDeltaSpec` and each living spec through `parseLivingSpec`, whose top
// level is that view. The inputs are typed on the verbatim view, so the
// advisory (comment-masked) parse cannot reach this gate.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { openspecDir } from './change.ts'
import {
  findScenarioDrops,
  parseDeltaSpec,
  parseLivingSpec,
  quoteScenarioNames,
  SCENARIO_DROP_HINT,
  SCENARIO_DROP_NOTE_RETIRED,
  type DeltaOp,
  type LivingSpec,
  type ScenarioDrop,
} from './deltas.ts'
import { capabilityForDeltaFile, isDeltaSpecFile } from './spec-paths.ts'

export interface CapabilityDeltas {
  capability: string
  ops: DeltaOp[]
}

/**
 * All change-side delta ops grouped by capability path
 * (`specs/<cap-path>/spec.md`).
 *
 * Only files literally named `spec.md` count, matching openspec's own change
 * parser and `discoverSpecFiles` on the living side. Companion markdown an
 * author keeps in a capability directory (`README.md`, `notes.md`, a
 * `spec-old.md` backup) is content `openspec archive` never merges, so parsing
 * it here would feed phantom ops to both hard gates.
 *
 * The capability is the whole directory chain under `specs/`, so a nested
 * `specs/platform/session-layout/spec.md` groups under `platform/session-layout`
 * — the path openspec merges it to (`findSpecUpdates`, 1.6.0 #1353) and the path
 * every living-spec lookup joins. Keying on the outermost directory instead
 * pointed both hard archive gates at `openspec/specs/platform/spec.md`, which
 * does not exist, silently turning them into no-ops for every nested spec.
 *
 * A `.md` sitting directly in `specs/` has no capability at all; openspec 1.7.0
 * blocks that layout outright, so it contributes no ops rather than inventing a
 * capability named after the file.
 */
export function changeDeltaOps(changeDir: string): CapabilityDeltas[] {
  const root = join(changeDir, 'specs')
  if (!existsSync(root)) return []
  const byCap = new Map<string, DeltaOp[]>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) walk(child)
        continue
      }
      if (!entry.isFile() || !isDeltaSpecFile(entry.name)) continue
      const capability = capabilityForDeltaFile(relative(changeDir, child))
      if (capability === undefined) continue
      const parsed = parseDeltaSpec(readFileSync(child, 'utf8'), child, capability)
      const list = byCap.get(parsed.capability) ?? []
      list.push(...parsed.ops)
      byCap.set(parsed.capability, list)
    }
  }
  walk(root)
  return [...byCap.entries()].map(([capability, ops]) => ({ capability, ops }))
}

export interface ScenarioGateResult {
  /** Each MODIFIED requirement that drops a living scenario. */
  drops: ScenarioDrop[]
  /**
   * The capabilities that had a living spec when the gate ran, so a caller can
   * tell a spec the merge deleted from one that never existed.
   */
  livingCaps: Set<string>
}

/**
 * Run the gate for `caps` against the living specs under `base`'s
 * `openspec/specs/`.
 */
export function scenarioGate(base: string, caps: readonly CapabilityDeltas[]): ScenarioGateResult {
  const livingCaps = new Set<string>()
  const livingSpecs = new Map<string, LivingSpec>()
  for (const cap of new Set(caps.map((c) => c.capability))) {
    const path = join(openspecDir(base), 'specs', cap, 'spec.md')
    if (!existsSync(path)) continue
    livingCaps.add(cap)
    livingSpecs.set(cap, parseLivingSpec(readFileSync(path, 'utf8')))
  }
  return { drops: findScenarioDrops(caps, livingSpecs), livingCaps }
}

/**
 * The refusal `command` prints on stderr for `drops`. The count clause keeps
 * its shape even for a same-count name swap, where it reads `2 -> 2`: the
 * missing-name clause carries the finding there.
 */
export function scenarioRefusal(command: string, drops: readonly ScenarioDrop[]): string {
  const lines = [
    `cospec ${command}: scenario-preservation gate refused — a MODIFIED requirement drops scenarios:`,
    ...drops.map(
      (d) =>
        `  ${d.capability}: "${d.name}" ${d.livingCount} -> ${d.deltaCount} scenario(s)${
          d.missingNames.length > 0 ? `; missing: ${quoteScenarioNames(d.missingNames)}` : ''
        }`,
    ),
  ]
  if (drops.some((d) => d.noted)) lines.push(`${SCENARIO_DROP_NOTE_RETIRED}.`)
  lines.push(`${SCENARIO_DROP_HINT}.`)
  return `${lines.join('\n')}\n`
}
