import { describe, expect, test } from 'bun:test'

import { renderTiming, summarizeTimings } from '../../src/complete-timing.ts'

describe('summarizeTimings', () => {
  test('median of an odd sample set is the middle value', () => {
    const t = summarizeTimings([30, 10, 20], 100)
    expect(t?.medianMs).toBe(20)
    expect(t?.minMs).toBe(10)
    expect(t?.maxMs).toBe(30)
    expect(t?.overBudget).toBe(false)
  })

  test('median of an even sample set averages the two middle values', () => {
    expect(summarizeTimings([10, 20, 30, 40], 100)?.medianMs).toBe(25)
  })

  test('p95 of 20 samples is the 19th smallest', () => {
    const samples = Array.from({ length: 20 }, (_, i) => i + 1)
    expect(summarizeTimings(samples, 100)?.p95Ms).toBe(19)
  })

  test('a median above the budget is an overrun', () => {
    const t = summarizeTimings([200, 210, 220], 150)
    expect(t?.overBudget).toBe(true)
  })

  test('non-finite samples are dropped and an empty set yields null', () => {
    expect(summarizeTimings([Number.NaN, 10], 100)?.runs).toBe(1)
    expect(summarizeTimings([], 100)).toBeNull()
  })
})

describe('renderTiming', () => {
  test('reports an overrun as advisory and names failed runs', () => {
    const t = summarizeTimings([200, 210, 220], 150, 2)
    if (t === null) throw new Error('expected a timing')
    const text = renderTiming(t, 'source entry')
    expect(text).toContain('OVER BUDGET by 60 ms (advisory)')
    expect(text).toContain('2 run(s) exited nonzero.')
  })

  test('reports a median inside the budget', () => {
    const t = summarizeTimings([50], 150)
    if (t === null) throw new Error('expected a timing')
    expect(renderTiming(t, 'source entry')).toContain('within budget')
  })
})
