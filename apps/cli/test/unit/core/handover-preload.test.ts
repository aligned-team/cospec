import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  HANDOVER_PRELOAD_SOURCE,
  writeHandoverPreloadInto,
} from '../../../src/core/handover-preload.ts'

describe('writeHandoverPreloadInto', () => {
  test('writes the source at a content-addressed path, and nothing else', () => {
    const root = join(mkdtempSync(join(tmpdir(), 'cospec-preload-')), 'cospec')
    const path = writeHandoverPreloadInto(root)
    expect(path.startsWith(join(root, 'handover-preload-'))).toBe(true)
    expect(path.endsWith('.mjs')).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe(HANDOVER_PRELOAD_SOURCE)
    expect(writeHandoverPreloadInto(root)).toBe(path)
    expect(readdirSync(root)).toEqual([path.slice(root.length + 1)])
  })

  test('repairs a file whose content is not the source', () => {
    const root = mkdtempSync(join(tmpdir(), 'cospec-preload-'))
    const path = writeHandoverPreloadInto(root)
    writeFileSync(path, '// tampered\n')
    expect(writeHandoverPreloadInto(root)).toBe(path)
    expect(readFileSync(path, 'utf8')).toBe(HANDOVER_PRELOAD_SOURCE)
  })
})
