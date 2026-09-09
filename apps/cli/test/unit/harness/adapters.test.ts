import { describe, expect, test } from 'bun:test'

import {
  BODY_DIALECTS,
  injectOpenCodeArgs,
  isBodyDialect,
  isHarnessName,
  renderCodexRules,
  serializeFrontmatter,
  transformBody,
} from '../../../src/harness/adapters.ts'

describe('isHarnessName', () => {
  test('accepts the four known harnesses and rejects others', () => {
    expect(isHarnessName('claude')).toBe(true)
    expect(isHarnessName('codex')).toBe(true)
    expect(isHarnessName('opencode')).toBe(true)
    expect(isHarnessName('agents')).toBe(true)
    expect(isHarnessName('cursor')).toBe(false)
    expect(isHarnessName('all')).toBe(false)
  })
})

describe('isBodyDialect', () => {
  test('accepts exactly the declared dialects', () => {
    for (const dialect of BODY_DIALECTS) expect(isBodyDialect(dialect)).toBe(true)
    expect(BODY_DIALECTS).toEqual(['canonical', 'shared', 'opencode'])
    expect(isBodyDialect('codex')).toBe(false)
    expect(isBodyDialect('')).toBe(false)
  })
})

describe('transformBody', () => {
  const body = 'Run /cospec:apply then /cospec:archive when done.'
  const skillById = new Map([
    ['apply', 'cospec-apply-change'],
    ['archive', 'cospec-archive-change'],
  ])

  test('canonical leaves the body verbatim', () => {
    expect(transformBody(body, 'canonical', skillById)).toBe(body)
  })

  test('opencode rewrites colon slashes to hyphen slashes', () => {
    expect(transformBody(body, 'opencode', skillById)).toBe(
      'Run /cospec-apply then /cospec-archive when done.',
    )
  })

  test('shared respells each reference as its skill name in both invocation syntaxes', () => {
    expect(transformBody(body, 'shared', skillById)).toBe(
      'Run $cospec-apply-change (Codex) or /cospec-apply-change (other agents) then ' +
        '$cospec-archive-change (Codex) or /cospec-archive-change (other agents) when done.',
    )
  })

  test('shared leaves an unknown id verbatim so doctor still flags it as dangling', () => {
    expect(transformBody('see /cospec:nope', 'shared', skillById)).toBe('see /cospec:nope')
  })

  test('shared uses the skill name, not the workflow id — they differ for most workflows', () => {
    expect(transformBody('/cospec:apply', 'shared', skillById)).not.toContain('/cospec-apply ')
    expect(transformBody('/cospec:apply', 'shared', skillById)).toContain('cospec-apply-change')
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
