// The receipt's view of the profile (workflow-profiles design D8): which line prints, and what
// the closing hint names when `propose` is not installed.

import { describe, expect, test } from 'bun:test'

import { receiptHintLines } from '../../../src/commands/init.ts'
import { selectWorkflows, workflowsLine } from '../../../src/harness/workflow-set.ts'

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

  test('neither: the raw gated command, then the pointer at config profile, not respelled', () => {
    const expected = [
      'Try: cospec new feat <slug>',
      "Done. Run 'cospec config profile' to configure your workflows.",
    ]
    expect(receiptHintLines(['claude'], undefined, set('apply'))).toEqual(expected)
    expect(receiptHintLines(['codex'], undefined, set())).toEqual(expected)
    expect(receiptHintLines(['opencode'], undefined, set('archive'))).toEqual(expected)
  })
})

describe('receiptHintLines under delivery', () => {
  const HINT = 'Try: /cospec:propose "feat: <what you want to build>"'

  test('both is what the hint has always said, so passing it changes nothing', () => {
    for (const h of ['claude', 'opencode', 'codex', 'agents']) {
      expect(receiptHintLines([h], undefined, undefined, 'both')).toEqual(receiptHintLines([h]))
    }
  })

  test('skills: an adapter-backed row names its skill, not a command it did not get', () => {
    expect(receiptHintLines(['claude'], undefined, undefined, 'skills')[0]).toBe(
      'Try: /cospec-propose "feat: <what you want to build>"',
    )
    expect(receiptHintLines(['opencode'], undefined, undefined, 'skills')[0]).toBe(
      'Try: /cospec-propose "feat: <what you want to build>"',
    )
    expect(receiptHintLines(['claude'], undefined, undefined, 'skills').join('\n')).not.toContain(
      '/cospec:',
    )
  })

  test('skills: a shared-root row keeps its dual spelling', () => {
    expect(receiptHintLines(['codex'], undefined, undefined, 'skills')[0]).toBe(
      'Try: $cospec-propose (Codex) or /cospec-propose (other agents) "feat: <what you want to build>"',
    )
  })

  test('commands: a row with commands names its command', () => {
    expect(receiptHintLines(['claude'], undefined, undefined, 'commands')[0]).toBe(HINT)
    expect(receiptHintLines(['opencode'], undefined, undefined, 'commands')[0]).toBe(
      'Try: /cospec-propose "feat: <what you want to build>"',
    )
  })

  test('commands: a skills-only row generates nothing, so no hint prints', () => {
    expect(receiptHintLines(['agents'], undefined, undefined, 'commands')).toEqual([])
    expect(receiptHintLines(['agents', 'hermes'], undefined, undefined, 'commands')).toEqual([])
  })

  test('commands: Codex still gets skills, so its hint stays', () => {
    expect(receiptHintLines(['codex'], undefined, undefined, 'commands')).toHaveLength(2)
  })

  test('the first row that generates something spells the hint', () => {
    expect(receiptHintLines(['agents', 'claude'], undefined, undefined, 'commands')[0]).toBe(HINT)
  })

  test('no harness selected keeps the canonical hint whatever the delivery', () => {
    expect(receiptHintLines([], undefined, undefined, 'commands')[0]).toBe(HINT)
  })

  test('the raw-command fallback prints under any delivery that generates something', () => {
    expect(receiptHintLines(['claude'], undefined, new Set(['apply']), 'skills')[0]).toBe(
      'Try: cospec new feat <slug>',
    )
    expect(receiptHintLines(['agents'], undefined, new Set(['apply']), 'commands')).toEqual([])
  })
})
