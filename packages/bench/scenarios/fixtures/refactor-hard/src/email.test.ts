import { expect, test } from 'bun:test'

import { validateEmail } from './email.ts'

test('validateEmail rejects an empty string', () => {
  expect(validateEmail('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateEmail rejects a string without an @', () => {
  expect(validateEmail('nope')).toEqual({ valid: false, reason: 'must contain an @' })
})

test('validateEmail accepts a well-formed address', () => {
  expect(validateEmail('a@b.com')).toEqual({ valid: true })
})
