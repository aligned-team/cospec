// Held-out hidden test suite for the `refactor-hard` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention
// and its "Design note" on behavior-preserving scenario types. The first
// case is the DISCRIMINATING structural check (fails on the unmodified
// fixture — the literal guard is independently duplicated in all 3 files —
// and passes once de-duplicated, mirroring the scenario's own `completed`
// predicate). The rest are non-discriminating regression guards: the
// validators' observable behavior must be identical before and after the
// refactor.

import { expect, test } from 'bun:test'

import { validateEmail } from '../src/email.ts'
import { validatePassword } from '../src/password.ts'
import { validateUsername } from '../src/username.ts'

const DUPLICATED_LITERAL = 'must be a non-empty string'

test('the non-empty-string guard is no longer independently duplicated across all 3 files', async () => {
  const email = await Bun.file(new URL('../src/email.ts', import.meta.url)).text()
  const username = await Bun.file(new URL('../src/username.ts', import.meta.url)).text()
  const password = await Bun.file(new URL('../src/password.ts', import.meta.url)).text()
  const occurrences = [email, username, password]
    .map((f) => f.split(DUPLICATED_LITERAL).length - 1)
    .reduce((a, b) => a + b, 0)
  expect(occurrences).toBeLessThan(3)
})

test('validateEmail still rejects an empty string with the same reason', () => {
  expect(validateEmail('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateEmail still rejects a whitespace-only string', () => {
  expect(validateEmail('   ')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})

test('validateEmail still accepts a well-formed address', () => {
  expect(validateEmail('a@b.com')).toEqual({ valid: true })
})

test('validateUsername still rejects a username exactly at the boundary below minimum', () => {
  expect(validateUsername('ab')).toEqual({ valid: false, reason: 'must be at least 3 characters' })
})

test('validateUsername still accepts a username exactly at the minimum length', () => {
  expect(validateUsername('abc')).toEqual({ valid: true })
})

test('validatePassword still rejects a password exactly at the boundary below minimum', () => {
  expect(validatePassword('1234567')).toEqual({
    valid: false,
    reason: 'must be at least 8 characters',
  })
})

test('validatePassword still accepts a password exactly at the minimum length', () => {
  expect(validatePassword('12345678')).toEqual({ valid: true })
})

test('validatePassword still rejects an empty string with the shared reason', () => {
  expect(validatePassword('')).toEqual({ valid: false, reason: 'must be a non-empty string' })
})
