import { describe, expect, test } from 'bun:test'

import {
  benchmarkDataRows,
  checkedSurfaces,
  getSection,
  hasCommitSha,
  hasSection,
  parseProposal,
  parseSurfaces,
  revertSlugs,
} from '../../../src/core/proposal.ts'

describe('parseProposal', () => {
  test('extracts H2 sections case-insensitively with body text', () => {
    const p = parseProposal('## Why\n\nBecause.\n\n## What Changes\n\n- a\n')
    expect(hasSection(p, 'why')).toBe(true)
    expect(hasSection(p, 'What Changes')).toBe(true)
    expect(getSection(p, 'Why')!.body).toBe('Because.')
    expect(p.order).toEqual(['Why', 'What Changes'])
  })

  test('does not treat a fenced ## line as a section header', () => {
    const p = parseProposal('## Why\n\n```\n## Not a header\n```\n')
    expect(p.order).toEqual(['Why'])
  })
})

describe('benchmarkDataRows', () => {
  test('counts data rows excluding the header and separator', () => {
    const body = '| metric | before | after |\n| --- | --- | --- |\n| latency | 100ms | 50ms |'
    expect(benchmarkDataRows(body)).toBe(1)
  })

  test('a table with only a header has zero data rows', () => {
    expect(benchmarkDataRows('| metric | before | after |\n| --- | --- | --- |')).toBe(0)
  })
})

describe('checkedSurfaces', () => {
  test('reads checked flags from the ## Surfaces block', () => {
    const text = '## Surfaces\n\n- [x] deploy — runtime pin\n- [ ] interactive\n'
    expect([...checkedSurfaces(text)]).toEqual(['deploy'])
  })

  test('a checkbox inside a fenced code example is not a live flag', () => {
    const text = [
      '## Surfaces',
      '',
      '- [ ] deploy',
      '',
      '```',
      "- [x] integration — illustrative example, don't count this",
      '```',
    ].join('\n')
    // The real items are all unchecked; the fenced line must not leak through.
    expect(checkedSurfaces(text).has('integration')).toBe(false)
    expect(checkedSurfaces(text).size).toBe(0)
  })

  // `parseSurfaces` has no malformed-line path — an unmatched line is skipped
  // outright — so a narrow marker set made a `+ [x] deploy` flag silently
  // unread, taking its soft nudges (design/*, verification/*,
  // meta/surface-unmet) and its `proposal/surfaces-vocab` check with it.
  test('reads every CommonMark list marker', () => {
    for (const marker of ['-', '*', '+', '1.', '1)', '999999999.']) {
      expect([...checkedSurfaces(`## Surfaces\n\n${marker} [x] deploy — runtime pin\n`)]).toEqual([
        'deploy',
      ])
    }
  })

  test('an unchecked widened flag is read as declared-but-unchecked', () => {
    const items = parseSurfaces('## Surfaces\n\n+ [ ] deploy\n1. [x] interactive\n')
    expect(items.map((i) => [i.token, i.checked])).toEqual([
      ['deploy', false],
      ['interactive', true],
    ])
  })

  test('a widened flag carrying an unknown token still reaches the vocab rule', () => {
    expect(parseSurfaces('## Surfaces\n\n+ [x] telepathy\n')[0]!.token).toBe('telepathy')
  })
})

describe('revert citation helpers', () => {
  test('revertSlugs extracts backticked slugs', () => {
    expect(revertSlugs('Reverting `add-widget` and `add-thing`.')).toEqual([
      'add-widget',
      'add-thing',
    ])
  })

  test('hasCommitSha detects a 7–40 hex sha', () => {
    expect(hasCommitSha('reverts abc1234')).toBe(true)
    expect(hasCommitSha('no sha here')).toBe(false)
  })
})
