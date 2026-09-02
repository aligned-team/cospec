// Held-out hidden test suite for the `fix` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Every case below exercises the TRUNCATING branch specifically (input longer
// than maxLength) — the branch the bug lives in — so every one of them fails
// against the unmodified off-by-one implementation
// (`input.slice(0, maxLength + 1) + '…'`) and passes against a correct one
// (`input.slice(0, maxLength) + '…'`). Boundary cases where input already fits
// (e.g. 'hi', 5 -> 'hi') are deliberately NOT used here — that branch has no
// bug and would pass on the unmodified fixture too, which would not be a
// useful escaped-defect signal.

import { expect, test } from 'bun:test'

import { truncate } from '../src/strings.ts'

test('truncates to exactly maxLength characters plus the ellipsis', () => {
  expect(truncate('abcdefgh', 3)).toBe('abc…')
})

test('maxLength 0 on a nonempty string yields just the ellipsis', () => {
  expect(truncate('hello world', 0)).toBe('…')
})

test('maxLength 1 keeps exactly one character before the ellipsis', () => {
  expect(truncate('longer text here', 1)).toBe('l…')
})

test('input exactly one character longer than maxLength still truncates that one character away', () => {
  expect(truncate('abcdef', 5)).toBe('abcde…')
})

test('the truncated portion (excluding the ellipsis) is always exactly maxLength characters long', () => {
  const result = truncate('abcdefghij', 4)
  expect(result.length).toBe(4 + 1) // maxLength chars + the single ellipsis character
})
