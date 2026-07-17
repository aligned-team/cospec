import { expect, test } from 'bun:test'

import { formatPrice } from './currency.ts'

test('formatPrice returns the plain v1.0.0 format', () => {
  expect(formatPrice(1234)).toBe('$12.34')
})
