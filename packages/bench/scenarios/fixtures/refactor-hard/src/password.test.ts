import { expect, test } from 'bun:test'

import { validatePassword } from './password.ts'

test('validatePassword rejects an empty string', () => {
  expect(validatePassword('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validatePassword rejects a too-short password', () => {
  expect(validatePassword('short')).toEqual({
    valid: false,
    reason: 'must be at least 8 characters',
  })
})

test('validatePassword accepts a long-enough password', () => {
  expect(validatePassword('longenough')).toEqual({ valid: true })
})
