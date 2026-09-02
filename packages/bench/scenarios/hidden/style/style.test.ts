// Held-out hidden test suite for the `style` scenario — see
// `packages/bench/scenarios/hidden/README.md` for the copy/import convention.
//
// This is a behavior-preserving task, so the two structural checks below are
// what discriminate "task done": the unmodified fixture has 3 semicolons and
// no trailing comma on DEFAULTS, both of which fail here until reformatted.
// The value-level checks are regression guards (already true before the task;
// must stay true after a pure reformat).

import { expect, test } from 'bun:test'
import { join } from 'node:path'

import { DEFAULTS, formatList } from '../src/format.ts'

const ROOT = join(import.meta.dir, '..')

test('the file contains zero semicolons (no-semicolons rule)', async () => {
  const src = await Bun.file(join(ROOT, 'src/format.ts')).text()
  expect((src.match(/;/g) ?? []).length).toBe(0)
})

test('the DEFAULTS multiline object literal has a trailing comma before its closing brace', async () => {
  const src = await Bun.file(join(ROOT, 'src/format.ts')).text()
  const match = /export const DEFAULTS\s*=\s*\{([\s\S]*?)\}/.exec(src)
  expect(match).not.toBeNull()
  expect((match?.[1] ?? '').trimEnd().endsWith(',')).toBe(true)
})

test('formatList handles a single-item array (no behavior change)', () => {
  expect(formatList(['solo'])).toBe('- solo')
})

test('formatList handles an empty array (no behavior change)', () => {
  expect(formatList([])).toBe('')
})

test('DEFAULTS keeps its exact documented values (no behavior change)', () => {
  expect(DEFAULTS).toEqual({ limit: 10, sort: true })
})
