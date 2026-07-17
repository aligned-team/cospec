import { expect, test } from 'bun:test'

import { validateUsername } from './username.ts'

test('validateUsername rejects an empty string', () => {
  expect(validateUsername('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateUsername rejects a too-short username', () => {
  expect(validateUsername('ab')).toEqual({ valid: false, reason: 'must be at least 3 characters' })
})

test('validateUsername accepts a long-enough username', () => {
  expect(validateUsername('abc')).toEqual({ valid: true })
})
