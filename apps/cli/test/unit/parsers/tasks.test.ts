import { describe, expect, test } from 'bun:test'

import { groupsOutOfSequence, parseTasks } from '../../../src/core/tasks.ts'

describe('parseTasks', () => {
  test('parses groups and checkbox items with state', () => {
    const text = `## 1. Build

- [ ] 1.1 implement
- [x] 1.2 test
`
    const p = parseTasks(text)
    expect(p.groups).toHaveLength(1)
    expect(p.groups[0]!.num).toBe(1)
    expect(p.items).toHaveLength(2)
    expect(p.items[0]!.checked).toBe(false)
    expect(p.items[1]!.checked).toBe(true)
  })

  test('flags malformed checkbox lines with a corrected form', () => {
    for (const bad of ['-[ ] do it', '* [ ] do it', '- [X ] do it']) {
      const p = parseTasks(bad)
      expect(p.malformed).toHaveLength(1)
      expect(p.items).toHaveLength(0)
    }
  })

  test('ignores checkbox-like content inside fenced code', () => {
    const p = parseTasks('```\n- [ ] not a task\n```\n')
    expect(p.items).toHaveLength(0)
    expect(p.malformed).toHaveLength(0)
  })

  test('groupsOutOfSequence detects a gap', () => {
    expect(
      groupsOutOfSequence([
        { num: 1, title: 'a', line: 1 },
        { num: 3, title: 'b', line: 2 },
      ]),
    ).toBe(true)
    expect(
      groupsOutOfSequence([
        { num: 1, title: 'a', line: 1 },
        { num: 2, title: 'b', line: 2 },
      ]),
    ).toBe(false)
  })
})
