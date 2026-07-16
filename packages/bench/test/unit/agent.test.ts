import { describe, expect, test } from 'bun:test'

import { WORKFLOW_SYSTEM_PROMPT } from '../../src/agent.ts'

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
