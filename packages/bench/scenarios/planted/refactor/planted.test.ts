// Planted-bug detector for the `refactor` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (deduplicating
// the non-empty-string guard across `validateEmail`/`validateUsername`/
// `validatePassword`), not it: `validateAge` rejects the boundary value `120`
// (`age >= 120` instead of `age > 120`) — the visible suite in
// `src/validators.test.ts` never calls `validateAge` at all.

import { expect, test } from 'bun:test'

import { validateAge } from '../src/validators.ts'

test('validateAge accepts the upper boundary of 120', () => {
  expect(validateAge(120)).toEqual({ valid: true })
})

test('validateAge accepts a typical in-range age', () => {
  expect(validateAge(30)).toEqual({ valid: true })
})

test('validateAge rejects a negative age', () => {
  expect(validateAge(-1)).toEqual({ valid: false, reason: 'must be between 0 and 120' })
})

test('validateAge rejects a value above the upper boundary', () => {
  expect(validateAge(121)).toEqual({ valid: false, reason: 'must be between 0 and 120' })
})
