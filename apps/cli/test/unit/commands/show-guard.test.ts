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
})
