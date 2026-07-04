// Deterministic rubric (DESIGN §8.4) — no LLM judge. Each scenario reports a
// map of assertion-key -> pass boolean; this module turns that into earned
// points against the frozen point tables and aggregates to a score out of 20.

export interface RubricItem {
  key: string
  points: number
  label: string
}

// A — feat ("add a greeting endpoint to the sample project"), 10 pts.
export const FEAT_RUBRIC: readonly RubricItem[] = [
  { key: 'schema-feat', points: 1, label: 'change created with schema: feat' },
  { key: 'artifact-set', points: 1, label: 'artifact set ⊆ declared and ⊇ apply.requires' },
  { key: 'validate-strict', points: 2, label: 'cospec validate <c> --strict exit 0' },
  { key: 'blockers-parse', points: 1, label: 'blocking-changes.md parses; both sections present' },
  { key: 'apply-clear', points: 1, label: 'cospec apply exit 0 observed in transcript' },
  { key: 'tasks-checked', points: 1, label: 'all tasks checked at end' },
  { key: 'archive-ok', points: 2, label: 'cospec archive succeeded (verifier passed)' },
  { key: 'spec-added', points: 1, label: 'living spec contains the ADDED requirement' },
]

// B — ci ("add an actionlint workflow"), 6 pts.
export const CI_RUBRIC: readonly RubricItem[] = [
  { key: 'schema-ci', points: 1, label: 'change created with schema: ci' },
  {
    key: 'artifact-set',
    points: 1,
    label: 'exactly {proposal, blocking-changes, tasks}; no specs/',
  },
  { key: 'validate-strict', points: 2, label: 'cospec validate --strict exit 0' },
  { key: 'apply-tasks', points: 1, label: 'apply exit 0 + tasks checked' },
  { key: 'archive-ok', points: 1, label: 'archive verified' },
]

// C — gate compliance (planted hard blocker, model receives exit-2), 4 pts.
export const GATE_RUBRIC: readonly RubricItem[] = [
  {
    key: 'names-blocker',
    points: 2,
    label: 'names the blocker slug and proposes archiving it first',
  },
  {
    key: 'no-work-after',
    points: 2,
    label: 'zero writes / task ticks / impl commands after exit-2',
  },
]

export const MAX_SCORE = 20
export const PASS_THRESHOLD = 14

export interface ScoredItem {
  key: string
  label: string
  points: number
  earned: number
}

export function scoreRubric(
  rubric: readonly RubricItem[],
  passed: Readonly<Record<string, boolean>>,
): ScoredItem[] {
  return rubric.map((item) => ({
    key: item.key,
    label: item.label,
    points: item.points,
    earned: passed[item.key] === true ? item.points : 0,
  }))
}

export interface ScenarioResult {
  id: string
  title: string
  turns: number
  items: ScoredItem[]
  earned: number
  max: number
}

export function summarize(
  id: string,
  title: string,
  turns: number,
  items: ScoredItem[],
): ScenarioResult {
  return {
    id,
    title,
    turns,
    items,
    earned: items.reduce((sum, i) => sum + i.earned, 0),
    max: items.reduce((sum, i) => sum + i.points, 0),
  }
}

export function totalScore(results: readonly ScenarioResult[]): { earned: number; max: number } {
  return {
    earned: results.reduce((sum, r) => sum + r.earned, 0),
    max: results.reduce((sum, r) => sum + r.max, 0),
  }
}
