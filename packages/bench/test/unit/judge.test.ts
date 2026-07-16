import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { collectArtifactText, judgeArtifacts, type JudgeConfig } from '../../src/judge.ts'

const roots: string[] = []

function makeSandbox(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-bench-judge-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), {
    status: ok ? 200 : 500,
    headers: { 'content-type': 'application/json' },
  })
}

function verdictReply(scores: Record<string, number>, finishReason = 'stop'): unknown {
  const reasoning = [
    'completeness: looks fine, all the required sections are present.',
    'internalConsistency: no contradictions found across the artifacts.',
  ].join(' ')
  const content = [reasoning, 'FINAL_VERDICT', JSON.stringify(scores), 'END_VERDICT'].join('\n')
  return { choices: [{ message: { content }, finish_reason: finishReason }] }
}

const FULL_SCORES = {
  completeness: 3,
  internalConsistency: 3,
  ambiguity: 2,
  verifiability: 3,
  traceability: 2,
}

function config(fetchImpl: typeof fetch, overrides: Partial<JudgeConfig> = {}): JudgeConfig {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://judge.invalid',
    model: 'deepseek-v4-flash',
    samples: 3,
    fetchImpl,
    ...overrides,
  }
}

describe('judgeArtifacts', () => {
  test('returns null immediately for empty/whitespace artifact text without calling fetch', async () => {
    let called = false
    const fetchImpl = (async () => {
      called = true
      return jsonResponse(verdictReply(FULL_SCORES))
    }) as unknown as typeof fetch
    expect(await judgeArtifacts(config(fetchImpl), '   \n\t  ')).toBeNull()
    expect(called).toBe(false)
  })

  test('parses a normal chain-of-thought-then-verdict reply and averages k samples', async () => {
    const fetchImpl = (async () =>
      jsonResponse(verdictReply(FULL_SCORES))) as unknown as typeof fetch
    const score = await judgeArtifacts(config(fetchImpl), 'some artifact text')
    expect(score).not.toBeNull()
    expect(score?.completeness).toBe(3)
    expect(score?.ambiguity).toBe(2)
    expect(score?.samples).toBe(3)
    expect(score?.overall).toBeCloseTo((3 + 3 + 2 + 3 + 2) / 5, 5)
  })

  test('stray braces in the reasoning prose before the delimiter do not confuse parsing', async () => {
    const content = [
      'completeness: the {proposal} references {tasks.md} correctly.',
      'FINAL_VERDICT',
      JSON.stringify(FULL_SCORES),
      'END_VERDICT',
    ].join('\n')
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content }, finish_reason: 'stop' }],
      })) as unknown as typeof fetch
    const score = await judgeArtifacts(config(fetchImpl), 'artifact text')
    expect(score?.completeness).toBe(3)
  })

  test('finish_reason "length" (truncated before the verdict) is treated as a failed sample', async () => {
    const fetchImpl = (async () =>
      jsonResponse(verdictReply(FULL_SCORES, 'length'))) as unknown as typeof fetch
    // All k samples truncated -> no samples parsed -> null.
    expect(await judgeArtifacts(config(fetchImpl), 'artifact text')).toBeNull()
  })

  test('a bare-JSON reply with no delimiters still parses via the fallback', async () => {
    const fetchImpl = (async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(FULL_SCORES) }, finish_reason: 'stop' }],
      })) as unknown as typeof fetch
    const score = await judgeArtifacts(config(fetchImpl), 'artifact text')
    expect(score?.completeness).toBe(3)
  })

  test('clamps out-of-range axis scores into 0-3', async () => {
    const fetchImpl = (async () =>
      jsonResponse(
        verdictReply({ ...FULL_SCORES, completeness: 99, ambiguity: -5 }),
      )) as unknown as typeof fetch
    const score = await judgeArtifacts(config(fetchImpl), 'artifact text')
    expect(score?.completeness).toBe(3)
    expect(score?.ambiguity).toBe(0)
  })

  test('a non-ok HTTP response counts as a failed sample; null when every sample fails', async () => {
    const fetchImpl = (async () => jsonResponse({}, false)) as unknown as typeof fetch
    expect(await judgeArtifacts(config(fetchImpl), 'artifact text')).toBeNull()
  })

  test('a reply missing an axis key fails to parse as a sample', async () => {
    const partial: Record<string, number> = {
      completeness: 3,
      internalConsistency: 3,
      ambiguity: 2,
      verifiability: 3,
      // traceability intentionally omitted.
    }
    const fetchImpl = (async () => jsonResponse(verdictReply(partial))) as unknown as typeof fetch
    expect(await judgeArtifacts(config(fetchImpl), 'artifact text')).toBeNull()
  })

  test('some-failed-some-parsed averages only the samples that parsed', async () => {
    let call = 0
    const fetchImpl = (async () => {
      call += 1
      return call === 1
        ? jsonResponse(verdictReply(FULL_SCORES, 'length'))
        : jsonResponse(verdictReply(FULL_SCORES))
    }) as unknown as typeof fetch
    const score = await judgeArtifacts(config(fetchImpl, { samples: 3 }), 'artifact text')
    expect(score?.samples).toBe(2)
  })

  test('POSTs to <baseUrl>/chat/completions with bearer auth and temperature 0', async () => {
    let seenUrl = ''
    let seenAuth = ''
    let seenBody: Record<string, unknown> = {}
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      seenUrl = String(url)
      seenAuth = String((init?.headers as Record<string, string>)?.['authorization'])
      seenBody = JSON.parse(String(init?.body))
      return jsonResponse(verdictReply(FULL_SCORES))
    }) as unknown as typeof fetch
    await judgeArtifacts(config(fetchImpl, { samples: 1 }), 'artifact text')
    expect(seenUrl).toBe('https://judge.invalid/chat/completions')
    expect(seenAuth).toBe('Bearer test-key')
    expect(seenBody['temperature']).toBe(0)
    expect(seenBody['model']).toBe('deepseek-v4-flash')
  })
})

describe('collectArtifactText', () => {
  test('returns empty string when the change dir does not exist', async () => {
    const sandbox = makeSandbox()
    const text = await collectArtifactText(sandbox, 'openspec/changes/nope', {})
    expect(text).toBe('')
  })

  test('concatenates present artifact files in the fixed order, with headers', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/add-widget')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'tasks.md'), '- [x] done\n')
    writeFileSync(join(base, 'proposal.md'), '## Why\n\nreasons\n')
    const text = await collectArtifactText(sandbox, 'openspec/changes/add-widget', {})
    const proposalIdx = text.indexOf('### proposal.md')
    const tasksIdx = text.indexOf('### tasks.md')
    expect(proposalIdx).toBeGreaterThanOrEqual(0)
    expect(tasksIdx).toBeGreaterThan(proposalIdx)
  })

  test('includes specs/**/*.md files under a "specs/<rel>" header', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/add-widget')
    mkdirSync(join(base, 'specs/widgets'), { recursive: true })
    writeFileSync(join(base, 'specs/widgets/spec.md'), '#### Scenario: works\n')
    const text = await collectArtifactText(sandbox, 'openspec/changes/add-widget', {})
    expect(text).toContain('### specs/widgets/spec.md')
    expect(text).toContain('#### Scenario: works')
  })

  test('redacts sentinel values before returning', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/add-widget')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'proposal.md'), '## Why\n\nsee BENCH-SECRET-REF for context\n')
    const text = await collectArtifactText(sandbox, 'openspec/changes/add-widget', {
      'ref:x:secret': 'BENCH-SECRET-REF',
    })
    expect(text).not.toContain('BENCH-SECRET-REF')
    expect(text).toContain('[REDACTED:ref:x:secret]')
  })

  test('truncates after redaction when the joined text exceeds the char ceiling', async () => {
    const sandbox = makeSandbox()
    const base = join(sandbox, 'openspec/changes/add-widget')
    mkdirSync(base, { recursive: true })
    writeFileSync(join(base, 'proposal.md'), '## Why\n\n' + 'x'.repeat(25_000) + '\n')
    const text = await collectArtifactText(sandbox, 'openspec/changes/add-widget', {})
    expect(text.length).toBeLessThan(21_000)
    expect(text).toContain('[... truncated for judge input ...]')
  })
})
