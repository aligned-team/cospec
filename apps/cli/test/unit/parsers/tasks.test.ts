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

// openspec 1.13.1 widened its `TASK_LINE_PATTERN` to every CommonMark list
// marker. cospec's detector follows the marker set but not the leniency: a
// widened line is a loud `tasks/checkbox-grammar` ERROR, never a second
// accepted grammar, and never a silent drop.
describe('parseTasks — CommonMark list markers (openspec 1.13.1 parity)', () => {
  const WIDENED = ['*', '+', '1.', '1)', '9)', '999999999.']

  test('only the canonical `- ` marker yields a trackable item', () => {
    for (const marker of WIDENED) {
      for (const box of [' ', 'x', 'X']) {
        const p = parseTasks(`${marker} [${box}] 1.1 do it\n`)
        expect(p.items).toHaveLength(0)
        expect(p.malformed).toHaveLength(1)
        expect(p.malformed[0]!.corrected).toBe(`- [${box === ' ' ? ' ' : 'x'}] 1.1 do it`)
      }
    }
  })

  test('a widened marker with an unrecognised box is reported, never ignored', () => {
    for (const marker of ['-', '*', '+', '1.', '1)']) {
      for (const box of ['~', '', ' x', 'WIP']) {
        const p = parseTasks(`${marker} [${box}] 1.1 do it\n`)
        expect(p.items).toHaveLength(0)
        expect(p.malformed).toHaveLength(1)
      }
    }
  })

  test('a box holding an unrecognised marker never reads as done', () => {
    // `[ x]` and `[~]` are checkbox-like, so they are reported; neither can
    // reach `items`, so neither can satisfy the archive tasks gate.
    for (const raw of ['- [~] 1.1 do it', '- [ x] 1.1 do it', '- [] 1.1 do it']) {
      const p = parseTasks(`${raw}\n`)
      expect(p.items).toHaveLength(0)
      expect(p.malformed[0]!.raw).toBe(raw)
    }
  })

  test('link bullets are not checkbox lines (upstream `(?![([])` guard)', () => {
    for (const raw of [
      '- [Some doc](./doc.md)',
      '- [1](./one)',
      '+ [A](https://example.com)',
      '1. [ref][target]',
    ]) {
      const p = parseTasks(`${raw}\n`)
      expect(p.items).toHaveLength(0)
      expect(p.malformed).toHaveLength(0)
    }
  })

  test('a whitespace-only box keeps counting despite the link guard', () => {
    // Upstream's exception: `- [ ](./x)` could still hide open work, so the
    // guard may not drop it.
    const p = parseTasks('- [ ](./x)\n')
    expect(p.malformed).toHaveLength(1)
  })

  test('an ordered marker wider than nine digits is not a list marker', () => {
    const p = parseTasks('1234567890. [ ] 1.1 do it\n')
    expect(p.items).toHaveLength(0)
    expect(p.malformed).toHaveLength(0)
  })
})
