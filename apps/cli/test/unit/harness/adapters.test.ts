import { describe, expect, test } from 'bun:test'

import {
  isHarnessName,
  renderCodexRules,
  serializeFrontmatter,
  transformBodyForHarness,
} from '../../../src/harness/adapters.ts'

describe('isHarnessName', () => {
  test('accepts the three known harnesses and rejects others', () => {
    expect(isHarnessName('claude')).toBe(true)
    expect(isHarnessName('codex')).toBe(true)
    expect(isHarnessName('opencode')).toBe(true)
    expect(isHarnessName('cursor')).toBe(false)
    expect(isHarnessName('all')).toBe(false)
  })
})

describe('transformBodyForHarness', () => {
  const body = 'Run /cospec:apply then /cospec:archive when done.'
  test('opencode rewrites colon slashes to hyphen slashes', () => {
    expect(transformBodyForHarness(body, 'opencode')).toBe(
      'Run /cospec-apply then /cospec-archive when done.',
    )
  })
  test('claude and codex are unchanged', () => {
    expect(transformBodyForHarness(body, 'claude')).toBe(body)
    expect(transformBodyForHarness(body, 'codex')).toBe(body)
  })
})

describe('renderCodexRules', () => {
  const rules = renderCodexRules('cospec@test')
  test('pre-approves the read-only + gate set', () => {
    expect(rules).toContain('prefix_rule(pattern=["cospec", "validate"], decision="allow")')
    expect(rules).toContain('prefix_rule(pattern=["cospec", "apply"], decision="allow")')
    expect(rules).toContain(
      'prefix_rule(pattern=["cospec", "sync-blockers", "--check"], decision="allow")',
    )
  })
  test('never pre-approves archive', () => {
    expect(rules).not.toContain('"archive"')
  })
  test('is snapshot-stable', () => {
    expect(rules).toMatchSnapshot()
  })
})

describe('serializeFrontmatter', () => {
  test('emits a nested metadata block deterministically', () => {
    const out = serializeFrontmatter({
      name: 'cospec-apply-change',
      description: 'x',
      metadata: { author: 'cospec', generatedBy: 'cospec@test', contentHash: 'sha256:abc' },
    })
    expect(out).toMatchSnapshot()
  })
})
