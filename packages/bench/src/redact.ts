// Redaction guard for bench reports (mirrors e2e/eval/redact.ts). A report may
// contain only counts, scores, rule ids, durations, token/cost telemetry, and
// the model/claude-code version — never an API key, raw prompt, raw completion,
// artifact body, or fixture-unique string. This module provides the sentinel
// scan used as a self-check before anything is written to disk.

export type Sentinels = Readonly<Record<string, string>>

/** Labels of every sentinel that leaked into `value` once JSON-serialized. */
export function findLeaks(value: unknown, sentinels: Sentinels): string[] {
  const serialized = JSON.stringify(value)
  return Object.entries(sentinels)
    .filter(([, sentinel]) => sentinel.length > 0 && serialized.includes(sentinel))
    .map(([label]) => label)
}

/** Throws if any sentinel leaked; otherwise returns `value` unchanged. */
export function assertRedacted<T>(value: T, sentinels: Sentinels): T {
  const leaks = findLeaks(value, sentinels)
  if (leaks.length > 0) {
    throw new Error(`redaction self-check failed — report leaks: ${leaks.join(', ')}`)
  }
  return value
}

/**
 * Replace every sentinel occurrence in `text` with a `[REDACTED:<label>]`
 * marker. Longest sentinels first so an overlapping shorter one cannot leave a
 * fragment behind. Used when any free text must be persisted (the bench keeps
 * this to a minimum — reports are structural).
 */
export function redactText(text: string, sentinels: Sentinels): string {
  let out = text
  const entries = Object.entries(sentinels)
    .filter(([, sentinel]) => sentinel.length > 0)
    .toSorted(([, a], [, b]) => b.length - a.length)
  for (const [label, sentinel] of entries) {
    out = out.split(sentinel).join(`[REDACTED:${label}]`)
  }
  return out
}
