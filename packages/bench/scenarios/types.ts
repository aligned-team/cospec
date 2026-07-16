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

export interface Scenario {
  /** Stable id used in the matrix and reports; matches the cospec type it exercises. */
  id: string
  /** The cospec schema type this scenario is authored for (drives artifact proportionality). */
  type: CospecType
  title: string
  /** Identical task prompt across arms and models. Arm-specific workflow framing is added by the runner. */
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
}
