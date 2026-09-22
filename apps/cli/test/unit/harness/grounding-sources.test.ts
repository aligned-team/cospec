import { describe, expect, test } from 'bun:test'

import { type HarnessName, renderHarnessFiles } from '../../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE } from './fixtures.ts'

const ALL: HarnessName[] = ['claude', 'codex', 'opencode', 'agents']

const files = renderHarnessFiles({ harnesses: ALL, typeTable: TYPE_TABLE, version: TEST_VERSION })

/**
 * `cospec context` is a disciplined passthrough of `openspec context`, whose JSON is
 * `{root, members, status}` — registered reference stores and relationship health. It never
 * carries this project's own changes; `cospec list` is the only source for those. A workflow
 * that sends an agent to `context` for the in-flight set sends it to an empty array, so the
 * grounding steps must keep the two commands' jobs distinct.
 */
describe('grounding commands are attributed to the right source', () => {
  const inFlight = /in[ -]flight|already being worked on|changes already/i

  test('no paragraph credits `cospec context` with the in-flight change set', () => {
    for (const f of files) {
      for (const para of f.body.split(/\n\s*\n/)) {
        if (!para.includes('cospec context')) continue
        if (!inFlight.test(para)) continue
        // A paragraph may name both only to deny the attribution ("it never lists changes").
        expect([f.path, para, /\bnever\b|\bnot\b|\bdo not\b/i.test(para)]).toEqual([
          f.path,
          para,
          true,
        ])
      }
    }
  })

  test('every workflow that reasons about in-flight changes reaches them via `cospec list`', () => {
    for (const f of files) {
      if (!inFlight.test(f.body)) continue
      expect([f.path, f.body.includes('cospec list')]).toEqual([f.path, true])
    }
  })
})
