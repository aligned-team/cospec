// `.openspec.yaml` key handling (OpenSpec 1.14/1.15 parity): lowercase `x-`
// extension keys are never reported, cospec's change stamp lives under
// `x-cospec-schema-version` with the legacy `schemaVersion` read as a fallback,
// and every other unknown key is one `change/unknown-metadata-key` WARNING. The
// known-key set and the extension grammar are held to the pinned binary's own.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CHANGE_METADATA_KNOWN_KEYS,
  isExtensionMetadataKey,
  LEGACY_SCHEMA_VERSION_KEY,
  readUnknownChangeMetadataKeys,
  unknownChangeMetadataKeys,
  UPSTREAM_UNKNOWN_KEYS_RE,
} from '../../../src/core/change-metadata.ts'
import { readOpenspecYaml } from '../../../src/core/change.ts'
import { openspecPackageDir } from '../../../src/core/openspec.ts'
import { openspecYamlIssues, unknownMetadataKeyIssues } from '../../../src/core/rules/meta.ts'

interface UpstreamMetadata {
  CHANGE_METADATA_KNOWN_KEYS: readonly string[]
  isExtensionMetadataKey: (key: string) => boolean
  listUnknownChangeMetadataKeys: (parsed: unknown) => string[]
  formatUnknownChangeMetadataKeysMessage: (keys: string[]) => string
}

const upstream = (await import(
  join(openspecPackageDir(), 'dist/utils/change-metadata.js')
)) as UpstreamMetadata

const roots: string[] = []
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function changeDir(yaml: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-meta-keys-'))
  roots.push(dir)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, '.openspec.yaml'), yaml)
  return dir
}

const KEYS = [
  'schema',
  'created',
  'goal',
  'skip_specs',
  'x-goal',
  'x-jiraKey',
  'x-cospec-schema-version',
  'x-',
  'x- tracker',
  'X-Tracker',
  'skip_design',
  'schemaVersion',
  'owner',
]

describe('the known-key set and extension grammar match the pinned binary', () => {
  test('known keys', () => {
    expect<string[]>([...CHANGE_METADATA_KNOWN_KEYS]).toEqual([
      ...upstream.CHANGE_METADATA_KNOWN_KEYS,
    ])
  })

  test.each(KEYS)('isExtensionMetadataKey(%p)', (key) => {
    expect(isExtensionMetadataKey(key)).toBe(upstream.isExtensionMetadataKey(key))
  })

  test("the unknown set is the binary's, minus cospec's legacy stamp", () => {
    const record = Object.fromEntries(KEYS.map((k) => [k, 1]))
    expect(unknownChangeMetadataKeys(record)).toEqual(
      upstream.listUnknownChangeMetadataKeys(record).filter((k) => k !== LEGACY_SCHEMA_VERSION_KEY),
    )
    expect(unknownChangeMetadataKeys(record)).toEqual([
      'X-Tracker',
      'owner',
      'skip_design',
      'x-',
      'x- tracker',
    ])
  })

  test("the binary's warning is the one cospec's delegation drops", () => {
    expect(
      UPSTREAM_UNKNOWN_KEYS_RE.test(upstream.formatUnknownChangeMetadataKeysMessage(['owner'])),
    ).toBe(true)
  })
})

describe('readUnknownChangeMetadataKeys', () => {
  test('extension keys and the legacy stamp are not unknown', () => {
    const dir = changeDir('schema: feat\nx-goal: G-12\nx-jiraKey: ABC-1\nschemaVersion: 2\n')
    expect(readUnknownChangeMetadataKeys(dir)).toEqual([])
  })

  test('an unparseable file names no keys', () => {
    expect(readUnknownChangeMetadataKeys(changeDir('schema: [\n'))).toEqual([])
  })
})

describe('change/unknown-metadata-key', () => {
  test('one WARNING names every unknown key', () => {
    const issues = unknownMetadataKeyIssues(['X-Tracker', 'skip_design'])
    expect(issues).toHaveLength(1)
    expect(issues[0]!.level).toBe('WARNING')
    expect(issues[0]!.rule).toBe('change/unknown-metadata-key')
    expect(issues[0]!.message).toContain('X-Tracker, skip_design')
    expect(issues[0]!.message).toContain('skip_design is not a supported key')
  })

  test('openspecYamlIssues carries it for a loaded file', () => {
    const issues = openspecYamlIssues({
      present: true,
      parseable: true,
      schema: 'feat',
      unknownKeys: ['owner'],
    })
    expect(issues.map((i) => i.rule)).toEqual(['change/unknown-metadata-key'])
  })

  test('no keys, no issue', () => {
    expect(unknownMetadataKeyIssues([])).toEqual([])
  })
})

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
})
