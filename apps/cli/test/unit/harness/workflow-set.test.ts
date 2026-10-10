// Task 5.2 of workflow-profiles: the set a profile selects, and its agreement with the pinned
// binary's `getProfileWorkflows` over the same inputs.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'

import { openspecPackageDir } from '../../../src/core/openspec.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'
import { isProfile, profileWorkflows } from '../../../src/harness/workflow-set.ts'

const { getProfileWorkflows, ALL_WORKFLOWS } = (await import(
  join(openspecPackageDir(), 'dist/core/profiles.js')
)) as {
  getProfileWorkflows: (profile: string, workflows?: string[]) => string[]
  ALL_WORKFLOWS: string[]
}

const manifest = readWorkflowManifest()
const asCospec = (id: string): string => (id === 'sync' ? 'sync-specs' : id)

describe('profileWorkflows', () => {
  test('core is the six manifest workflows marked core', () => {
    expect(profileWorkflows('core', undefined, manifest).toSorted()).toEqual(
      ['apply', 'archive', 'explore', 'propose', 'sync-specs', 'update'].toSorted(),
    )
  })

  test('core ignores a workflows list', () => {
    expect(profileWorkflows('core', ['verify'], manifest)).toEqual(
      profileWorkflows('core', undefined, manifest),
    )
  })

  test('custom returns the list as given', () => {
    expect(profileWorkflows('custom', ['verify', 'new'], manifest)).toEqual(['verify', 'new'])
  })

  test('custom reads upstream\'s "sync" as sync-specs, and accepts either spelling', () => {
    expect(profileWorkflows('custom', ['sync'], manifest)).toEqual(['sync-specs'])
    expect(profileWorkflows('custom', ['sync-specs'], manifest)).toEqual(['sync-specs'])
  })

  test('ids outside the twelve are dropped', () => {
    expect(profileWorkflows('custom', ['propose', 'nope', 7, null, 'apply'], manifest)).toEqual([
      'propose',
      'apply',
    ])
  })

  test('a value that is not an array is an empty list', () => {
    for (const raw of [undefined, null, 'propose', 5, { 0: 'propose' }, true]) {
      expect(profileWorkflows('custom', raw, manifest)).toEqual([])
    }
  })

  test('an explicit custom with an empty list installs nothing', () => {
    expect(profileWorkflows('custom', [], manifest)).toEqual([])
  })

  test('sync-specs is spliced before the first archive or bulk-archive', () => {
    expect(profileWorkflows('custom', ['propose', 'archive'], manifest)).toEqual([
      'propose',
      'sync-specs',
      'archive',
    ])
    expect(profileWorkflows('custom', ['bulk-archive', 'archive'], manifest)).toEqual([
      'sync-specs',
      'bulk-archive',
      'archive',
    ])
    expect(profileWorkflows('custom', ['verify', 'bulk-archive', 'apply'], manifest)).toEqual([
      'verify',
      'sync-specs',
      'bulk-archive',
      'apply',
    ])
  })

  test('sync-specs is not spliced when already listed, wherever it stands', () => {
    expect(profileWorkflows('custom', ['archive', 'sync-specs'], manifest)).toEqual([
      'archive',
      'sync-specs',
    ])
    expect(profileWorkflows('custom', ['archive', 'sync'], manifest)).toEqual([
      'archive',
      'sync-specs',
    ])
  })

  test('sync-specs is not spliced without an archive workflow', () => {
    expect(profileWorkflows('custom', ['propose', 'apply'], manifest)).toEqual(['propose', 'apply'])
  })
})

describe('against the pinned getProfileWorkflows', () => {
  const lists: (string[] | undefined)[] = [
    undefined,
    [],
    ['propose'],
    ['archive'],
    ['bulk-archive'],
    ['archive', 'bulk-archive'],
    ['propose', 'archive', 'verify'],
    ['propose', 'sync', 'archive'],
    ['archive', 'sync'],
    ['new', 'bulk-archive', 'sync', 'onboard'],
    [...ALL_WORKFLOWS],
    ALL_WORKFLOWS.toReversed(),
    ['verify', 'bulk-archive', 'archive'],
  ]

  test('core selects the same set', () => {
    expect(profileWorkflows('core', undefined, manifest).toSorted()).toEqual(
      getProfileWorkflows('core').map(asCospec).toSorted(),
    )
  })

  for (const list of lists) {
    test(`custom ${JSON.stringify(list)} selects the same list`, () => {
      const upstream = getProfileWorkflows('custom', list).map(asCospec)
      expect(profileWorkflows('custom', list, manifest)).toEqual(upstream)
    })
  }

  test('an unrecognised profile name selects core in the binary, as the reader treats it', () => {
    expect(getProfileWorkflows('bogus').map(asCospec).toSorted()).toEqual(
      profileWorkflows('core', undefined, manifest).toSorted(),
    )
  })
})

describe('isProfile', () => {
  test('accepts exactly core and custom', () => {
    expect(isProfile('core')).toBe(true)
    expect(isProfile('custom')).toBe(true)
    for (const v of ['', 'CORE', 'Custom', 'full', 'bogus']) expect(isProfile(v)).toBe(false)
  })
})

describe('the sync alias', () => {
  test('matches canon/parity/aliases.yaml', () => {
    const aliases = parse(
      readFileSync(join(import.meta.dir, '../../../src/canon/parity/aliases.yaml'), 'utf8'),
    ) as { upstream: { kind: string; id?: string }; cospec: string }[]
    const sync = aliases.find((a) => a.upstream.kind === 'workflow' && a.upstream.id === 'sync')
    expect(sync?.cospec).toBe('sync-specs')
    expect(manifest.workflows.map((w) => w.id)).toContain(sync!.cospec)
  })
})
