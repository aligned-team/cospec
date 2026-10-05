// Verification 13.1: every rendered `sync-specs` body runs the sync through
// the CLI after a preview, and every rendered `archive` body names the
// early-sync no-op (change archive-and-sync-parity).

import { describe, expect, test } from 'bun:test'

import { renderHarnessFiles } from '../../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE } from './fixtures.ts'

const files = renderHarnessFiles({
  harnesses: ['claude', 'codex', 'opencode', 'agents'],
  typeTable: TYPE_TABLE,
  version: TEST_VERSION,
})
const bodies = (workflow: string): { path: string; body: string }[] =>
  files.filter((f) => f.workflow === workflow).map((f) => ({ path: f.path, body: f.body }))

describe('the sync-specs workflow', () => {
  test('renders for every harness', () => {
    expect(bodies('sync-specs').length).toBeGreaterThan(0)
  })

  for (const { path, body } of bodies('sync-specs'))
    test(`${path}: previews, then runs cospec sync-specs, with no bare openspec`, () => {
      const preview = body.indexOf('cospec validate <slug>')
      const sync = body.indexOf('cospec sync-specs <slug>')
      expect(preview).toBeGreaterThan(-1)
      expect(sync).toBeGreaterThan(preview)
      expect(body).not.toMatch(/mid-flight/i)
      expect(body).not.toMatch(/no supported .*sync/i)
      expect(body).not.toMatch(/(^|[^/\w-])openspec (?!archive's|archive,)[a-z]/m)
    })
})

describe('the archive workflow', () => {
  for (const { path, body } of bodies('archive'))
    test(`${path}: names the early-sync no-op and both hard gates`, () => {
      // The workflow reference is spelled per harness (`/cospec:sync-specs`, …).
      expect(body).toMatch(/synced early with `[^`]*sync-specs[^`]*` archives as a\s+no-op merge/)
      expect(body).toContain('archive/verification-incomplete')
      expect(body).toContain('archive/scenario-preservation')
    })
})
