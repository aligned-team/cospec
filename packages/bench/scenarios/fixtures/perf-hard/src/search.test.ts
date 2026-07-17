import { expect, test } from 'bun:test'

import { searchBatch } from './search.ts'
import type { Doc } from './search.ts'

function docs(): Doc[] {
  return [
    { id: 'a', text: 'the quick brown fox' },
    { id: 'b', text: 'the lazy dog sleeps' },
    { id: 'c', text: 'a quick nap for the dog' },
  ]
}

test('searchBatch finds docs containing the exact word for each query', () => {
  const result = searchBatch(docs(), ['quick', 'dog'])
  expect(result['quick']).toEqual(['a', 'c'])
  expect(result['dog']).toEqual(['b', 'c'])
})

test('searchBatch does not match a substring that is not a whole word', () => {
  const result = searchBatch(docs(), ['qui'])
  expect(result['qui']).toEqual([])
})

test('searchBatch is case-insensitive', () => {
  const result = searchBatch(docs(), ['QUICK'])
  expect(result['QUICK']).toEqual(['a', 'c'])
})
