import { expect, test } from 'bun:test'

import { groupBy } from './groupBy.ts'

test('groupBy groups items by key, preserving first-seen group order', () => {
  const items = [1, 2, 3, 4, 5, 6]
  const groups = groupBy(items, (n) => (n % 2 === 0 ? 'even' : 'odd'))
  expect([...groups.keys()]).toEqual(['odd', 'even'])
  expect(groups.get('odd')).toEqual([1, 3, 5])
  expect(groups.get('even')).toEqual([2, 4, 6])
})

test('groupBy returns an empty map for an empty input', () => {
  expect(groupBy([], (n: number) => String(n)).size).toBe(0)
})
