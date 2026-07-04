import { describe, expect, test } from 'bun:test'

import {
  benchmarkDataRows,
  getSection,
  hasCommitSha,
  hasSection,
  parseProposal,
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
