import { expect, test } from 'bun:test'

import { greet } from './greet.ts'

test('greet returns the plain v1.0.0 greeting', () => {
  expect(greet('Ada')).toBe('Hello, Ada!')
})
