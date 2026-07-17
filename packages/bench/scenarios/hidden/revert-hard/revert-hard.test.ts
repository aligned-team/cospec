// Held-out hidden test suite for the `revert-hard` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// The behavior genuinely changes for all three functions (shouting -> plain),
// so every case below is discriminating: it fails against the unmodified
// (still-shouting) fixture and passes against a correct revert of all three.

import { expect, test } from 'bun:test'

import { formatPrice } from '../src/currency.ts'
import { formatDisplayName } from '../src/format.ts'
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

test('formatDisplayName preserves the original casing of both names', () => {
  expect(formatDisplayName('jane', 'doe')).toBe('jane doe')
})

test('formatDisplayName does not append a trailing "!"', () => {
  expect(formatDisplayName('Jane', 'Doe').endsWith('!')).toBe(false)
})

test('formatDisplayName joins with a single space and nothing else', () => {
  expect(formatDisplayName('A', 'B')).toBe('A B')
})

test('formatPrice does not append trailing "!!"', () => {
  expect(formatPrice(1234).endsWith('!!')).toBe(false)
})

test('formatPrice pads a whole-dollar amount to two decimal places', () => {
  expect(formatPrice(100)).toBe('$1.00')
})

test('formatPrice handles zero cents', () => {
  expect(formatPrice(0)).toBe('$0.00')
})
