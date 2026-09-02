// Scenario registry — one scenario per cospec schema type (11 total), in
// COSPEC_TYPES order, plus opt-in `-hard` variants (see `HARD_SCENARIOS`).

import { buildScenario } from './build.ts'
import { choreScenario } from './chore.ts'
import { ciScenario } from './ci.ts'
import { docsScenario } from './docs.ts'
import { featHardScenario } from './feat-hard.ts'
import { featScenario } from './feat.ts'
import { fixHardScenario } from './fix-hard.ts'
import { fixScenario } from './fix.ts'
import { perfHardScenario } from './perf-hard.ts'
import { perfScenario } from './perf.ts'
import { refactorHardScenario } from './refactor-hard.ts'
import { refactorScenario } from './refactor.ts'
import { revertHardScenario } from './revert-hard.ts'
import { revertScenario } from './revert.ts'
import { styleScenario } from './style.ts'
import { testScenario } from './test.ts'
import type { Scenario } from './types.ts'

export const SCENARIOS: readonly Scenario[] = [
  buildScenario,
  choreScenario,
  ciScenario,
  docsScenario,
  featScenario,
  fixScenario,
  perfScenario,
  refactorScenario,
  revertScenario,
  styleScenario,
  testScenario,
]

/**
 * Opt-in `-hard` variants of the 5 "heavy" types — multi-file fixtures with a
 * task prompt spanning 3+ files, larger hidden suites (8-12 cases), and their
 * own planted bug. `id` is suffixed `-hard`; `type` stays the BASE cospec
 * type (so artifact-proportionality scoring in `src/mechanical.ts` treats a
 * `feat-hard` change exactly like a `feat` change). Never included in the
 * default matrix — see `src/matrix.ts`'s `--hard` flag and `docs/bench.md`'s
 * cost warning.
 */
export const HARD_SCENARIOS: readonly Scenario[] = [
  featHardScenario,
  fixHardScenario,
  perfHardScenario,
  refactorHardScenario,
  revertHardScenario,
]

/** Every registered scenario — the 11 core ones plus the opt-in `-hard` extras. */
export const ALL_SCENARIOS: readonly Scenario[] = [...SCENARIOS, ...HARD_SCENARIOS]

export function scenarioById(id: string): Scenario | undefined {
  return ALL_SCENARIOS.find((s) => s.id === id)
}
