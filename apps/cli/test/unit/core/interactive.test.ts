// The zero-width-terminal guard (1.14.3 #2108): no spinner or redraw on a terminal
// reporting zero columns, under `CI`, or with `OPEN_SPEC_INTERACTIVE=0`, and the
// same answer carried into every wrapped call's environment.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { canRedraw, noRedrawEnv } from '../../../src/core/interactive.ts'
import { buildWrappedSpawnEnv, openspecPackageDir } from '../../../src/core/openspec.ts'

const upstream = (await import(join(openspecPackageDir(), 'dist/utils/interactive.js'))) as {
  canRenderSpinner: (stream: { isTTY?: boolean; columns?: number }) => boolean
}

const WIDE = { isTTY: true, columns: 80 }
const ZERO = { isTTY: true, columns: 0 }

describe('canRedraw', () => {
  test('a wide terminal redraws; a zero-width one, a pipe, CI and OPEN_SPEC_INTERACTIVE=0 do not', () => {
    expect(canRedraw(WIDE, {})).toBe(true)
    expect(canRedraw(ZERO, {})).toBe(false)
    expect(canRedraw({ isTTY: true }, {})).toBe(false)
    expect(canRedraw({ isTTY: false, columns: 80 }, {})).toBe(false)
    expect(canRedraw(WIDE, { CI: '' })).toBe(false)
    expect(canRedraw(WIDE, { OPEN_SPEC_INTERACTIVE: '0' })).toBe(false)
    expect(canRedraw(WIDE, { OPEN_SPEC_INTERACTIVE: '1' })).toBe(true)
  })

  test("on a terminal it agrees with the binary's canRenderSpinner", () => {
    for (const stream of [WIDE, ZERO, { isTTY: true }, { isTTY: true, columns: 1 }])
      expect(canRedraw(stream, {})).toBe(upstream.canRenderSpinner(stream))
  })
})

describe('the wrapped environment', () => {
  test('a zero-width terminal turns the child non-interactive', () => {
    expect(noRedrawEnv(ZERO, {})).toEqual({ OPEN_SPEC_INTERACTIVE: '0' })
    expect(buildWrappedSpawnEnv({ HOME: '/h' }, ZERO).OPEN_SPEC_INTERACTIVE).toBe('0')
  })

  test('a wide terminal or a pipe adds nothing; an explicit setting is never overridden', () => {
    expect(noRedrawEnv(WIDE, {})).toEqual({})
    expect(noRedrawEnv({ isTTY: false }, {})).toEqual({})
    expect(noRedrawEnv(ZERO, { OPEN_SPEC_INTERACTIVE: '1' })).toEqual({})
  })

  test('CI and OPEN_SPEC_INTERACTIVE=0 reach every wrapped call', () => {
    const built = buildWrappedSpawnEnv({ CI: 'true', OPEN_SPEC_INTERACTIVE: '0' }, WIDE)
    expect(built.CI).toBe('true')
    expect(built.OPEN_SPEC_INTERACTIVE).toBe('0')
  })
})
