// Redaction guard for eval reports (DESIGN §8.4).
//
// A report may contain only stage pass/fail bits, rule-id failures, turn/token
// counts, the model id, and durations — never the API key, raw prompts, raw
// completions, file bodies, or fixture-unique strings. This module provides the
// sentinel scan used as a self-check: if any sentinel survives into the object
// about to be printed or written, the run fails loudly rather than leaking.

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
 * marker. Used for persisted transcripts: unlike the report object (which may
 * carry only structural bits and is guarded by assertRedacted), transcripts
 * intentionally retain model text and tool output, so any secret or
 * fixture-unique string must be scrubbed rather than merely detected. Longest
 * sentinels first so an overlapping shorter one cannot leave a fragment behind.
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
