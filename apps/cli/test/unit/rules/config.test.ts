// `config/rules-item-type` over `openspec/config.yaml`'s `rules:` map (1.14.x): read as
// YAML, so it has its own fixtures rather than a `rules/views.ts` registration.

import { describe, expect, test } from 'bun:test'

import { parse as parseYaml } from 'yaml'

import { configRulesIssues, quotedRuleItem } from '../../../src/core/rules/config.ts'

const PATH = 'openspec/config.yaml'
const issuesOf = (yaml: string) => configRulesIssues(parseYaml(yaml), PATH)

describe('config/rules-item-type', () => {
  test('an unquoted `- Use: tabs` names the index, the mapping, and the quoted form', () => {
    const issues = issuesOf('rules:\n  proposal:\n    - Keep it short\n    - Use: tabs\n')
    expect(issues).toEqual([
      {
        level: 'WARNING',
        rule: 'config/rules-item-type',
        path: PATH,
        message:
          "rules.proposal[1] parsed as a mapping, not a string, so every rule for 'proposal' is ignored",
        hint: 'an unquoted ": " makes YAML read the item as a key/value pair; quote the whole item: - "Use: tabs"',
      },
    ])
  })

  test('every offending item is its own finding, each with its shape', () => {
    const issues = issuesOf('rules:\n  tasks:\n    - 42\n    - ok\n    - [a, b]\n    - null\n')
    expect(issues.map((i) => i.message.split(',')[0])).toEqual([
      'rules.tasks[0] parsed as a number',
      'rules.tasks[2] parsed as a nested list',
      'rules.tasks[3] parsed as null',
    ])
    expect(issues[0]!.hint).toBe('quote the item so YAML keeps it a string: - "42"')
  })

  test('string items, a missing rules map and a non-list artifact entry raise nothing here', () => {
    expect(issuesOf('rules:\n  proposal:\n    - "Use: tabs"\n')).toEqual([])
    expect(issuesOf('schema: feat\n')).toEqual([])
    expect(issuesOf('rules:\n  proposal: just a string\n')).toEqual([])
  })

  test('the quoted form is only offered when the shape says what was written', () => {
    expect(quotedRuleItem({ Use: 'tabs' })).toBe('- "Use: tabs"')
    expect(quotedRuleItem({ Note: null })).toBe('- "Note:"')
    expect(quotedRuleItem({ a: 1, b: 2 })).toBeUndefined()
    expect(quotedRuleItem({ a: { b: 1 } })).toBeUndefined()
    expect(quotedRuleItem(true)).toBe('- "true"')
  })
})
