// `archiveReady` follows the verification gate (issue #67): a change whose
// `verification.md` still has unresolved or malformed rows is not archive-ready,
// because `cospec archive` would refuse it with `archive/verification-incomplete`.

import { afterAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'

import { isArchiveReady } from '../../../src/commands/apply.ts'
import { computeStatus } from '../../../src/commands/status.ts'
import {
  computeVerificationVerdict,
  readVerificationVerdict,
} from '../../../src/core/verification.ts'
import { DONE_TASKS, EMPTY_BLOCKERS, LITE_PROPOSAL, makeRepo, writeChange } from './helpers.ts'

const roots: string[] = []
function repo(): string {
  const dir = makeRepo()
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const UNRESOLVED = `# Verification

## 1. Empty input is handled [critical]

- [ ] 1.1 @regression (agent) run the widget with empty input -> no crash after
`

const RESOLVED = `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after
- [~] 1.2 @manual (human) try it in a browser -> defer: no browser in CI
`

const MALFORMED = `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after
- [x] 1.2 a row with no layer and no owner
`

/** A schemaVersion-2 `fix` change: its verification.md is enforced like the gates enforce it. */
function fixChange(cwd: string, verification: string | undefined) {
  const dir = writeChange(cwd, 'c', 'fix', {
    'proposal.md': LITE_PROPOSAL,
    'blocking-changes.md': EMPTY_BLOCKERS,
    'tasks.md': DONE_TASKS,
    ...(verification === undefined ? {} : { 'verification.md': verification }),
  })
  return { id: 'c', dir, schema: 'fix', schemaVersion: 2 }
}

describe('computeStatus: archiveReady follows the verification gate', () => {
  test('a bare [ ] row is not archive-ready and is named in blockedReasons', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, UNRESOLVED))
    expect(status.archiveReady).toBe(false)
    expect(status.verification.blockedReasons).toEqual(['1 row(s) still unresolved (bare [ ])'])
  })

  test('every row [x] or [~] defer is archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, RESOLVED))
    expect(status.verification.blockedReasons).toEqual([])
    expect(status.archiveReady).toBe(true)
  })

  test('a row that does not parse is not archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, MALFORMED))
    expect(status.archiveReady).toBe(false)
    expect(status.verification.blockedReasons).toEqual(['1 row(s) do not parse'])
  })

  test('a missing verification.md on an enforcing type is not archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, undefined))
    expect(status.archiveReady).toBe(false)
  })

  test('a v1 fix change with no verification.md stays archive-ready (grandfathered)', () => {
    const cwd = repo()
    const { dir } = fixChange(cwd, undefined)
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'fix' })
    expect(status.verification.declared).toBe(false)
    expect(status.archiveReady).toBe(true)
  })

  test('a ci change is unaffected by verification', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'ci', schemaVersion: 2 })
    expect(status.verification.declared).toBe(false)
    expect(status.archiveReady).toBe(true)
  })
})

describe('isArchiveReady', () => {
  const clear = { state: 'clear' as const, hard: [], soft: [] }
  const blocked = { state: 'blocked' as const, hard: [{ slug: 'a', active: true }], soft: [] }
  const ok = { total: 1, complete: 1 }

  test('is the conjunction of required artifacts, tasks, gate and verification', () => {
    const verdict = computeVerificationVerdict(false, undefined)
    expect(isArchiveReady({ requiredDone: true, tasks: ok, gate: clear, verdict })).toBe(true)
    expect(isArchiveReady({ requiredDone: false, tasks: ok, gate: clear, verdict })).toBe(false)
    expect(
      isArchiveReady({
        requiredDone: true,
        tasks: { total: 0, complete: 0 },
        gate: clear,
        verdict,
      }),
    ).toBe(false)
    expect(
      isArchiveReady({
        requiredDone: true,
        tasks: { total: 2, complete: 1 },
        gate: clear,
        verdict,
      }),
    ).toBe(false)
    expect(isArchiveReady({ requiredDone: true, tasks: ok, gate: blocked, verdict })).toBe(false)
    expect(
      isArchiveReady({
        requiredDone: true,
        tasks: ok,
        gate: clear,
        verdict: { ...verdict, declared: true, blockedReasons: ['1 row(s) do not parse'] },
      }),
    ).toBe(false)
  })
})

describe('readVerificationVerdict', () => {
  test('reads verification.md when the type enforces it, and nothing otherwise', () => {
    const cwd = repo()
    const { dir } = fixChange(cwd, UNRESOLVED)
    expect(readVerificationVerdict(dir, true).unresolved).toBe(1)
    expect(readVerificationVerdict(dir, false).declared).toBe(false)
  })
})
