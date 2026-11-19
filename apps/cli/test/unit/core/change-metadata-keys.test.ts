// `.openspec.yaml` key handling: cospec's change stamp lives under
// `x-cospec-schema-version` with the legacy `schemaVersion` read as a fallback.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readOpenspecYaml } from '../../../src/core/change.ts'

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function changeDir(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-stamp-'))
  roots.push(dir)
  writeFileSync(join(dir, '.openspec.yaml'), yaml)
  return dir
}

describe('the change stamp', () => {
  test('x-cospec-schema-version is read', () => {
    const yaml = readOpenspecYaml(changeDir('schema: feat\nx-cospec-schema-version: 2\n'))
    expect(yaml?.schemaVersion).toBe(2)
    expect(yaml?.legacyStamp).toBeUndefined()
  })

  test('the legacy key is an equal fallback, and flagged', () => {
    const yaml = readOpenspecYaml(changeDir('schema: feat\nschemaVersion: 2\n'))
    expect(yaml?.schemaVersion).toBe(2)
    expect(yaml?.legacyStamp).toBe(true)
  })

  test('the x- key wins over the legacy key', () => {
    const yaml = readOpenspecYaml(
      changeDir('schema: feat\nschemaVersion: 1\nx-cospec-schema-version: 2\n'),
    )
    expect(yaml?.schemaVersion).toBe(2)
    expect(yaml?.legacyStamp).toBe(true)
  })

  test('an invalid x- value is not replaced by a valid legacy one', () => {
    const yaml = readOpenspecYaml(
      changeDir('schema: feat\nschemaVersion: 2\nx-cospec-schema-version: 0\n'),
    )
    expect(yaml?.schemaVersion).toBeUndefined()
  })

  test('no stamp at all reads as unstamped', () => {
    const yaml = readOpenspecYaml(changeDir('schema: feat\n'))
    expect(yaml?.schemaVersion).toBeUndefined()
    expect(yaml?.legacyStamp).toBeUndefined()
  })
})
