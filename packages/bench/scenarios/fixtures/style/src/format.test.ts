import { expect, test } from 'bun:test'

import { DEFAULTS, formatList } from './format.ts'

test('formatList renders a markdown bullet list', () => {
  expect(formatList(['a', 'b'])).toBe('- a\n- b')
})

test('DEFAULTS keeps its documented shape', () => {
  expect(DEFAULTS).toEqual({ limit: 10, sort: true })
})
