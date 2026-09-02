// Held-out hidden test suite for the `refactor` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
//
// This is a behavior-preserving task: the three validators' observable
// behavior must be IDENTICAL before and after, so the only thing that can
// discriminate "task done" is structure (the literal-string duplication
// itself). The occurrence-count check below is stricter than the scenario's
// own visible completion predicate (which accepts 1 OR 2 occurrences as
// "reduced"): the prompt explicitly says to "extract a shared helper", which
// implies a single definition of the reason string, so this is a legitimate
// tightening, not an arbitrary one — it fails on the unmodified fixture
// (3 occurrences) and passes on a correct full dedup (1). The remaining
// cases are regression guards: behavior a naive/careless dedup could plausibly
// break (an accidental boundary shift, or the three functions' distinct
// secondary messages collapsing into one) even though it already holds on the
// unmodified fixture.

import { expect, test } from 'bun:test'
import { join } from 'node:path'

import { validateEmail, validatePassword, validateUsername } from '../src/validators.ts'

const ROOT = join(import.meta.dir, '..')
const DUPLICATED_LITERAL = 'must be a non-empty string'

test('the shared non-empty-string reason string is defined exactly once (fully deduplicated)', async () => {
  const src = await Bun.file(join(ROOT, 'src/validators.ts')).text()
  const occurrences = src.split(DUPLICATED_LITERAL).length - 1
  expect(occurrences).toBe(1)
})

test('all three validators reject a whitespace-only string as non-empty-string, not as too-short', () => {
  expect(validateUsername('   ')).toEqual({ valid: false, reason: DUPLICATED_LITERAL })
  expect(validatePassword('   ')).toEqual({ valid: false, reason: DUPLICATED_LITERAL })
  expect(validateEmail('   ')).toEqual({ valid: false, reason: DUPLICATED_LITERAL })
})

test('validateUsername keeps its exact length boundary (2 invalid, 3 valid)', () => {
  expect(validateUsername('ab')).toEqual({ valid: false, reason: 'must be at least 3 characters' })
  expect(validateUsername('abc')).toEqual({ valid: true })
})

test('validatePassword keeps its exact length boundary (7 invalid, 8 valid)', () => {
  expect(validatePassword('1234567')).toEqual({
    valid: false,
    reason: 'must be at least 8 characters',
  })
  expect(validatePassword('12345678')).toEqual({ valid: true })
})

test("each validator's secondary (non-emptiness) message stays distinct — not collapsed together", () => {
  expect(validateEmail('nope')).toEqual({ valid: false, reason: 'must contain an @' })
  expect(validateUsername('ab')).toEqual({ valid: false, reason: 'must be at least 3 characters' })
  expect(validatePassword('short')).toEqual({
    valid: false,
    reason: 'must be at least 8 characters',
  })
})
