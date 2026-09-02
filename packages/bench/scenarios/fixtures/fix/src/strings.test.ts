import { expect, test } from 'bun:test'

import { truncate } from './strings.ts'

test('truncate returns the input unchanged when it fits', () => {
  expect(truncate('hi', 5)).toBe('hi')
})

test('truncate cuts to exactly maxLength characters plus an ellipsis', () => {
  expect(truncate('hello world', 5)).toBe('hello…')
})
