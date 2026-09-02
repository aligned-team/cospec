// Held-out hidden test suite for the `test` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
// Discriminating: src/priceRange.test.ts does not exist on the unmodified
// fixture at all, so reading it (cases 1-3) and running it standalone
// (case 4) both fail until the agent actually authors it with real coverage
// of the three required cases. The implementation-unchanged check is a
// regression guard (the prompt forbids touching priceRange.ts).

import { expect, test } from 'bun:test'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const NEW_TEST_FILE = 'src/priceRange.test.ts'

test('the new test file exercises the empty-array case', async () => {
  const src = await Bun.file(join(ROOT, NEW_TEST_FILE)).text()
  expect(/priceRange\(\s*\[\s*\]\s*\)/.test(src)).toBe(true)
})

test('the new test file exercises a single-price array', async () => {
  const src = await Bun.file(join(ROOT, NEW_TEST_FILE)).text()
  expect(/priceRange\(\s*\[\s*-?\d+(?:\.\d+)?\s*\]\s*\)/.test(src)).toBe(true)
})

test('the new test file exercises a normal multi-price array', async () => {
  const src = await Bun.file(join(ROOT, NEW_TEST_FILE)).text()
  expect(/priceRange\(\s*\[[^\]]*,[^\]]*\]\s*\)/.test(src)).toBe(true)
})

test('the new test file runs and passes standalone', async () => {
  const proc = Bun.spawn(['bun', 'test', NEW_TEST_FILE], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const exitCode = await proc.exited
  expect(exitCode).toBe(0)
})

test('priceRange.ts implementation is unchanged (test-only task)', async () => {
  const src = await Bun.file(join(ROOT, 'src/priceRange.ts')).text()
  expect(src).toContain('Math.min(...prices)')
  expect(src).toContain('Math.max(...prices)')
  expect(src).toContain('prices.length === 0')
})
