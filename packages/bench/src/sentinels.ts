// Redaction-sentinel construction, shared by the live matrix runner (run.ts)
// and the standalone report tools (--review-report, --publish-from) that
// operate on a PAST run's persisted aggregate.json without re-running any
// agent. Split out of run.ts (which has a top-level `process.exit(...)` side
// effect on import) so both call sites can import it safely.

import { ALL_SCENARIOS } from '../scenarios/index.ts'
import type { Sentinels } from './redact.ts'

/** Fixture-unique refs embedded in scenario prompts, scrubbed from any report. */
export function scenarioSentinels(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of ALL_SCENARIOS) {
    for (const ref of s.prompt.match(/BENCH-[A-Z0-9-]+/g) ?? []) {
      out[`ref:${s.id}:${ref}`] = ref
    }
  }
  return out
}

/** Sentinels for the redaction guard: fixture refs plus any API keys in the env. */
export function buildSentinels(): Sentinels {
  const deepseekKey = process.env['DEEPSEEK_API_KEY']
  const anthropicKey = process.env['ANTHROPIC_API_KEY']
  return {
    ...scenarioSentinels(),
    ...(deepseekKey !== undefined && deepseekKey.length > 0 ? { deepseekKey } : {}),
    ...(anthropicKey !== undefined && anthropicKey.length > 0 ? { anthropicKey } : {}),
  }
}
