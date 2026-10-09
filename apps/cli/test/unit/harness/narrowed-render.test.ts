// Narrowed installs (workflow-profiles task 4.1, design D7): with only some workflows installed,
// no rendered command or skill body names a workflow the install does not carry, under the four
// shipped rows, and every optional-workflow conditional resolves so no marker survives.

import { expect, test } from 'bun:test'

import {
  type HarnessName,
  readWorkflowManifest,
  renderHarnessFiles,
} from '../../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE } from './fixtures.ts'

const SHIPPED: HarnessName[] = ['claude', 'codex', 'opencode', 'agents']
const manifest = readWorkflowManifest().workflows

const SETS: [string, string[]][] = [
  ['the core six', manifest.filter((w) => w.core === true).map((w) => w.id)],
  ['custom archive alone', ['archive']],
  ['custom archive with sync-specs spliced in', ['sync-specs', 'archive']],
]

for (const [name, ids] of SETS) {
  const render = () =>
    renderHarnessFiles({
      harnesses: SHIPPED,
      typeTable: TYPE_TABLE,
      version: TEST_VERSION,
      workflows: new Set(ids),
    })

  test(`${name}: every conditional resolves and no marker survives`, () => {
    const bodies = render()
      .filter((f) => f.kind !== 'rules')
      .map((f) => f.body)
    expect(bodies.filter((b) => b.includes('[[opsx:'))).toEqual([])
  })

  test.failing(`${name}: no body names an uninstalled workflow`, () => {
    const uninstalled = manifest.filter((w) => !ids.includes(w.id))
    const named = render()
      .filter((f) => f.kind !== 'rules')
      .flatMap((f) =>
        uninstalled
          .filter(
            (w) =>
              f.body.includes(`/cospec:${w.id}`) ||
              f.body.includes(`/cospec-${w.command}`) ||
              f.body.includes(w.skill),
          )
          .map((w) => `${f.path} names ${w.id}`),
      )
    expect(named).toEqual([])
  })
}
