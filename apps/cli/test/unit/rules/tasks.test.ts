import { describe, expect, test } from 'bun:test'

import { tasksRules } from '../../../src/core/rules/tasks.ts'
import { makeChange, rules } from './helpers.ts'

describe('tasksRules', () => {
  test('a well-formed tasks.md is clean', () => {
    const change = makeChange({ tasksText: '## 1. Build\n\n- [ ] 1.1 do it\n- [x] 1.2 done' })
    expect(tasksRules(change)).toHaveLength(0)
  })

  test('tasks/has-tasks when there are no trackable items', () => {
    const change = makeChange({ tasksText: '## 1. Build\n\nprose only\n' })
    expect(rules(tasksRules(change))).toContain('tasks/has-tasks')
  })

  test('tasks/checkbox-grammar on a malformed checkbox with a corrected hint', () => {
    const change = makeChange({ tasksText: '## 1. Build\n\n-[ ] do it\n' })
    const issue = tasksRules(change).find((i) => i.rule === 'tasks/checkbox-grammar')
    expect(issue?.hint).toContain('- [ ] do it')
  })

  test('tasks/group-numbering warns on non-sequential groups', () => {
    const change = makeChange({ tasksText: '## 1. A\n\n- [ ] 1.1 x\n\n## 3. B\n\n- [ ] 3.1 y' })
    expect(rules(tasksRules(change))).toContain('tasks/group-numbering')
  })

  test('no tasks.md → no issues', () => {
    expect(tasksRules(makeChange())).toHaveLength(0)
  })

  // openspec 1.13.1 counts `*`, `+`, `1.` and `1)` list markers; cospec's
  // detector now sees them too, but as grammar violations rather than tasks.
  test('tasks/checkbox-grammar on every widened list marker', () => {
    for (const marker of ['*', '+', '1.', '1)']) {
      const change = makeChange({ tasksText: `## 1. Build\n\n${marker} [ ] 1.1 do it\n` })
      const issue = tasksRules(change).find((i) => i.rule === 'tasks/checkbox-grammar')
      expect(issue).toBeDefined()
      expect(issue?.hint).toBe('expected: - [ ] 1.1 do it')
    }
  })

  test('a tasks.md holding only widened markers also trips tasks/has-tasks', () => {
    const change = makeChange({ tasksText: '## 1. Build\n\n+ [x] 1.1 done\n' })
    expect(rules(tasksRules(change))).toEqual(['tasks/checkbox-grammar', 'tasks/has-tasks'])
  })
})
