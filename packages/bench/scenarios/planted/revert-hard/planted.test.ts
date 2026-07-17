// Planted-bug detector for the `revert-hard` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject
// (`formatDisplayName`, in the same file), not it: `initials` drops the
// separating periods (`'JD'` instead of `'J.D.'`) — the visible suite never
// calls `initials` at all.

import { expect, test } from 'bun:test'

import { initials } from '../src/format.ts'

test('initials joins both first letters with separating periods', () => {
  expect(initials('Jane', 'Doe')).toBe('J.D.')
})

test('initials handles a single-letter name', () => {
  expect(initials('A', 'B')).toBe('A.B.')
})
