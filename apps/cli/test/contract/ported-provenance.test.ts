// Every `ported:` entry in canon/workflows/harness.yaml names a template that exists in the
// pinned OpenSpec dist, read at the pinned version (canon-workflow-parity 8.1, design D10).
// A pin bump fails here with the entries to re-diff, so no passage goes stale unnoticed.

import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { openspecPackageDir, PINNED_OPENSPEC_VERSION } from '../../src/core/openspec.ts'
import { readWorkflowManifest } from '../../src/harness/render.ts'

const entries = readWorkflowManifest().workflows.flatMap((w) =>
  (w.ported ?? []).map((p) => ({ workflow: w.id, ...p })),
)
const describeEntry = (e: (typeof entries)[number]): string =>
  `${e.workflow}: ${e.passage} (${e.file} @ ${e.pin})`

describe('ported provenance against the pinned dist', () => {
  test('every workflow records at least its fragment passages', () => {
    for (const w of readWorkflowManifest().workflows) {
      const ids = (w.ported ?? []).map((p) => p.passage)
      expect(ids).toContain('root-guard')
      expect(ids).toContain('change-picker')
    }
  })

  test('every entry names a template file that exists in the pinned dist', () => {
    const missing = entries.filter((e) => !existsSync(join(openspecPackageDir(), e.file)))
    expect(missing.map(describeEntry)).toEqual([])
  })

  test('every entry was read at the pinned version; a bump lists what to re-diff', () => {
    const stale = entries.filter((e) => e.pin !== PINNED_OPENSPEC_VERSION)
    expect(stale.map(describeEntry)).toEqual([])
  })
})
