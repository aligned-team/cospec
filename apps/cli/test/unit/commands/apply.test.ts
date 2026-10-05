// Apply-gate tests. Every gate path here resolves before step 5's `openspec
// instructions apply` call (blocked/soft-blocked/validation-error/unknown), so
// no wrapped binary is spawned; only the early-exit rows' two failed wrapped
// calls spawn it. The clear-gate path is covered by lifecycle.test.ts.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run as applyRun } from '../../../src/commands/apply.ts'
import { withEmptyMachineState } from '../../fixtures/support.ts'
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
    const r = await runCmd(applyRun, ctx(cwd, ['add-widgets'], { command: 'apply' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain("Did you mean 'add-widget'")
  })

  test('uninitialized repo reports the missing openspec/ dir, not "unknown change"', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-uninit-'))
    roots.push(cwd)
    const r = await withEmptyMachineState(() =>
      runCmd(applyRun, ctx(cwd, ['foo'], { command: 'apply' })),
    )
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
    expect(r.err).not.toContain('unknown change')
  })

  test('missing required artifacts exits 2 (reason=missing-artifacts)', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', { 'proposal.md': LITE_PROPOSAL })
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { json: true, command: 'apply' }))
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
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { json: true, command: 'apply' }))
    expect(r.code).toBe(2)
    const parsed = JSON.parse(r.out) as {
      gate: { reason: string; hardBlockers: { slug: string }[] }
    }
    expect(parsed.gate.reason).toBe('hard-blockers')
    expect(parsed.gate.hardBlockers[0]!.slug).toBe('dep')
  })

  // Regression: `computeGate` reads parsed entries only, so a hard blocker
  // written with a marker the parser does not recognise used to yield
  // `{state: 'clear', hard: []}` and an unblocked apply over a real, unshipped
  // dependency. The detector now reports it, and step 2's fast validation fails
  // before the gate is ever computed.
  test('a widened-marker hard blocker fails validation instead of clearing the gate', async () => {
    for (const marker of ['*', '+', '1.', '1)']) {
      const cwd = repo()
      writeChange(cwd, 'dep', 'ci')
      writeChange(cwd, 'c', 'ci', {
        'proposal.md': LITE_PROPOSAL,
        'blocking-changes.md': blockers(`${marker} [ ] \`dep\` — provides x`),
        'tasks.md': DONE_TASKS,
      })
      const r = await runCmd(applyRun, ctx(cwd, ['c'], { command: 'apply' }))
      expect(r.code).toBe(1)
      expect(r.out + r.err).toContain('blockers/entry-grammar')
    }
  })

  test('unconfirmed soft blocker exits 3; --allow-soft acknowledges it', async () => {
    const cwd = repo()
    writeChange(cwd, 'nice', 'ci')
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': blockers('None.', '- [ ] `nice` — degrades gracefully'),
      'tasks.md': DONE_TASKS,
    })
    const soft = await runCmd(applyRun, ctx(cwd, ['c'], { command: 'apply' }))
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
    await runCmd(applyRun, ctx(cwd, ['c'], { json: true, command: 'apply' }))
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
    const r = await runCmd(applyRun, ctx(cwd, ['c'], { command: 'apply' }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('proposal/sections')
  })
})

// Verification 8.2 (design D10): every early exit under `--json` is exactly one
// `{status: [{severity, code, message, fix?}]}` document on stdout, nothing on
// stderr, exit 1 — the code the binary's `instructions apply` reports for the
// same lookups.
describe('apply early exits under --json', () => {
  /** The one failure document `out` must be, its `status[0]`. */
  function oneDocument(r: { code: number; out: string; err: string }): Record<string, unknown> {
    expect(r.code).toBe(1)
    expect(r.err).toBe('')
    const doc = JSON.parse(r.out) as { status: Record<string, unknown>[] }
    expect(Object.keys(doc)).toEqual(['status'])
    expect(doc.status).toHaveLength(1)
    const [entry] = doc.status
    expect(Object.keys(entry!).filter((k) => k !== 'fix')).toEqual(['severity', 'code', 'message'])
    expect(entry).toMatchObject({ severity: 'error', code: 'change_error' })
    expect(r.out).toBe(`${JSON.stringify(doc, null, 2)}\n`)
    return entry!
  }

  const json = (cwd: string, args: string[]) => ctx(cwd, args, { json: true, command: 'apply' })

  test('no openspec/ directory', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-uninit-'))
    roots.push(cwd)
    const r = await withEmptyMachineState(() => runCmd(applyRun, json(cwd, ['foo'])))
    expect(String(oneDocument(r).message)).toContain('no openspec/ directory')
  })

  test('an unknown change, with its suggestion folded into the message', async () => {
    const cwd = repo()
    writeChange(cwd, 'add-widget', 'ci')
    const r = await withEmptyMachineState(() => runCmd(applyRun, json(cwd, ['add-widgets'])))
    expect(oneDocument(r).message).toBe("unknown change 'add-widgets'. Did you mean 'add-widget'?")
  })

  test('an unknown change with no suggestion', async () => {
    const cwd = repo()
    const r = await withEmptyMachineState(() => runCmd(applyRun, json(cwd, ['nope'])))
    expect(oneDocument(r).message).toBe("unknown change 'nope'")
  })

  test('a failed legacy delegation', async () => {
    const cwd = repo()
    // A project schema that exists (so the change is legacy) but does not load.
    const dir = join(cwd, 'openspec', 'schemas', 'broken')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'schema.yaml'), 'name: broken\n')
    writeChange(cwd, 'legacy', 'broken', { 'proposal.md': LITE_PROPOSAL })
    const r = await withEmptyMachineState(() => runCmd(applyRun, json(cwd, ['legacy'])))
    // The binary's own refusal is the answer (verification 16.11), not the wrapper's.
    const message = String(oneDocument(r).message)
    expect(message).toStartWith('Invalid schema at ')
    expect(message).toContain(join('schemas', 'broken', 'schema.yaml'))
  })

  test('a failed step-5 call', async () => {
    // Every gate step clears, and the wrapped `instructions apply` then fails:
    // the root carries no `ci` schema for the binary to resolve.
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-noschema-'))
    roots.push(cwd)
    mkdirSync(join(cwd, 'openspec', 'changes', 'archive'), { recursive: true })
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await withEmptyMachineState(() => runCmd(applyRun, json(cwd, ['c'])))
    // The binary's own refusal is the answer (verification 16.11), not the wrapper's.
    expect(String(oneDocument(r).message)).toStartWith("Unknown schema 'ci'.")
  })
})
