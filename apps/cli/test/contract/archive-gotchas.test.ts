// Probe §5.5 gotcha regressions (DESIGN §8.2). The dangerous openspec behavior:
// an invalid delta makes `openspec archive -y` print "Aborted." and NOT move the
// change, yet exit 0. Each test first pins that real behavior, then asserts
// cospec never reports success when openspec silently no-ops.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { PARITY_FIXTURES } from './fixtures.ts'

afterAll(cleanupAll)

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
- [x] 1.2 Add a covering test
`

function fixture(key: string): (typeof PARITY_FIXTURES)[number] {
  const f = PARITY_FIXTURES.find((p) => p.key === key)
  if (f === undefined) throw new Error(`missing fixture ${key}`)
  return f
}

function markDone(root: string, name: string): void {
  writeFiles(root, { [`openspec/changes/${name}/tasks.md`]: TASKS_DONE })
}

function movedToArchive(root: string, name: string): boolean {
  return !existsSync(join(root, 'openspec/changes', name))
}

describe('archive gotcha regressions vs openspec 1.3.1', () => {
  test('no-op delta: openspec exits 0+Aborted+unmoved; cospec refuses to claim success', async () => {
    const name = 'zero-op-delta'
    // Pin the real openspec gotcha.
    const oRepo = mkTempRepo({ git: true })
    fixture(name).build(oRepo)
    const o = await openspec(['archive', name, '-y'], oRepo)
    expect(o.exitCode).toBe(0)
    expect(o.stdout).toMatch(/\bAborted\b/)
    expect(movedToArchive(oRepo, name)).toBe(false)

    // cospec must NOT silently succeed.
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(false)
  })

  test('MODIFIED vs missing target: same silent openspec abort; cospec refuses', async () => {
    const name = 'modified-missing-target'
    const oRepo = mkTempRepo({ git: true })
    fixture(name).build(oRepo)
    const o = await openspec(['archive', name, '-y'], oRepo)
    expect(o.exitCode).toBe(0)
    expect(o.stdout).toMatch(/\bAborted\b/)
    expect(movedToArchive(oRepo, name)).toBe(false)

    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(false)
  })

  test('--skip-specs genuinely moves a change openspec would otherwise abort on', async () => {
    const name = 'modified-missing-target'
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name, '--skip-specs'], { cwd: cRepo })
    expect(c.exitCode).toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(true)
  })

  test('duplicate archive slot for today → exit 1 before touching the tree', async () => {
    const name = 'valid-added'
    const today = new Date().toISOString().slice(0, 10)
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    // Pre-create the archive slot that today's archive would claim.
    writeFiles(cRepo, {
      [`openspec/changes/archive/${today}-${name}/.openspec.yaml`]: 'schema: feat\n',
    })
    const c = await cospec(['archive', name], { cwd: cRepo })
    expect(c.exitCode).toBe(1)
    // The live change must remain in place (not half-archived).
    expect(movedToArchive(cRepo, name)).toBe(false)
  })
})
