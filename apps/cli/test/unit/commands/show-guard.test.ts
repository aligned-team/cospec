// `cospec show`'s one pre-spawn guard (change `unknown-option-contract`): it
// answers only when the binary would print its "Nothing to show" screen,
// never for an argv the binary refuses or treats as an item.

import { describe, expect, test } from 'bun:test'

import { binaryAnswers } from '../../../src/commands/show.ts'

describe('show: binaryAnswers', () => {
  test('an item, or an option show does not declare (its item), reaches the binary', () => {
    expect(binaryAnswers(['c1'])).toBe(true)
    expect(binaryAnswers(['--bogus'])).toBe(true)
    expect(binaryAnswers(['--bogus=1'])).toBe(true)
    expect(binaryAnswers(['--diff=x'])).toBe(true)
    expect(binaryAnswers(['--', '--bogus'])).toBe(true)
  })

  test('a declared value-taking flag left without its value reaches the binary', () => {
    expect(binaryAnswers(['--type'])).toBe(true)
    expect(binaryAnswers(['-r'])).toBe(true)
    expect(binaryAnswers(['--deltas-only', '--requirement'])).toBe(true)
  })

  test('--store-path in either form reaches the binary', () => {
    expect(binaryAnswers(['--store-path'])).toBe(true)
    expect(binaryAnswers(['--store-path=/x'])).toBe(true)
  })

  test("only declared flags with their values, or nothing, is the guard's to answer", () => {
    expect(binaryAnswers([])).toBe(false)
    expect(binaryAnswers(['--type', 'change'])).toBe(false)
    expect(binaryAnswers(['--type=change', '--deltas-only'])).toBe(false)
    expect(binaryAnswers(['--no-interactive', '--'])).toBe(false)
  })

  test('an empty token is no item, before or after --', () => {
    expect(binaryAnswers([''])).toBe(false)
    expect(binaryAnswers(['--', ''])).toBe(false)
    expect(binaryAnswers(['', '--type', 'change'])).toBe(false)
    expect(binaryAnswers(['', 'c1'])).toBe(true)
    expect(binaryAnswers(['--', '', 'c1'])).toBe(true)
  })

  // Commander's short-option split: `-X<rest>` gives a value-taking `-X` the
  // rest as its value (`-r=1` too, value `=1`); a boolean `-X` leaves `-<rest>`
  // as the next token.
  test('an attached short value is its value, not an item', () => {
    expect(binaryAnswers(['-r1'])).toBe(false)
    expect(binaryAnswers(['-r=1'])).toBe(false)
    expect(binaryAnswers(['-rr'])).toBe(false)
    expect(binaryAnswers(['--no-scenarios', '-r1'])).toBe(false)
  })

  test('a short cluster with an item, or an undeclared head, reaches the binary', () => {
    expect(binaryAnswers(['-r1', 'c1'])).toBe(true)
    expect(binaryAnswers(['-x1'])).toBe(true)
    expect(binaryAnswers(['--no-scenarios=x'])).toBe(true)
  })
})
