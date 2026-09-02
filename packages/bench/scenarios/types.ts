// Scenario contract for the cospec-vs-openspec benchmark. One scenario per
// cospec schema type (11 total); a later stage authors the full set. Each
// scenario carries an identical task prompt run across both arms and both
// models — only the tool (cospec vs bare openspec) and the model/effort vary.

import type { CospecType } from '../../../apps/cli/src/core/rules/type-facts.ts'

/**
 * Inputs a completion predicate receives after the agent finishes: the resolved
 * sandbox directory and a helper to read a sandbox-relative file (undefined when
 * absent). Predicates check whether the fixture's requested code change actually
 * landed — the mechanical "did real work happen" signal, distinct from whether
 * the spec artifacts validate.
 */
export interface CompletionContext {
  sandbox: string
  readFile: (rel: string) => Promise<string | undefined>
  exists: (rel: string) => Promise<boolean>
}

export type CompletionPredicate = (ctx: CompletionContext) => Promise<boolean> | boolean

/**
 * A latent bug seeded ADJACENT to (never inside) a scenario's task subject —
 * a realistic, discoverable-by-careful-reading defect the task prompt never
 * mentions. See `scenarios/planted/<id>/` and docs/bench.md's "Planted bugs"
 * section for the full mechanism and report wiring.
 */
export interface PlantedBug {
  /** Path (relative to the scenario's `fixtureDir`) to the file the defect lives in. */
  file: string
  /** Human-readable description of the defect, for docs/reports. */
  description: string
  /**
   * Path (relative to `scenarios/planted/<id>/`) to the `bun:test` detector
   * file: FAILS while the bug is present, PASSES once it is fixed — verified
   * both directions in `test/unit/planted.test.ts`.
   */
  detector: string
}

export interface Scenario {
  /** Stable id used in the matrix and reports; matches the cospec type it exercises. */
  id: string
  /** The cospec schema type this scenario is authored for (drives artifact proportionality). */
  type: CospecType
  title: string
  /**
   * Identical task prompt across arms and models — the scenario itself never
   * mentions the spec-driven workflow. A byte-identical, tool-neutral
   * instruction to use it is appended to the SDK system prompt for both arms
   * in `src/agent.ts` (`WORKFLOW_SYSTEM_PROMPT`), not here.
   */
  prompt: string
  /**
   * Directory (relative to `packages/bench/scenarios/`) whose contents seed the
   * sandbox before the agent runs. Empty/absent means a bare git repo.
   */
  fixtureDir: string
  /** Per-scenario turn ceiling passed to the Agent SDK. */
  maxTurns: number
  /** Whether the fixture's requested code change landed (mechanical task-completion signal). */
  completed: CompletionPredicate
  /**
   * Optional latent bug seeded adjacent to this scenario's task subject.
   * Undefined for scenarios with no plant.
   */
  plantedBug?: PlantedBug
}
