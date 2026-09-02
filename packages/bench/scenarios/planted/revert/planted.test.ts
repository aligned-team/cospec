// Planted-bug detector for the `revert` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (`greet`), not
// it: `farewell` uses a wrong boundary comparison (`name.length > 1` instead
// of `name.length > 0`), so a single-character name incorrectly falls to the
// generic "stranger" branch — the visible suite in `src/greet.test.ts` never
// calls `farewell` at all.

import { expect, test } from 'bun:test'

import { farewell } from '../src/greet.ts'

test('farewell greets a single-character name by name, not as a stranger', () => {
  expect(farewell('A')).toBe('Goodbye, A!')
})

test('farewell greets a normal name', () => {
  expect(farewell('Ada')).toBe('Goodbye, Ada!')
})

test('farewell falls back to "stranger" for an empty name', () => {
  expect(farewell('')).toBe('Goodbye, stranger!')
})
