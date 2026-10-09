// A row's `legacyCommandPaths` is the pinned binary's `LEGACY_SLASH_COMMAND_PATHS` entry for
// that tool (design decision 12): row data, never a second list kept in the scan.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import { HARNESS_TABLE, type HarnessAdapter } from '../../../src/harness/adapters.ts'

type UpstreamEntry =
  | { type: 'directory'; path: string; managedFileNames: string[] }
  | { type: 'files'; pattern: string | string[] }

type RowEntry =
  | { type: 'directory'; path: string; managedFileNames: readonly string[] }
  | { type: 'files'; patterns: readonly string[] }

const { LEGACY_SLASH_COMMAND_PATHS } = (await import(
  join(openspecPackageDir(), 'dist/core/legacy-cleanup.js')
)) as { LEGACY_SLASH_COMMAND_PATHS: Record<string, UpstreamEntry> }

function rowEntries(row: HarnessAdapter): RowEntry[] {
  return [
    ...((row as HarnessAdapter & { legacyCommandPaths?: readonly RowEntry[] }).legacyCommandPaths ??
      []),
  ]
}

function upstreamEntries(id: string): RowEntry[] {
  const entry = LEGACY_SLASH_COMMAND_PATHS[id]
  if (entry === undefined) return []
  return entry.type === 'directory'
    ? [{ type: 'directory', path: entry.path, managedFileNames: entry.managedFileNames }]
    : [{ type: 'files', patterns: [entry.pattern].flat() }]
}

describe('legacyCommandPaths', () => {
  for (const row of HARNESS_TABLE) {
    test(`${row.id}: equals the pinned binary's entry, or none`, () => {
      expect(rowEntries(row)).toEqual(upstreamEntries(row.id))
    })
  }

  test('an entry with no row belongs to a tool a later row adds, not to another row', () => {
    const ids = new Set<string>(HARNESS_TABLE.map((row) => row.id))
    const unclaimed = Object.keys(LEGACY_SLASH_COMMAND_PATHS).filter((id) => !ids.has(id))
    expect(unclaimed.toSorted()).toEqual(['github-copilot'])
  })
})
