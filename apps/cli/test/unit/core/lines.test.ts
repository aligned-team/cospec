// The line-ending helpers ported from the pinned binary's `utils/line-endings.js`.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { applyLineEnding, detectLineEnding, matchLineEnding } from '../../../src/core/lines.ts'
import { openspecPackageDir } from '../../../src/core/openspec.ts'

const upstream = (await import(join(openspecPackageDir(), 'dist/utils/line-endings.js'))) as {
  detectLineEnding: (content: string) => string | undefined
  matchLineEnding: (content: string, original: string) => string
}

const SAMPLES = [
  '',
  'one line',
  'a\nb\n',
  'a\r\nb\r\n',
  'a\r\nb\n',
  'a\r\nb\nc\n',
  'a\r\nb\r\nc\n',
  '\r',
]

describe('line endings', () => {
  test("detectLineEnding is the binary's: dominant ending, CRLF winning a tie", () => {
    for (const s of SAMPLES)
      expect({ s, e: detectLineEnding(s) as string | undefined }).toEqual({
        s,
        e: upstream.detectLineEnding(s),
      })
  })

  test("matchLineEnding is the binary's; a file with no break stays LF", () => {
    for (const original of SAMPLES)
      expect(matchLineEnding('x\ny\n', original)).toBe(upstream.matchLineEnding('x\ny\n', original))
    expect(matchLineEnding('x\ny\n', 'no break')).toBe('x\ny\n')
  })

  test('applyLineEnding normalizes first, so mixed input comes out uniform', () => {
    expect(applyLineEnding('a\r\nb\nc', '\r\n')).toBe('a\r\nb\r\nc')
    expect(applyLineEnding('a\r\nb\nc', '\n')).toBe('a\nb\nc')
  })
})
