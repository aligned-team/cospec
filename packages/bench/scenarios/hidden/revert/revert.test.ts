// Held-out hidden test suite for the `revert` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// The behavior genuinely changes here (shouting -> plain), so every case
// below is discriminating: it fails against the unmodified (still shouting)
// fixture and passes against a correct revert.

import { expect, test } from 'bun:test'

import { greet } from '../src/greet.ts'

test('greet returns the plain v1.0.0 template for a new name', () => {
  expect(greet('Bob')).toBe('Hello, Bob!')
})

test('greet does not uppercase the name', () => {
  expect(greet('ada')).toBe('Hello, ada!')
})

test('greet does not append "!!!"', () => {
  expect(greet('Ada').endsWith('!!!')).toBe(false)
})

test('greet handles an empty name without shouting punctuation', () => {
  expect(greet('')).toBe('Hello, !')
})

test('greet preserves mixed case and punctuation in the name verbatim', () => {
  expect(greet("O'Ada")).toBe("Hello, O'Ada!")
})
