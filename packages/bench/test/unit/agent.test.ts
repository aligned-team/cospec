import { afterEach, describe, expect, test } from 'bun:test'

import { buildAgentEnv, WORKFLOW_SYSTEM_PROMPT } from '../../src/agent.ts'

// This constant is the fix for the harness measuring nothing: without it,
// neither arm has any reason to use its spec-driven workflow at all. These
// checks guard the two properties that make the append fair rather than
// biased: it must not name either tool, and it must not be scenario-specific.
describe('WORKFLOW_SYSTEM_PROMPT', () => {
  test('is tool-neutral: names neither cospec nor openspec', () => {
    const lower = WORKFLOW_SYSTEM_PROMPT.toLowerCase()
    expect(lower).not.toContain('cospec')
    expect(lower).not.toContain('openspec')
  })

  test('points at the shared skills location and the propose/author/validate/implement arc', () => {
    expect(WORKFLOW_SYSTEM_PROMPT).toContain('.claude/skills')
    expect(WORKFLOW_SYSTEM_PROMPT.toLowerCase()).toContain('validate')
  })

  test('is non-empty and short (a nudge, not a second task prompt)', () => {
    expect(WORKFLOW_SYSTEM_PROMPT.length).toBeGreaterThan(0)
    expect(WORKFLOW_SYSTEM_PROMPT.length).toBeLessThan(400)
  })
})

// Regression coverage for the harness's account-routing mechanism: the spawned
// SDK query() must inherit the parent process env — in particular
// CLAUDE_CONFIG_DIR, this repo's multi-account switch — so
// `CLAUDE_CONFIG_DIR=... mise run bench -- ...` actually routes agent auth to
// the chosen account. See agent.ts's buildAgentEnv doc comment.
describe('buildAgentEnv', () => {
  const ORIGINAL_CONFIG_DIR = process.env['CLAUDE_CONFIG_DIR']

  afterEach(() => {
    if (ORIGINAL_CONFIG_DIR === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = ORIGINAL_CONFIG_DIR
  })

  test('forwards CLAUDE_CONFIG_DIR from the parent process env', () => {
    process.env['CLAUDE_CONFIG_DIR'] = '/Users/imogen/.claude-accounts/aligned'
    const env = buildAgentEnv('high')
    expect(env['CLAUDE_CONFIG_DIR']).toBe('/Users/imogen/.claude-accounts/aligned')
  })

  test('overlays CLAUDE_CODE_EFFORT_LEVEL without dropping other parent env vars', () => {
    process.env['CLAUDE_CONFIG_DIR'] = '/Users/imogen/.claude-accounts/rg'
    const env = buildAgentEnv('medium')
    expect(env['CLAUDE_CODE_EFFORT_LEVEL']).toBe('medium')
    expect(env['CLAUDE_CONFIG_DIR']).toBe('/Users/imogen/.claude-accounts/rg')
    // A pre-existing, unrelated parent env var (PATH is always present) survives too.
    expect(env['PATH']).toBe(process.env['PATH'])
  })

  test('CLAUDE_CODE_EFFORT_LEVEL always wins even if the parent process happened to set it', () => {
    process.env['CLAUDE_CODE_EFFORT_LEVEL'] = 'stale-value-from-parent-shell'
    const env = buildAgentEnv('high')
    expect(env['CLAUDE_CODE_EFFORT_LEVEL']).toBe('high')
    delete process.env['CLAUDE_CODE_EFFORT_LEVEL']
  })
})
