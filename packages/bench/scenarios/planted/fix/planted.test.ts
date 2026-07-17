// Planted-bug detector for the `fix` scenario — see
// `scenarios/planted/README.md`. Adjacent to the task subject (`truncate`),
// not it: `capitalize` drops the string's SECOND character (`input.slice(2)`
// instead of `input.slice(1)`) — an off-by-one the visible suite in
// `src/strings.test.ts` never exercises since it only ever calls `truncate`.

import { expect, test } from 'bun:test'

import { capitalize } from '../src/strings.ts'

test('capitalize uppercases the first letter and keeps the rest of the string', () => {
  expect(capitalize('hello')).toBe('Hello')
})

test('capitalize on a two-character string', () => {
  expect(capitalize('ab')).toBe('Ab')
})

test('capitalize on an empty string returns it unchanged', () => {
  expect(capitalize('')).toBe('')
})
