import { expect, test } from 'bun:test'

import { slugify } from './slugify.ts'

test('slugify collapses whitespace and punctuation into hyphens', () => {
  expect(slugify('  Hello, World!  ')).toBe('hello-world')
})
