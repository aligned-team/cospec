// T1 of workflow-profiles: the six workflows upstream's `core` profile installs carry
// `core: true` in the canon manifest, and the set is checked against the pinned binary's own
// `CORE_WORKFLOWS` rather than a second hand-kept list.

import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'

const { CORE_WORKFLOWS } = (await import(join(openspecPackageDir(), 'dist/core/profiles.js'))) as {
  CORE_WORKFLOWS: string[]
}

/** Upstream spells cospec's `sync-specs` workflow `sync`. */
const asCospecId = (id: string): string => (id === 'sync' ? 'sync-specs' : id)

describe('core workflows in the manifest', () => {
  const workflows = readWorkflowManifest().workflows
  const core = workflows.filter((w) => w.core === true).map((w) => w.id)

  test('exactly propose, explore, apply, update, sync-specs and archive are core', () => {
    expect(core.toSorted()).toEqual(
      ['propose', 'explore', 'apply', 'update', 'sync-specs', 'archive'].toSorted(),
    )
  })

  test('the core set equals the pinned CORE_WORKFLOWS, sync read as sync-specs', () => {
    expect(core.toSorted()).toEqual(CORE_WORKFLOWS.map(asCospecId).toSorted())
  })

  test('core is declared only as true, never false, on the other workflows', () => {
    for (const w of workflows) {
      if (!core.includes(w.id)) expect(w.core).toBeUndefined()
    }
  })
})
