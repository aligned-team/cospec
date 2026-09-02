import { expect, test } from 'bun:test'

import { formatDisplayName } from './format.ts'

test('formatDisplayName returns the plain v1.0.0 format', () => {
  expect(formatDisplayName('Jane', 'Doe')).toBe('Jane Doe')
})
