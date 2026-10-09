// The receipt's view of the profile (workflow-profiles design D8): which line prints, and what
// the closing hint names when `propose` is not installed.

import { describe, expect, test } from 'bun:test'

import { receiptHintLines, selectWorkflows, workflowsLine } from '../../../src/commands/init.ts'

describe('selectWorkflows', () => {
  test('nothing set selects nothing and installs every workflow', () => {
    const sel = selectWorkflows(undefined, {})
    expect(sel.profile).toBeUndefined()
    expect(sel.installed).toBeUndefined()
    expect(sel.deliverySet).toBe(false)
    expect(sel.delivery).toBe('both')
    expect(workflowsLine(sel)).toBeUndefined()
  })

  test("the global file's profile is the config source", () => {
    const sel = selectWorkflows(undefined, { profile: 'core' })
    expect(sel.profile).toMatchObject({ name: 'core', source: 'config' })
    expect(sel.installed?.size).toBe(6)
    expect(workflowsLine(sel)).toBe('Workflows: 6 of 12 (profile core, set by the global config)')
  })

  test('the flag wins over the key, and reads workflows from the file', () => {
    const sel = selectWorkflows('custom', { profile: 'core', workflows: ['verify'] })
    expect(sel.profile).toEqual({ name: 'custom', source: 'flag', workflows: ['verify'] })
    expect(workflowsLine(sel)).toBe('Workflows: 1 of 12 (profile custom, set by --profile)')
  })

  test('an explicit custom with nothing selected says so', () => {
    const sel = selectWorkflows(undefined, { profile: 'custom' })
    expect(sel.installed?.size).toBe(0)
    expect(workflowsLine(sel)).toBe(
      'Workflows: 0 of 12 (profile custom, set by the global config; no workflows selected)',
    )
  })

  test('a delivery key alone names the delivery and counts every workflow', () => {
    const sel = selectWorkflows(undefined, { delivery: 'skills' })
    expect(sel.profile).toBeUndefined()
    expect(workflowsLine(sel)).toBe(
      'Workflows: 12 of 12 (delivery skills, set by the global config)',
    )
  })

  test('profile and delivery share one line', () => {
    const sel = selectWorkflows('core', { delivery: 'commands' })
    expect(workflowsLine(sel)).toBe(
      'Workflows: 6 of 12 (profile core, set by --profile; delivery commands, set by the global config)',
    )
  })
})

describe('receiptHintLines against the installed set', () => {
  const set = (...ids: string[]): ReadonlySet<string> => new Set(ids)

  test('propose installed, or no set at all: the two propose lines', () => {
    const lines = receiptHintLines(['claude'])
    expect(lines).toHaveLength(2)
    expect(receiptHintLines(['claude'], undefined, set('propose', 'apply'))).toEqual(lines)
  })

  test('no propose but new: one line naming new, spelled for the row', () => {
    expect(receiptHintLines(['claude'], undefined, set('new', 'apply'))).toEqual([
      'Try: /cospec:new "feat: <what you want to build>"',
    ])
    expect(receiptHintLines(['opencode'], undefined, set('new'))).toEqual([
      'Try: /cospec-new "feat: <what you want to build>"',
    ])
  })

  test('neither: the line points at config profile and is not respelled', () => {
    expect(receiptHintLines(['claude'], undefined, set('apply'))).toEqual([
      "Done. Run 'cospec config profile' to configure your workflows.",
    ])
    expect(receiptHintLines(['codex'], undefined, set())).toEqual([
      "Done. Run 'cospec config profile' to configure your workflows.",
    ])
  })
})
