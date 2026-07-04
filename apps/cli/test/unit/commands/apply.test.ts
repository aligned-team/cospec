// Apply-gate tests. Every path here resolves before step 5's `openspec
// instructions apply` call (blocked/soft-blocked/validation-error/unknown), so
// no wrapped binary is spawned. The clear-gate path is covered by lifecycle.test.ts.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run as applyRun } from '../../../src/commands/apply.ts'
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

function blockers(blocked: string, soft = 'None.'): string {
  return `# Dependencies\n\n## Blocked by\n\n${blocked}\n\n## Soft-blocked by\n\n${soft}\n`
}

describe('apply gate', () => {
  test('unknown change exits 1 with a suggestion', async () => {
    const cwd = repo()
    writeChange(cwd, 'add-widget', 'ci')
    const r = await runCmd(applyRun, ctx(cwd, ['add-widgets']))
    expect(r.code).toBe(1)
    expect(r.err).toContain("Did you mean 'add-widget'")
  })

  test('uninitialized repo reports the missing openspec/ dir, not "unknown change"', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-uninit-'))
    roots.push(cwd)
    const r = await runCmd(applyRun, ctx(cwd, ['foo']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
    expect(r.err).not.toContain('unknown change')
  })

  test('missing required artifacts exits 2 (reason=missing-artifacts)', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', { 'proposal.md': LITE_PROPOSAL })
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { json: true }))
    expect(r.code).toBe(2)
    const parsed = JSON.parse(r.out) as { gate: { reason: string; missingArtifacts: string[] } }
    expect(parsed.gate.reason).toBe('missing-artifacts')
    expect(parsed.gate.missingArtifacts).toEqual(['blocking-changes', 'tasks'])
  })

  test('unchecked hard blocker exits 2 (reason=hard-blockers)', async () => {
    const cwd = repo()
    writeChange(cwd, 'dep', 'ci')
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': blockers('- [ ] `dep` — provides x'),
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { json: true }))
    expect(r.code).toBe(2)
    const parsed = JSON.parse(r.out) as {
      gate: { reason: string; hardBlockers: { slug: string }[] }
    }
    expect(parsed.gate.reason).toBe('hard-blockers')
    expect(parsed.gate.hardBlockers[0]!.slug).toBe('dep')
  })

  test('unconfirmed soft blocker exits 3; --allow-soft acknowledges it', async () => {
    const cwd = repo()
    writeChange(cwd, 'nice', 'ci')
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': blockers('None.', '- [ ] `nice` — degrades gracefully'),
      'tasks.md': DONE_TASKS,
    })
    const soft = await runCmd(applyRun, ctx(cwd, ['c']))
    expect(soft.code).toBe(3)
    expect(soft.out).toContain('soft-blocked')
    // --allow-soft clears the soft gate (then step 5 hits openspec — asserted in lifecycle).
  })

  test('self-heals a stale hard blocker whose target is archived', async () => {
    const cwd = repo()
    writeArchived(cwd, '2026-07-01-dep', 'ci')
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': blockers('- [ ] `dep` — provides x'),
      'tasks.md': DONE_TASKS,
    })
    // Gate is clear (dep archived), so step 5 runs; the self-heal at step 4c has
    // already rewritten the checked box on disk regardless.
    await runCmd(applyRun, ctx(cwd, ['c'], { json: true }))
    const healed = readFileSync(join(dir, 'blocking-changes.md'), 'utf8')
    expect(healed).toContain('- [x] `dep` — provides x *(archived 2026-07-01)*')
  })

  test('a validation error blocks with exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': '## Why\n\nshort\n', // missing ## What Changes / ## Impact
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(applyRun, ctx(cwd, ['c']))
    expect(r.code).toBe(1)
    expect(r.out).toContain('proposal/sections')
  })
})
