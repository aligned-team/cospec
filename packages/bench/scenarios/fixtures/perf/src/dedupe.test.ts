import { expect, test } from 'bun:test'

import { dedupe } from './dedupe.ts'

test('dedupe removes repeated values, preserving first-occurrence order', () => {
  expect(dedupe([1, 2, 1, 3, 2, 4])).toEqual([1, 2, 3, 4])
})

test('dedupe returns an empty array for an empty input', () => {
  expect(dedupe([])).toEqual([])
})
