// Scenario registry — one scenario per cospec schema type (11 total), in
// COSPEC_TYPES order.

import { buildScenario } from './build.ts'
import { choreScenario } from './chore.ts'
import { ciScenario } from './ci.ts'
import { docsScenario } from './docs.ts'
import { featScenario } from './feat.ts'
import { fixScenario } from './fix.ts'
import { perfScenario } from './perf.ts'
import { refactorScenario } from './refactor.ts'
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

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id)
}
