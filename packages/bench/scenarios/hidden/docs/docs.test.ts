// Held-out hidden test suite for the `docs` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating: the unmodified fixture has no JSDoc and no "## slugify"
// README section at all, so the presence/example checks fail until the task
// is done. The implementation-unchanged check is a regression guard (the
// prompt explicitly forbids touching slugify's behavior).

import { expect, test } from 'bun:test'
import { join } from 'node:path'

import { slugify } from '../src/slugify.ts'

const ROOT = join(import.meta.dir, '..')

test('JSDoc above slugify documents the parameter', async () => {
  const src = await Bun.file(join(ROOT, 'src/slugify.ts')).text()
  const jsdocMatch = /\/\*\*([\s\S]*?)\*\/\s*export (?:function slugify|const slugify)/.exec(src)
  expect(jsdocMatch).not.toBeNull()
  expect(/@param/.test(jsdocMatch?.[1] ?? '')).toBe(true)
})

test('JSDoc above slugify documents the return value', async () => {
  const src = await Bun.file(join(ROOT, 'src/slugify.ts')).text()
  const jsdocMatch = /\/\*\*([\s\S]*?)\*\/\s*export (?:function slugify|const slugify)/.exec(src)
  expect(jsdocMatch).not.toBeNull()
  expect(/@returns?/.test(jsdocMatch?.[1] ?? '')).toBe(true)
})

test('slugify implementation is unchanged (docs-only task)', async () => {
  const src = await Bun.file(join(ROOT, 'src/slugify.ts')).text()
  expect(src).toContain('.trim()')
  expect(src).toContain('.toLowerCase()')
  expect(src).toContain("replace(/[^a-z0-9]+/g, '-')")
  expect(src).toContain("replace(/(^-|-$)/g, '')")
})

test("README's ## slugify section shows a real, correctly computed example call", async () => {
  const readme = await Bun.file(join(ROOT, 'README.md')).text()
  const sectionMatch = /##[^\n]*slugify[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i.exec(readme)
  expect(sectionMatch).not.toBeNull()
  const section = sectionMatch?.[1] ?? ''

  const callMatch = /slugify\(\s*(['"])((?:\\.|(?!\1).)*)\1\s*\)/.exec(section)
  expect(callMatch).not.toBeNull()
  const arg = callMatch?.[2] ?? ''
  const expected = slugify(arg)
  expect(section).toContain(expected)
})
