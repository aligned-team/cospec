// The structural respell helper (`respellCommandFields` in
// `core/passthrough-command.ts`) against a real document from the pinned
// binary: `instructions --json` for a root that references two stores whose
// ids contain `openspec`. Only the leading `openspec ` of each named
// command-bearing field is spelled `cospec `; the store ids, paths and every
// other byte survive. upstream-spellings (instructions) and
// passthrough-json-and-doctor (context) wire the helper into their relays.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type CommandField,
  renderJsonDocument,
  respellCommandFields,
} from '../../src/core/passthrough-command.ts'
import { cleanupAll } from '../fixtures/support.ts'
import { oracle, oracleJson, scaffoldOracleRoot } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

const SPEC =
  '# ref-spec\n\n## Purpose\nx\n\n## Requirements\n\n### Requirement: R\nThe system SHALL x.\n\n' +
  '#### Scenario: s\n- **WHEN** a\n- **THEN** b\n'

/** instructions' command-bearing reference fields (dist/core/references.js). */
const REFERENCE_FIELDS: readonly CommandField[] = [
  { path: ['references', '[]', 'fetch'] },
  { path: ['references', '[]', 'status', '[]', 'fix'], lead: 'Run: ' },
]

interface Reference {
  store_id: string
  fetch?: string
  status: { code: string; fix?: string }[]
}

let upstream: { references: Reference[] }

beforeAll(async () => {
  const root = await scaffoldOracleRoot()
  for (const id of ['openspec-team', 'openspec-gone']) {
    const setup = await oracle(
      ['store', 'setup', id, '--path', join(root, 'stores', id), '--no-init-git', '--json'],
      root,
    )
    if (setup.exitCode !== 0) throw new Error(`store setup ${id}: ${setup.stderr}`)
  }
  mkdirSync(join(root, 'stores', 'openspec-team', 'openspec', 'specs', 'ref-spec'), {
    recursive: true,
  })
  writeFileSync(
    join(root, 'stores', 'openspec-team', 'openspec', 'specs', 'ref-spec', 'spec.md'),
    SPEC,
  )
  rmSync(join(root, 'stores', 'openspec-gone', 'openspec'), { recursive: true, force: true })
  writeFileSync(
    join(root, 'openspec', 'config.yaml'),
    'schema: spec-driven\nreferences:\n  - openspec-team\n  - openspec-gone\n',
  )
  const change = await oracle(['new', 'change', 'c1'], root)
  if (change.exitCode !== 0) throw new Error(`new change: ${change.stderr}`)
  const run = await oracleJson(['instructions', 'proposal', '--change', 'c1', '--json'], root)
  if (run.exitCode !== 0) throw new Error(`instructions exited ${run.exitCode}: ${run.stderr}`)
  upstream = run.json as typeof upstream
}, 120_000)

describe('respellCommandFields over the pinned binary instructions --json', () => {
  test('the binary names both stores, with bare openspec commands', () => {
    const [team, gone] = upstream.references
    expect(team?.store_id).toBe('openspec-team')
    expect(team?.fetch).toBe('openspec show <spec-id> --type spec --store openspec-team')
    expect(gone?.store_id).toBe('openspec-gone')
    expect(gone?.status[0]?.fix).toBe('Run: openspec store doctor openspec-gone')
  })

  test('a store id containing openspec survives; only the command token changes', () => {
    const out = respellCommandFields(upstream, REFERENCE_FIELDS)
    const [team, gone] = out.references
    expect(team?.fetch).toBe('cospec show <spec-id> --type spec --store openspec-team')
    expect(gone?.status[0]?.fix).toBe('Run: cospec store doctor openspec-gone')
    expect(team?.store_id).toBe('openspec-team')
    expect(gone?.store_id).toBe('openspec-gone')
    // Every other byte of the document is the binary's.
    const restore = structuredClone(out)
    restore.references[0]!.fetch = upstream.references[0]!.fetch!
    restore.references[1]!.status[0]!.fix = upstream.references[1]!.status[0]!.fix!
    expect(restore).toEqual(upstream)
  })

  test('the rendered document differs from the binary only in the two command tokens', () => {
    const before = renderJsonDocument(upstream)
    const after = renderJsonDocument(respellCommandFields(upstream, REFERENCE_FIELDS))
    expect(
      after
        .replace('"cospec show <spec-id>', '"openspec show <spec-id>')
        .replace('"Run: cospec store doctor', '"Run: openspec store doctor'),
    ).toBe(before)
    expect(after.match(/openspec-team|openspec-gone/g)?.length).toBe(
      before.match(/openspec-team|openspec-gone/g)?.length,
    )
  })
})
