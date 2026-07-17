// Planted-bug detector for the `refactor-hard` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (deduplicating
// the guard across email.ts/username.ts/password.ts), not it: `validateAge`
// in src/age.ts rejects the boundary value 120 (`age >= 120` instead of
// `age > 120`) — the visible suite never calls `validateAge` at all.

import { expect, test } from 'bun:test'

import { validateAge } from '../src/age.ts'

test('validateAge accepts the boundary value 120', () => {
  expect(validateAge(120)).toEqual({ valid: true })
})

test('validateAge rejects 121', () => {
  expect(validateAge(121)).toEqual({ valid: false, reason: 'must be between 0 and 120' })
})
