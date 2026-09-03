import { describe, expect, test } from 'bun:test'

import {
  injectOpenCodeArgs,
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

describe('injectOpenCodeArgs', () => {
  test('inserts the placeholder as its own paragraph before the first section', () => {
    const body = 'Do the thing.\n\n## 1. Pick the change\n\nbody\n'
    expect(injectOpenCodeArgs(body)).toBe(
      'Do the thing.\n\n**Provided arguments**: $ARGUMENTS\n\n## 1. Pick the change\n\nbody\n',
    )
  })

  test('is a no-op when the body already names an argument placeholder', () => {
    const withArgs = 'Do it with $ARGUMENTS.\n\n## 1. Go\n'
    expect(injectOpenCodeArgs(withArgs)).toBe(withArgs)
    const withPositional = 'Do it with $1.\n\n## 1. Go\n'
    expect(injectOpenCodeArgs(withPositional)).toBe(withPositional)
  })

  test('appends at the end when the body has no section heading', () => {
    expect(injectOpenCodeArgs('Just a paragraph.\n')).toBe(
      'Just a paragraph.\n\n**Provided arguments**: $ARGUMENTS\n',
    )
  })

  test('preserves CRLF line endings', () => {
    const body = 'Do the thing.\r\n\r\n## 1. Go\r\n'
    expect(injectOpenCodeArgs(body)).toBe(
      'Do the thing.\r\n\r\n**Provided arguments**: $ARGUMENTS\r\n\r\n## 1. Go\r\n',
    )
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
