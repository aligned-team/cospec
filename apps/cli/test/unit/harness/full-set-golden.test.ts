// The full-set baseline for workflow-profiles (task 1.4), captured before any source change:
// with all twelve workflows installed and delivery `both` (every option left unset), the
// render of each shipped row stays byte-identical. Two pins, neither a copy of the other:
//
// - the adapter-table golden set (`__golden__/harness-render/all`) already holds every
//   shipped row's twelve skill and command files in full, so this file reads it rather than
//   duplicating the bytes under a second directory;
// - the repo's own committed `.claude/`, `.agents/`, `.codex/` and `.opencode/` output, which
//   `mise run generate` writes with the real type table and version stamp.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CURRENT_GENERATED_BY } from '../../../src/core/managed-files.ts'
import { TYPE_TABLE } from '../../../src/core/schema-compose.ts'
import {
  type HarnessName,
  readWorkflowManifest,
  renderHarnessFiles,
} from '../../../src/harness/render.ts'
import { TEST_VERSION, TYPE_TABLE as FIXTURE_TYPE_TABLE } from './fixtures.ts'

const SHIPPED: HarnessName[] = ['claude', 'codex', 'opencode', 'agents']
const REPO_ROOT = join(import.meta.dir, '../../../../..')
const GOLDEN_ALL = join(import.meta.dir, '../__golden__/harness-render/all')

const workflowIds = readWorkflowManifest().workflows.map((w) => w.id)

describe('full-set golden (all twelve workflows, delivery both)', () => {
  test('the manifest declares twelve workflows', () => {
    expect(workflowIds).toHaveLength(12)
  })

  const fixtureRender = renderHarnessFiles({
    harnesses: SHIPPED,
    typeTable: FIXTURE_TYPE_TABLE,
    version: TEST_VERSION,
  })

  test('every shipped row renders each workflow once per surface it has', () => {
    for (const row of ['claude', 'opencode'] as const) {
      for (const kind of ['command', 'skill'] as const) {
        if (row === 'opencode' && kind === 'skill') continue
        const ids = fixtureRender
          .filter((f) => f.harness === row && f.kind === kind)
          .map((f) => f.workflow)
          .toSorted()
        expect({ row, kind, ids }).toEqual({ row, kind, ids: workflowIds.toSorted() })
      }
    }
    const shared = fixtureRender
      .filter((f) => f.kind === 'skill' && f.path.startsWith('.agents/skills/'))
      .map((f) => f.workflow)
      .toSorted()
    expect(shared).toEqual(workflowIds.toSorted())
  })

  test('every rendered file equals the adapter-table golden, byte for byte', () => {
    expect(fixtureRender.length).toBeGreaterThan(workflowIds.length * 2)
    for (const f of fixtureRender) {
      const want = readFileSync(join(GOLDEN_ALL, f.path))
      expect({ path: f.path, same: Buffer.from(f.content, 'utf8').equals(want) }).toEqual({
        path: f.path,
        same: true,
      })
    }
  })

  test('every rendered file equals the repo’s committed output, byte for byte', () => {
    const rendered = renderHarnessFiles({
      harnesses: SHIPPED,
      typeTable: TYPE_TABLE,
      version: CURRENT_GENERATED_BY,
    })
    for (const f of rendered) {
      const onDisk = readFileSync(join(REPO_ROOT, f.path))
      expect({ path: f.path, same: Buffer.from(f.content, 'utf8').equals(onDisk) }).toEqual({
        path: f.path,
        same: true,
      })
    }
  })

  test('no committed cospec workflow file is missing from the render', () => {
    const rendered = new Set(
      renderHarnessFiles({
        harnesses: SHIPPED,
        typeTable: TYPE_TABLE,
        version: CURRENT_GENERATED_BY,
      }).map((f) => f.path),
    )
    const committed = [
      '.claude/commands/cospec',
      '.claude/skills',
      '.agents/skills',
      '.opencode/commands',
    ].flatMap((dir) =>
      readdirSync(join(REPO_ROOT, dir), { recursive: true, withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => join(e.parentPath, e.name).slice(REPO_ROOT.length + 1)),
    )
    expect(committed.filter((p) => !rendered.has(p)).toSorted()).toEqual([])
  })
})
