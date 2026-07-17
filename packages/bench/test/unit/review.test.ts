import { describe, expect, test } from 'bun:test'

import {
  assertArmBlind,
  buildReviewPrompt,
  buildVerifierPrompt,
  containsArmIdentifier,
  dedupeFindings,
  parseFindings,
  parseVerdict,
  reviewDiff,
  scrubArmIdentifiers,
  type ReviewFinding,
  type ReviewRunner,
} from '../../src/review.ts'

// A diff and task that deliberately name both tools, to prove the prompt
// builders scrub them and never leak the arm to a reviewer.
const LEAKY_DIFF = [
  'diff --git a/x.ts b/x.ts',
  '+// cospec generated this; OPENSPEC validated it',
  '+export const n = 1',
].join('\n')
const LEAKY_TASK = 'Refactor using cospec conventions and the OpenSpec workflow.'

describe('arm-blindness guard', () => {
  test('containsArmIdentifier detects either tool, case-insensitively', () => {
    expect(containsArmIdentifier('uses cospec here')).toBe(true)
    expect(containsArmIdentifier('OPENSPEC init')).toBe(true)
    expect(containsArmIdentifier('CoSpEc')).toBe(true)
    expect(containsArmIdentifier('a neutral diff with no tool names')).toBe(false)
  })

  test('containsArmIdentifier is stateless across calls (global-regex lastIndex reset)', () => {
    // A /g regex reused via .test() advances lastIndex; two identical calls must
    // both return true rather than alternating.
    expect(containsArmIdentifier('cospec')).toBe(true)
    expect(containsArmIdentifier('cospec')).toBe(true)
  })

  test('scrubArmIdentifiers replaces every occurrence with a neutral placeholder', () => {
    const out = scrubArmIdentifiers('cospec vs openspec, again cospec')
    expect(containsArmIdentifier(out)).toBe(false)
    expect(out).toBe('the-tool vs the-tool, again the-tool')
  })

  test('assertArmBlind throws on a leaking prompt and passes a clean one through', () => {
    expect(() => assertArmBlind('mentions cospec')).toThrow(/arm-blind/)
    expect(assertArmBlind('clean prompt')).toBe('clean prompt')
  })
})

describe('buildReviewPrompt / buildVerifierPrompt', () => {
  test('review prompt embeds the (scrubbed) diff + task and is arm-blind', () => {
    const prompt = buildReviewPrompt(LEAKY_DIFF, LEAKY_TASK)
    expect(containsArmIdentifier(prompt)).toBe(false)
    expect(prompt).toContain('export const n = 1')
    expect(prompt).toContain('Refactor using the-tool conventions')
    expect(prompt).toContain('```diff')
    expect(prompt).toContain('correctness')
  })

  test('verifier prompt embeds the finding + (scrubbed) diff and is arm-blind', () => {
    const finding: ReviewFinding = {
      title: 'off-by-one in cospec loop',
      location: 'x.ts:openspec',
      explanation: 'iterates one past the end',
    }
    const prompt = buildVerifierPrompt(finding, LEAKY_DIFF, LEAKY_TASK)
    expect(containsArmIdentifier(prompt)).toBe(false)
    expect(prompt).toContain('off-by-one in the-tool loop')
    expect(prompt).toContain('REFUTE')
  })
})

describe('parseFindings', () => {
  test('parses a bare JSON array of findings', () => {
    const raw = JSON.stringify([
      { title: 'bug a', location: 'f.ts', explanation: 'why a' },
      { title: 'bug b', location: 'g.ts', explanation: 'why b' },
    ])
    expect(parseFindings(raw)).toEqual([
      { title: 'bug a', location: 'f.ts', explanation: 'why a' },
      { title: 'bug b', location: 'g.ts', explanation: 'why b' },
    ])
  })

  test('tolerates code fences and surrounding prose', () => {
    const raw =
      'Here are my findings:\n```json\n[{"title":"x","location":"","explanation":""}]\n```\ndone'
    expect(parseFindings(raw)).toEqual([{ title: 'x', location: '', explanation: '' }])
  })

  test('an empty array (no bugs found) parses to []', () => {
    expect(parseFindings('[]')).toEqual([])
  })

  test('drops entries missing a title, defaults location/explanation to empty string', () => {
    const raw = JSON.stringify([{ location: 'f.ts' }, { title: 'real', explanation: 'e' }])
    expect(parseFindings(raw)).toEqual([{ title: 'real', location: '', explanation: 'e' }])
  })

  test('a non-array / malformed reply yields [] (no fabricated findings)', () => {
    expect(parseFindings('not json at all')).toEqual([])
    expect(parseFindings('{"title":"single object not array"}')).toEqual([])
    expect(parseFindings('[unbalanced')).toEqual([])
  })
})

describe('parseVerdict', () => {
  test('confirmed:true → true', () => {
    expect(parseVerdict('{"confirmed": true, "reason": "real bug"}')).toBe(true)
  })

  test('confirmed:false → false', () => {
    expect(parseVerdict('{"confirmed": false, "reason": "false positive"}')).toBe(false)
  })

  test('anything unparseable/ambiguous refutes (false), never inflates the count', () => {
    expect(parseVerdict('no json')).toBe(false)
    expect(parseVerdict('{"confirmed": "yes"}')).toBe(false)
    expect(parseVerdict('{}')).toBe(false)
    expect(parseVerdict('{broken')).toBe(false)
  })

  test('tolerates code fences', () => {
    expect(parseVerdict('```json\n{"confirmed": true}\n```')).toBe(true)
  })
})

describe('dedupeFindings', () => {
  test('collapses duplicates by normalized (title, location), order-stable', () => {
    const findings: ReviewFinding[] = [
      { title: 'Off  by One', location: 'X.ts', explanation: 'a' },
      { title: 'off by one', location: 'x.ts ', explanation: 'b (dup, different casing/spacing)' },
      { title: 'null deref', location: 'y.ts', explanation: 'c' },
    ]
    const out = dedupeFindings(findings)
    expect(out).toHaveLength(2)
    expect(out.map((f) => f.title)).toEqual(['Off  by One', 'null deref'])
  })
})

describe('reviewDiff (mocked runner)', () => {
  test('empty diff short-circuits without calling the runner', async () => {
    let calls = 0
    const runner: ReviewRunner = async () => {
      calls += 1
      return '[]'
    }
    const result = await reviewDiff({ diff: '   \n  ', taskPrompt: 'task', runner })
    expect(result).toEqual({ found: 0, confirmed: 0 })
    expect(calls).toBe(0)
  })

  test('runs K reviewers, dedupes, then a verifier per unique finding; counts confirmed only', async () => {
    const reviewerPrompts: string[] = []
    const verifierPrompts: string[] = []
    const runner: ReviewRunner = async (prompt) => {
      if (prompt.includes('Reported bug')) {
        verifierPrompts.push(prompt)
        // Confirm the off-by-one, refute the "maybe" finding.
        return prompt.includes('off-by-one')
          ? '{"confirmed": true}'
          : '{"confirmed": false, "reason": "not actually a bug"}'
      }
      reviewerPrompts.push(prompt)
      // Both reviewers raise the same off-by-one (deduped to one); reviewer 2
      // additionally raises a speculative finding.
      return reviewerPrompts.length === 1
        ? '[{"title":"off-by-one","location":"a.ts","explanation":"loops past end"}]'
        : '[{"title":"off-by-one","location":"a.ts","explanation":"dup"},{"title":"maybe race","location":"b.ts","explanation":"speculative"}]'
    }
    const result = await reviewDiff({
      diff: 'diff --git a/a.ts b/a.ts\n+for (let i=0;i<=n;i++){}',
      taskPrompt: 'iterate the array',
      runner,
      reviewers: 2,
    })
    expect(reviewerPrompts).toHaveLength(2)
    // Two unique findings after dedup → two verifier runs.
    expect(verifierPrompts).toHaveLength(2)
    expect(result.found).toBe(2)
    expect(result.confirmed).toBe(1)
  })

  test('every prompt the runner sees is arm-blind, even when the diff/task name a tool', async () => {
    const seen: string[] = []
    const runner: ReviewRunner = async (prompt) => {
      seen.push(prompt)
      return prompt.includes('Reported bug')
        ? '{"confirmed": true}'
        : '[{"title":"bug","location":"x.ts","explanation":"e"}]'
    }
    await reviewDiff({ diff: LEAKY_DIFF, taskPrompt: LEAKY_TASK, runner, reviewers: 2 })
    expect(seen.length).toBeGreaterThan(0)
    for (const prompt of seen) expect(containsArmIdentifier(prompt)).toBe(false)
  })

  test('a verifier that refutes every finding yields confirmed=0 (found>0)', async () => {
    const result = await reviewDiff({
      diff: 'diff x',
      taskPrompt: 't',
      reviewers: 1,
      runner: async (prompt) =>
        prompt.includes('Reported bug')
          ? '{"confirmed": false}'
          : '[{"title":"bug","location":"x.ts","explanation":"e"}]',
    })
    expect(result.found).toBe(1)
    expect(result.confirmed).toBe(0)
  })
})
