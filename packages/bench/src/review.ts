// Adversarial review stage — "bugs that slipped through the workflow".
//
// Given one cell's persisted code diff and the engineering task it was solving,
// spawn K independent, ARM-BLIND reviewer runs (a cheap read-only Claude Code
// via the same Agent SDK the harness already uses) each prompted to find real
// CORRECTNESS bugs in the diff — not style, not spec-conformance. Each reviewer
// returns strict JSON findings; findings are deduped, then a per-finding
// verifier run (same model) is prompted to REFUTE each one against the actual
// diff. Only findings the verifier could NOT refute are counted as confirmed
// defects (`ReviewDefects.confirmed`).
//
// Arm-blindness is load-bearing: the reviewer must never learn whether cospec
// or openspec produced the diff, or the whole comparison is contaminated. The
// diff is scrubbed of tool identifiers and every prompt passes `assertArmBlind`
// before it is sent (unit-tested guard). Reviews run post-hoc from the persisted
// diff, so this module is also the engine behind `run.ts`'s `--review-report`
// standalone mode — no agent re-run required.
//
// Every LLM boundary is injected as a `ReviewRunner`, so the orchestration
// (parse, dedupe, refute-filter) is unit-tested against a mocked runner with no
// network or subprocess. `defaultReviewRunner` is the production one.

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Options } from '@anthropic-ai/claude-agent-sdk'

import type { ReviewDefects } from './mechanical.ts'

/** The reviewer/verifier model — a cheap Haiku, distinct from the arms' models. */
export const REVIEW_MODEL = 'claude-haiku-4-5-20251001'
/** Reviewer reasoning effort (task spec: high). */
export const REVIEW_EFFORT = 'high'
/** Independent reviewer runs per cell (task spec: K=2). */
export const DEFAULT_REVIEWERS = 2
// Read-only tools only: the reviewer reasons over the inline diff and must not
// mutate anything. Bash/Write/Edit are deliberately absent.
const REVIEW_TOOLS = ['Read', 'Grep', 'Glob']
// Low turn ceiling — a diff review is a single reasoning pass, not an agentic
// loop — and a small spend cap; K reviewers + N verifiers per cell across the
// matrix must stay cheap (see docs/bench.md's cost note).
const REVIEW_MAX_TURNS = 15
const REVIEW_BUDGET_USD = 1

/** A single correctness finding a reviewer raised against the diff. */
export interface ReviewFinding {
  /** Short one-line summary of the bug. */
  title: string
  /** Where in the diff (file / symbol / hunk) — free text, may be empty. */
  location: string
  /** Why it is a real correctness bug, and the failure it causes. */
  explanation: string
}

/**
 * An LLM boundary: given a fully-built prompt, return the model's text reply.
 * Injected so the orchestration is testable with no network. `defaultReviewRunner`
 * is the production implementation over the Agent SDK.
 */
export type ReviewRunner = (prompt: string) => Promise<string>

export interface ReviewDiffOptions {
  diff: string
  /** The engineering task the diff was solving (a scenario prompt). */
  taskPrompt: string
  runner: ReviewRunner
  /** Independent reviewer runs (default `DEFAULT_REVIEWERS`). */
  reviewers?: number
}

const ARM_IDENTIFIER = /cospec|openspec/gi

/** True when `text` mentions either tool by name (case-insensitive) — an arm leak. */
export function containsArmIdentifier(text: string): boolean {
  ARM_IDENTIFIER.lastIndex = 0
  return ARM_IDENTIFIER.test(text)
}

/** Replace every tool identifier with a neutral placeholder, so a diff cannot reveal its arm. */
export function scrubArmIdentifiers(text: string): string {
  return text.replace(ARM_IDENTIFIER, 'the-tool')
}

/**
 * Guard: throw if a prompt about to be sent to a reviewer still names either
 * tool. `buildReviewPrompt`/`buildVerifierPrompt` scrub the diff first, so this
 * only fires on a programming error that reintroduces an identifier — the
 * benchmark must never tell a reviewer which arm it is judging.
 */
export function assertArmBlind(prompt: string): string {
  if (containsArmIdentifier(prompt)) {
    throw new Error('review prompt leaks an arm identifier (cospec/openspec) — must be arm-blind')
  }
  return prompt
}

const REVIEW_INSTRUCTIONS = [
  'You are reviewing a code diff produced by an autonomous coding agent that was',
  'given the engineering task below. Find REAL CORRECTNESS BUGS introduced by the',
  'diff: logic errors, off-by-one, wrong conditionals, unhandled edge cases,',
  'broken/incorrect behavior versus what the task asks. Do NOT report style,',
  'formatting, naming, documentation, test coverage, or process/spec-workflow',
  'concerns — only correctness. If you find no correctness bug, return an empty',
  'array. Report each bug once.',
  '',
  'Respond with ONLY a strict JSON array (no prose, no code fences) of objects,',
  'each exactly: {"title": string, "location": string, "explanation": string}.',
  'title: one-line summary. location: file/function/hunk. explanation: the bug',
  'and the concrete failure it causes.',
].join('\n')

const VERIFIER_INSTRUCTIONS = [
  'You are verifying a bug report against a code diff. Your job is to REFUTE the',
  'reported bug: check the diff carefully and decide whether it is a real',
  'correctness bug or a false positive (mistaken, already handled, or not',
  'actually present in the diff). Be skeptical — only confirm a bug you can point',
  'to concretely in the diff.',
  '',
  'Respond with ONLY a strict JSON object (no prose, no code fences), exactly:',
  '{"confirmed": boolean, "reason": string}. confirmed=true ONLY if you could',
  'NOT refute it (the bug is real and present in the diff); confirmed=false if it',
  'is a false positive.',
].join('\n')

/** Build the (arm-blind) reviewer prompt for a diff + task. Scrubs then asserts. */
export function buildReviewPrompt(diff: string, taskPrompt: string): string {
  const prompt = [
    REVIEW_INSTRUCTIONS,
    '',
    '## Engineering task',
    scrubArmIdentifiers(taskPrompt),
    '',
    '## Diff under review',
    '```diff',
    scrubArmIdentifiers(diff),
    '```',
  ].join('\n')
  return assertArmBlind(prompt)
}

/** Build the (arm-blind) verifier prompt for one finding against the diff. Scrubs then asserts. */
export function buildVerifierPrompt(
  finding: ReviewFinding,
  diff: string,
  taskPrompt: string,
): string {
  const prompt = [
    VERIFIER_INSTRUCTIONS,
    '',
    '## Engineering task',
    scrubArmIdentifiers(taskPrompt),
    '',
    '## Reported bug',
    `title: ${scrubArmIdentifiers(finding.title)}`,
    `location: ${scrubArmIdentifiers(finding.location)}`,
    `explanation: ${scrubArmIdentifiers(finding.explanation)}`,
    '',
    '## Diff under review',
    '```diff',
    scrubArmIdentifiers(diff),
    '```',
  ].join('\n')
  return assertArmBlind(prompt)
}

/** Extract the first balanced JSON array/object substring from a possibly-fenced reply. */
function extractJson(raw: string, open: '[' | '{', close: ']' | '}'): string | undefined {
  const stripped = raw.replace(/```json\s*|```/g, '')
  const start = stripped.indexOf(open)
  const end = stripped.lastIndexOf(close)
  if (start === -1 || end === -1 || end < start) return undefined
  return stripped.slice(start, end + 1)
}

/**
 * Parse a reviewer reply into findings. Tolerant of surrounding prose or code
 * fences (extracts the JSON array); a malformed/absent array yields `[]` (a
 * reviewer that returned nothing usable found nothing, not an error). Entries
 * missing a `title` are dropped; `location`/`explanation` default to ''.
 */
export function parseFindings(raw: string): ReviewFinding[] {
  const json = extractJson(raw, '[', ']')
  if (json === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const out: ReviewFinding[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    const title = typeof rec['title'] === 'string' ? rec['title'].trim() : ''
    if (title.length === 0) continue
    out.push({
      title,
      location: typeof rec['location'] === 'string' ? rec['location'] : '',
      explanation: typeof rec['explanation'] === 'string' ? rec['explanation'] : '',
    })
  }
  return out
}

/**
 * Parse a verifier reply into a confirmed/refuted decision. Anything that is not
 * an explicit `{"confirmed": true}` resolves to `false` — an unparseable or
 * ambiguous verdict refutes the finding rather than counting an unverified
 * defect (the benchmark never inflates the confirmed count on a parse failure).
 */
export function parseVerdict(raw: string): boolean {
  const json = extractJson(raw, '{', '}')
  if (json === undefined) return false
  try {
    const parsed = JSON.parse(json) as { confirmed?: unknown }
    return parsed.confirmed === true
  } catch {
    return false
  }
}

function normalizeForKey(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Normalized key for dedup: lowercased, whitespace-collapsed title + location. */
function findingKey(f: ReviewFinding): string {
  return `${normalizeForKey(f.title)}::${normalizeForKey(f.location)}`
}

/** Dedupe findings across reviewer runs by normalized (title, location). Order-stable. */
export function dedupeFindings(findings: readonly ReviewFinding[]): ReviewFinding[] {
  const seen = new Set<string>()
  const out: ReviewFinding[] = []
  for (const f of findings) {
    const key = findingKey(f)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(f)
  }
  return out
}

/**
 * Review one diff: K reviewer runs → deduped findings (`found`) → a refutation
 * pass per unique finding → `confirmed` = those the verifier could not refute.
 * An empty diff short-circuits to `{found: 0, confirmed: 0}` (nothing was
 * changed, so nothing to review). Every prompt is arm-blind by construction.
 */
export async function reviewDiff(options: ReviewDiffOptions): Promise<ReviewDefects> {
  const { diff, taskPrompt, runner } = options
  if (diff.trim().length === 0) return { found: 0, confirmed: 0 }
  const reviewers = options.reviewers ?? DEFAULT_REVIEWERS

  const raised: ReviewFinding[] = []
  for (let i = 0; i < reviewers; i += 1) {
    const reply = await runner(buildReviewPrompt(diff, taskPrompt))
    raised.push(...parseFindings(reply))
  }
  const unique = dedupeFindings(raised)

  let confirmed = 0
  for (const finding of unique) {
    const reply = await runner(buildVerifierPrompt(finding, diff, taskPrompt))
    if (parseVerdict(reply)) confirmed += 1
  }
  return { found: unique.length, confirmed }
}

/**
 * Hermetic query options for a reviewer/verifier run: the cheap Haiku, read-only
 * tools, a throwaway empty cwd (nothing sensitive to read), and the same
 * settings-source/MCP lockdown the arms use. The prompt carries the diff inline,
 * so the tools are a belt-and-braces read-only guarantee, not a data source.
 */
function reviewOptions(cwd: string): Options {
  return {
    cwd,
    model: REVIEW_MODEL,
    allowedTools: REVIEW_TOOLS,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    mcpServers: {},
    strictMcpConfig: true,
    settingSources: [],
    persistSession: false,
    maxTurns: REVIEW_MAX_TURNS,
    maxBudgetUsd: REVIEW_BUDGET_USD,
    executable: 'bun',
    env: { ...process.env, CLAUDE_CODE_EFFORT_LEVEL: REVIEW_EFFORT },
    stderr: () => {},
  }
}

/**
 * Production `ReviewRunner`: drive one headless reviewer/verifier via the Agent
 * SDK and return only its final result text. Runs in a fresh empty temp cwd so
 * the read-only tools have nothing of the host repo to read. Returns '' if the
 * run produced no successful result (the caller's parsers treat '' as "no
 * findings" / "refuted", never as a defect).
 */
export const defaultReviewRunner: ReviewRunner = async (prompt) => {
  const cwd = await mkdtemp(join(tmpdir(), 'cospec-bench-review-'))
  try {
    let text = ''
    for await (const message of query({ prompt, options: reviewOptions(cwd) })) {
      if (message.type === 'result' && message.subtype === 'success') text = message.result
    }
    return text
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
