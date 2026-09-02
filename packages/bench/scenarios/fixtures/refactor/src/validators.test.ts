import { expect, test } from 'bun:test'

import { validateEmail, validatePassword, validateUsername } from './validators.ts'

test('validateEmail rejects an empty string', () => {
  expect(validateEmail('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateEmail rejects a string without an @', () => {
  expect(validateEmail('nope')).toEqual({ valid: false, reason: 'must contain an @' })
})

test('validateEmail accepts a well-formed address', () => {
  expect(validateEmail('a@b.com')).toEqual({ valid: true })
})

test('validateUsername rejects an empty string', () => {
  expect(validateUsername('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateUsername rejects a too-short username', () => {
  expect(validateUsername('ab')).toEqual({
    valid: false,
    reason: 'must be at least 3 characters',
  })
})

test('validateUsername accepts a long-enough username', () => {
  expect(validateUsername('abc')).toEqual({ valid: true })
})

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
