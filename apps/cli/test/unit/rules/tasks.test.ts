import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { tasksRules } from '../../../src/core/rules/tasks.ts'
import { parseTasks, TASK_NUM_RE } from '../../../src/core/tasks.ts'
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

/**
 * Items before any group, under a numbered group, under a fenced group, under
 * an unnumbered `## Notes`, and under a zero-padded group — plus the malformed
 * lines the grammar rule reads.
 */
const GROUPED = `# Tasks

- [ ] 0.1 before any group

## 1. Build

- [ ] 1.1 do it
- [x] 1.2.3 deep
-[ ] 1.3 malformed
+ [ ] 1.4 widened

\`\`\`md
## 9. Fenced group
- [ ] 9.1 fenced
\`\`\`

## Notes

- [ ] 2.1 stray under notes

## 02. Padded

- [X] 02.1 padded
`

describe('parseTasks item groups', () => {
  test('each item records its enclosing numbered group as written', () => {
    expect(parseTasks(GROUPED).items.map((i) => [i.line, i.group])).toEqual([
      [3, undefined],
      [7, '1'],
      [8, '1'],
      [19, undefined],
      [23, '02'],
    ])
  })

  // Captured from the parser before item groups existed.
  test('groups, items and malformed lines are otherwise unchanged', () => {
    const parsed = parseTasks(GROUPED)
    expect(parsed.items.map(({ group: _group, ...item }) => item)).toEqual([
      { checked: false, text: '0.1 before any group', line: 3 },
      { checked: false, text: '1.1 do it', line: 7 },
      { checked: true, text: '1.2.3 deep', line: 8 },
      { checked: false, text: '2.1 stray under notes', line: 19 },
      { checked: true, text: '02.1 padded', line: 23 },
    ])
    expect(parsed.malformed).toEqual([
      { raw: '-[ ] 1.3 malformed', line: 9, corrected: '- [ ] 1.3 malformed' },
      { raw: '+ [ ] 1.4 widened', line: 10, corrected: '- [ ] 1.4 widened' },
    ])
    expect(parsed.groups).toEqual([
      { num: 1, title: 'Build', line: 5 },
      { num: 2, title: 'Padded', line: 21 },
    ])
  })

  test('a bare `## 1.` heading opens a group', () => {
    expect(parseTasks('## 1.\n\n- [ ] 1.1 x\n').items[0]?.group).toBe('1')
  })

  test('TASK_NUM_RE reads the binary task-id shape', () => {
    const id = (text: string) => TASK_NUM_RE.exec(text)?.[1]
    expect(id('1.2 x')).toBe('1.2')
    expect(id('1.2.3 x')).toBe('1.2.3')
    expect(id('1.3a x')).toBe('1.3a')
    expect(id('01.1 x')).toBe('01.1')
    expect(id('1.2')).toBe('1.2')
    expect(id('1 x')).toBeUndefined()
    expect(id('1.2: x')).toBeUndefined()
    expect(id('v1.2 x')).toBeUndefined()
  })
})

describe('tasks/id-mismatch and tasks/id-duplicate', () => {
  const idIssues = (tasksText: string) =>
    tasksRules(makeChange({ tasksText }))
      .filter((i) => i.rule.startsWith('tasks/id-'))
      .map((i) => ({
        level: i.level,
        rule: i.rule,
        line: i.line,
        message: i.message,
        hint: i.hint,
      }))

  test('a task filed under the wrong group, and a repeated id', () => {
    expect(idIssues('## 1. Build\n\n- [ ] 1.1 a\n- [ ] 2.1 b\n- [ ] 1.1 c\n')).toEqual([
      {
        level: 'WARNING',
        rule: 'tasks/id-mismatch',
        line: 4,
        message: 'task "2.1" is under group 1, but its leading number points to group 2',
        hint: 'move it to group 2 or renumber it',
      },
      {
        level: 'WARNING',
        rule: 'tasks/id-duplicate',
        line: 5,
        message: 'task id "1.1" is duplicated; it was first declared on line 3',
        hint: undefined,
      },
    ])
  })

  test('deep ids are distinct, and a lettered id is an id', () => {
    expect(idIssues('## 1. Build\n\n- [ ] 1.2.3 a\n- [ ] 1.2.4 b\n- [ ] 1.3a c\n')).toEqual([])
    expect(idIssues('## 1. Build\n\n- [ ] 2.3a a\n').map((i) => i.message)).toEqual([
      'task "2.3a" is under group 1, but its leading number points to group 2',
    ])
  })

  test('a zero-padded id matches its group', () => {
    expect(idIssues('## 1. Build\n\n- [ ] 01.1 a\n')).toEqual([])
    expect(idIssues('## 01. Build\n\n- [ ] 1.1 a\n')).toEqual([])
  })

  test('a task under an unnumbered section after a group is not read', () => {
    expect(
      idIssues('## 1. Build\n\n- [ ] 1.1 a\n\n## Notes\n\n- [ ] 2.1 b\n- [ ] 1.1 c\n'),
    ).toEqual([])
  })

  test('a file with no numbered group is skipped', () => {
    expect(idIssues('## Build\n\n- [ ] 2.1 a\n- [ ] 2.1 b\n')).toEqual([])
  })

  test('fenced lines stay unread', () => {
    expect(
      idIssues('## 1. Build\n\n- [ ] 1.1 a\n\n```md\n- [ ] 1.1 a\n- [ ] 2.1 b\n```\n'),
    ).toEqual([])
  })

  test('the rule reads the exported TASK_NUM_RE', () => {
    const source = readFileSync(join(import.meta.dir, '../../../src/core/rules/tasks.ts'), 'utf8')
    expect(source).toMatch(/import \{[^}]*\bTASK_NUM_RE\b[^}]*\} from '\.\.\/tasks\.ts'/)
    expect(TASK_NUM_RE.source).toBe('^(\\d+(?:\\.\\d+)+(?:[A-Za-z]+)?)(?=\\s|$)')
  })
})
