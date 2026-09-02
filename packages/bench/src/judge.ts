// Semantic-quality judge (DeepSeek, native API — reuses e2e/eval's client shape:
// raw fetch against the OpenAI-compatible chat/completions endpoint, bearer auth,
// temperature 0; see e2e/eval/context.ts and e2e/eval/agent.ts). A non-Claude
// judge avoids self-preference. The judge scores REDACTED, defensively-truncated
// artifact text only, on a per-axis 0–3 rubric, prompted for brief chain-of-
// thought reasoning followed by a delimited final JSON verdict, k=3 samples
// averaged. It returns scores only — never the prompt, the reasoning, or the
// artifact text — and skips gracefully (null) when DEEPSEEK_API_KEY is unset
// (checked by the caller; this module only ever sees a key it was handed).
//
// max_tokens gotcha (see e2e/eval/context.ts MAX_TOKENS_PER_TURN): DeepSeek
// silently truncates at the token ceiling rather than erroring, and a
// truncated response here would either fail to parse or — worse — parse a
// half-written JSON object into a bogus score. MAX_TOKENS_PER_SAMPLE is sized
// generously for reasoning-then-JSON, and finish_reason === 'length' is
// treated as a failed sample rather than parsed.

import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { redactText, type Sentinels } from './redact.ts'

export interface QualityScore {
  completeness: number
  internalConsistency: number
  /** Inverted: higher = less ambiguous. */
  ambiguity: number
  verifiability: number
  traceability: number
  /** Mean of the five axes. */
  overall: number
  /** How many of the k samples parsed and were averaged. */
  samples: number
}

export interface JudgeConfig {
  apiKey: string
  baseUrl: string
  model: string
  /** k — number of samples to average (DESIGN: 3). */
  samples: number
  fetchImpl?: typeof fetch
}

const AXES = [
  'completeness',
  'internalConsistency',
  'ambiguity',
  'verifiability',
  'traceability',
] as const

type Axis = (typeof AXES)[number]

// Delimiters the model is instructed to wrap its final verdict in. Scanning
// for these (rather than the last balanced `{...}` in the whole reply) keeps
// parsing robust to stray braces inside the reasoning prose that precedes it.
const VERDICT_START = 'FINAL_VERDICT'
const VERDICT_END = 'END_VERDICT'

// Ceiling on the judge's own completion tokens. Generous on purpose (see the
// module-header gotcha note): brief per-axis reasoning plus a small JSON
// object comfortably fits well under this, but a low ceiling is exactly what
// silently truncates the trailing JSON and either fails to parse or parses a
// half-written object.
const MAX_TOKENS_PER_SAMPLE = 2048

// Ceiling on artifact text sent to the judge. cospec change bodies are small
// in practice (a handful of short markdown files); this only ever bites on a
// degenerate/runaway agent output, and truncating defensively is cheaper than
// letting one huge artifact blow the judge's own context budget.
const MAX_ARTIFACT_CHARS = 20_000

const SYSTEM_PROMPT = [
  'You are a strict reviewer of spec-driven-development change artifacts',
  '(proposal, tasks, specs, design, verification). Think step by step across',
  'five axes, briefly noting your reasoning for each — at most two short',
  'sentences per axis. Do not quote the artifacts back at length and do not',
  'restate these instructions; keep the reasoning terse, then stop. Score each',
  'axis as an integer 0–3:',
  '- completeness: are the artifacts the change needs present and substantive?',
  '- internalConsistency: do the artifacts agree with each other?',
  '- ambiguity: how UNambiguous is the spec? (3 = crisp, 0 = vague) — inverted.',
  '- verifiability: are outcomes stated as checkable acceptance evidence?',
  '- traceability: do tasks/specs trace back to the proposal and to each other?',
  '',
  'After your reasoning, output the final verdict and nothing else after it,',
  'formatted EXACTLY as:',
  VERDICT_START,
  '{"completeness": <0-3>, "internalConsistency": <0-3>, "ambiguity": <0-3>, "verifiability": <0-3>, "traceability": <0-3>}',
  VERDICT_END,
].join('\n')

const ARTIFACT_FILE_ORDER = [
  'proposal.md',
  'blocking-changes.md',
  'design.md',
  'verification.md',
  'tasks.md',
]

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

/**
 * Redact (defensively — see below) then cap `text` at `MAX_ARTIFACT_CHARS`,
 * appending the same truncation marker `collectArtifactText` uses. Shared by
 * `collectArtifactText` (live sandbox filesystem) and
 * `judgeInputFromArtifactFiles` (a persisted snapshot) so the two paths can
 * never drift into two different truncation behaviors.
 */
function redactAndTruncate(joined: string, sentinels: Sentinels): string {
  const redacted = redactText(joined, sentinels)
  return redacted.length > MAX_ARTIFACT_CHARS
    ? `${redacted.slice(0, MAX_ARTIFACT_CHARS)}\n\n[... truncated for judge input ...]`
    : redacted
}

/**
 * Concatenate the change's artifact text (the standard files plus any specs/
 * deltas), REDACTED, for the judge. Returns '' when the change dir is absent or
 * empty — the caller treats an empty body as "nothing to judge".
 */
export async function collectArtifactText(
  sandbox: string,
  changeDir: string,
  sentinels: Sentinels,
): Promise<string> {
  const base = join(sandbox, changeDir)
  if (!(await exists(base))) return ''
  const parts: string[] = []
  for (const name of ARTIFACT_FILE_ORDER) {
    const path = join(base, name)
    if (await exists(path)) parts.push(`### ${name}\n${await Bun.file(path).text()}`)
  }
  const specsDir = join(base, 'specs')
  if (await exists(specsDir)) {
    const walk = async (dir: string, prefix: string): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix === '' ? e.name : `${prefix}/${e.name}`
        if (e.isDirectory()) await walk(join(dir, e.name), rel)
        else if (e.name.endsWith('.md')) {
          parts.push(`### specs/${rel}\n${await Bun.file(join(dir, e.name)).text()}`)
        }
      }
    }
    await walk(specsDir, '')
  }
  // Truncate after redaction, never before: slicing raw text first could cut a
  // sentinel in half, leaving an unmatched fragment that redactText can no
  // longer find and would leak into the judge prompt.
  return redactAndTruncate(parts.join('\n\n'), sentinels)
}

/**
 * Rebuild the exact judge input text `collectArtifactText` would have
 * produced, from an already-persisted artifact snapshot's `files` map (see
 * `mechanical.ts`'s `ArtifactSnapshot` / `report.ts`'s `writeArtifactSnapshot`)
 * instead of the live sandbox filesystem — this is what `--judge-report`
 * (`run.ts`) uses to re-run the judge on a PAST cell from
 * `snapshots/<cellKey>.json`, with no agent re-run. Mirrors
 * `collectArtifactText`'s file order (`ARTIFACT_FILE_ORDER`, then
 * `specs/**\/*.md` sorted) exactly, so a cell re-judged this way sees text
 * equivalent to what a live run would have produced. Snapshot file text is
 * already redacted by `writeArtifactSnapshot`, so passing `sentinels` again
 * here is defensive (normally a no-op) rather than load-bearing — it keeps
 * this path honoring the same redact-then-truncate contract as the live one.
 */
export function judgeInputFromArtifactFiles(
  files: Readonly<Record<string, string>>,
  sentinels: Sentinels,
): string {
  const parts: string[] = []
  for (const name of ARTIFACT_FILE_ORDER) {
    const text = files[name]
    if (text !== undefined) parts.push(`### ${name}\n${text}`)
  }
  const specRels = Object.keys(files)
    .filter((rel) => rel.startsWith('specs/') && rel.endsWith('.md'))
    .toSorted()
  for (const rel of specRels) {
    parts.push(`### ${rel}\n${files[rel]}`)
  }
  return redactAndTruncate(parts.join('\n\n'), sentinels)
}

function clamp03(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(3, n))
}

/**
 * Pull the text between the last FINAL_VERDICT/END_VERDICT delimiter pair —
 * the model's reasoning prose comes before it and may itself contain braces,
 * so this must anchor on the delimiters rather than brace-scanning the whole
 * reply. Falls back to the whole string when a small model drops the
 * delimiters, so a well-formed bare JSON reply still parses.
 */
function extractVerdictBlock(raw: string): string {
  const startIdx = raw.lastIndexOf(VERDICT_START)
  if (startIdx === -1) return raw
  const afterStart = raw.slice(startIdx + VERDICT_START.length)
  const endIdx = afterStart.indexOf(VERDICT_END)
  return endIdx === -1 ? afterStart : afterStart.slice(0, endIdx)
}

function parseSample(raw: string): Record<Axis, number> | undefined {
  const block = extractVerdictBlock(raw)
  const stripped = block.replace(/```json\s*|\s*```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return undefined
  let obj: unknown
  try {
    obj = JSON.parse(stripped.slice(start, end + 1))
  } catch {
    return undefined
  }
  if (typeof obj !== 'object' || obj === null) return undefined
  const record = obj as Record<string, unknown>
  const out = {} as Record<Axis, number>
  for (const axis of AXES) {
    const v = record[axis]
    if (typeof v !== 'number') return undefined
    out[axis] = clamp03(v)
  }
  return out
}

/**
 * One sample's outcome. Failures carry a short, non-sensitive `reason` (an
 * HTTP status, `finish_reason`, or parse-failure tag — never the API key, the
 * raw completion, or the artifact text) so a run that scores every cell
 * `quality: null` can be diagnosed from the report alone instead of silently
 * vanishing (this shape exists because of exactly that: the first full run
 * scored `quality: null` on all 44 cells with no diagnostic anywhere — see
 * `judgeArtifacts`'s doc comment).
 */
type SampleOutcome = { ok: true; scores: Record<Axis, number> } | { ok: false; reason: string }

async function oneSample(config: JudgeConfig, artifactText: string): Promise<SampleOutcome> {
  const fetchImpl = config.fetchImpl ?? fetch
  const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Artifacts under review:\n\n${artifactText}` },
      ],
      temperature: 0,
      max_tokens: MAX_TOKENS_PER_SAMPLE,
    }),
  })
  if (!res.ok) return { ok: false, reason: `http ${res.status}` }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  const choice = body.choices?.[0]
  // Hit the max_tokens ceiling before finishing reasoning + verdict — the tail
  // is a truncated fragment, not a parseable (or trustworthy) JSON object.
  if (choice?.finish_reason === 'length') return { ok: false, reason: 'finish_reason:length' }
  const content = choice?.message?.content
  if (typeof content !== 'string') return { ok: false, reason: 'no-content' }
  const parsed = parseSample(content)
  return parsed === undefined ? { ok: false, reason: 'parse_failed' } : { ok: true, scores: parsed }
}

export interface JudgeResult {
  /** null when there was nothing to judge (empty text) or every sample failed. */
  quality: QualityScore | null
  /**
   * Set only when at least one sample was attempted and every one failed —
   * a short, non-sensitive summary of why (see `SampleOutcome.reason`). Never
   * set when `artifactText` was empty (nothing to judge is not a failure).
   * Never contains the API key, a raw completion, or artifact text.
   */
  error?: string
}

function summarizeFailures(reasons: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1)
  const parts = [...counts.entries()].map(([reason, n]) => (n > 1 ? `${reason} x${n}` : reason))
  return `${reasons.length} sample(s) failed: ${parts.join(', ')}`
}

/**
 * Judge one change's artifacts. `quality` is null when there is nothing to
 * judge (empty text) or when every sample failed to parse — callers record
 * `quality: null` rather than fabricating a score. Unlike the pre-fix
 * behavior, a failure is never silent: when every attempted sample failed,
 * `error` carries a short diagnostic (HTTP status / finish_reason / parse
 * outcome) so the report can surface WHY quality is null instead of just
 * that it is (root cause of the first full run's all-44-cells `quality:
 * null`: the configured DeepSeek key had no account balance — every call
 * returned HTTP 402 — and that failure was swallowed all the way up).
 */
export async function judgeArtifacts(
  config: JudgeConfig,
  artifactText: string,
): Promise<JudgeResult> {
  if (artifactText.trim().length === 0) return { quality: null }

  const samples: Record<Axis, number>[] = []
  const failures: string[] = []
  for (let i = 0; i < config.samples; i += 1) {
    const outcome = await oneSample(config, artifactText)
    if (outcome.ok) samples.push(outcome.scores)
    else failures.push(outcome.reason)
  }
  if (samples.length === 0) {
    return { quality: null, error: summarizeFailures(failures) }
  }

  const mean = (axis: Axis): number => samples.reduce((sum, s) => sum + s[axis], 0) / samples.length
  const completeness = mean('completeness')
  const internalConsistency = mean('internalConsistency')
  const ambiguity = mean('ambiguity')
  const verifiability = mean('verifiability')
  const traceability = mean('traceability')
  const overall =
    (completeness + internalConsistency + ambiguity + verifiability + traceability) / AXES.length

  return {
    quality: {
      completeness,
      internalConsistency,
      ambiguity,
      verifiability,
      traceability,
      overall,
      samples: samples.length,
    },
  }
}
