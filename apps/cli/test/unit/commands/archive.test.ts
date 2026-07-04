// Archive pre-flight gate tests (steps 1–5). These resolve before step 8's
// `openspec archive` spawn, so no wrapped binary is used. The execute/verify/
// spot-check/fan-out steps (8–12) are exercised in lifecycle.test.ts against the
// real binary.

import { afterAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'

import { run as archiveRun } from '../../../src/commands/archive.ts'
import {
  ctx,
  DONE_TASKS,
  EMPTY_BLOCKERS,
  LITE_PROPOSAL,
  makeRepo,
  runCmd,
  writeArchived,
  writeChange,
} from './helpers.ts'

const roots: string[] = []
function repo(): string {
  const dir = makeRepo()
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const VALID_CI = {
  'proposal.md': LITE_PROPOSAL,
  'blocking-changes.md': EMPTY_BLOCKERS,
  'tasks.md': DONE_TASKS,
}

describe('archive pre-flight', () => {
  test('unknown change exits 1 with a suggestion', async () => {
    const cwd = repo()
    writeChange(cwd, 'ship-it', 'ci', VALID_CI)
    const r = await runCmd(archiveRun, ctx(cwd, ['ship-itt']))
    expect(r.code).toBe(1)
    expect(r.err).toContain("Did you mean 'ship-it'")
  })

  test('incomplete tasks block archive without --force-incomplete', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': '## 1. G\n\n- [ ] 1.1 not done yet\n',
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['c']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('incomplete task')
    expect(r.err).toContain('--force-incomplete')
  })

  test('today-dated archive slot collision exits 1 before delegating', async () => {
    const cwd = repo()
    const today = new Date().toISOString().slice(0, 10)
    writeArchived(cwd, `${today}-c`, 'ci')
    writeChange(cwd, 'c', 'ci', VALID_CI)
    const r = await runCmd(archiveRun, ctx(cwd, ['c']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('already exists')
  })

  test('a validation error blocks archive with exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': '## Why\n\nshort\n',
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['c']))
    expect(r.code).toBe(1)
    expect(r.out).toContain('proposal/sections')
  })
})
