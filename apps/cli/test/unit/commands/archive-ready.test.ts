// `archiveReady` follows the verification gate (issue #67): a change whose
// `verification.md` still has unresolved or malformed rows is not archive-ready,
// because `cospec archive` would refuse it with `archive/verification-incomplete`.

import { afterAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'

import { isArchiveReady } from '../../../src/commands/apply.ts'
import { computeStatus } from '../../../src/commands/status.ts'
import { readVerificationVerdict } from '../../../src/core/verification-verdict.ts'
import { computeVerificationVerdict } from '../../../src/core/verification.ts'
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

const DEFERRED_NO_REASON = `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after
- [~] 1.2 @manual (human) try it in a browser -> nope
`

const EMPTY_GROUP = `# Verification

## 1. Empty input is handled [critical]

- [x] 1.1 @regression (agent) run the widget with empty input -> no crash after

## 2. Nothing is listed here
`

describe('computeStatus: archiveReady follows the ledger errors archive validates', () => {
  test('a deferred row with no `defer:` reason is not archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, DEFERRED_NO_REASON))
    expect(status.archiveReady).toBe(false)
    expect(status.verification.unresolved).toBe(0)
    expect(status.verification.blockedReasons).toHaveLength(1)
    expect(status.verification.blockedReasons[0]).toContain('verification/deferred-reason (line 6)')
  })

  test('a group with no rows is not archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, EMPTY_GROUP))
    expect(status.archiveReady).toBe(false)
    expect(status.verification.blockedReasons).toHaveLength(1)
    expect(status.verification.blockedReasons[0]).toContain('verification/structure (line 7)')
  })

  test('a fix with no @regression row is not archive-ready', () => {
    const cwd = repo()
    const ledger = RESOLVED.replace('@regression', '@e2e')
    const status = computeStatus(cwd, fixChange(cwd, ledger))
    expect(status.archiveReady).toBe(false)
    expect(status.verification.blockedReasons[0]).toContain('verification/reproduces-bug')
  })

  test('a row that does not parse is named once, not again as row-grammar', () => {
    const cwd = repo()
    const status = computeStatus(cwd, fixChange(cwd, MALFORMED))
    expect(status.verification.blockedReasons).toEqual(['1 row(s) do not parse'])
  })

  test('a surface-promoted row rule is a warning for archive, so it does not block', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'fix', {
      'proposal.md': LITE_PROPOSAL.replace('- [ ] interactive', '- [x] interactive'),
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
      'verification.md': RESOLVED.replace('@manual', '@unit'),
    })
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'fix', schemaVersion: 2 })
    expect(status.verification.blockedReasons).toEqual([])
    expect(status.archiveReady).toBe(true)
  })
})

/** A change whose type declares `verification` without requiring it, or a v1 change. */
function unenforcedChange(cwd: string, schema: string, schemaVersion: number, ledger: string) {
  const dir = writeChange(cwd, 'c', schema, {
    'proposal.md': LITE_PROPOSAL,
    'blocking-changes.md': EMPTY_BLOCKERS,
    'tasks.md': DONE_TASKS,
    'verification.md': ledger,
  })
  return { id: 'c', dir, schema, schemaVersion }
}

describe('computeStatus: a declared-but-unenforced ledger is still validated like archive does', () => {
  for (const schema of ['build', 'ci', 'revert']) {
    test(`a ${schema} ledger with a deferred row and no reason is not archive-ready`, () => {
      const cwd = repo()
      const status = computeStatus(cwd, unenforcedChange(cwd, schema, 2, DEFERRED_NO_REASON))
      expect(status.verification.declared).toBe(false)
      expect(status.archiveReady).toBe(false)
      expect(status.verification.blockedReasons).toHaveLength(1)
      expect(status.verification.blockedReasons[0]).toContain(
        'verification/deferred-reason (line 6)',
      )
    })

    test(`a ${schema} ledger with an empty group is not archive-ready`, () => {
      const cwd = repo()
      const status = computeStatus(cwd, unenforcedChange(cwd, schema, 2, EMPTY_GROUP))
      expect(status.archiveReady).toBe(false)
      expect(status.verification.blockedReasons[0]).toContain('verification/structure (line 7)')
    })

    test(`a ${schema} ledger with an unresolved row stays archive-ready (not enforced)`, () => {
      const cwd = repo()
      const status = computeStatus(cwd, unenforcedChange(cwd, schema, 2, UNRESOLVED))
      expect(status.verification.blockedReasons).toEqual([])
      expect(status.archiveReady).toBe(true)
    })
  }

  test('a v1 fix ledger with an empty group is not archive-ready', () => {
    const cwd = repo()
    const status = computeStatus(cwd, unenforcedChange(cwd, 'fix', 1, EMPTY_GROUP))
    expect(status.verification.declared).toBe(false)
    expect(status.archiveReady).toBe(false)
    expect(status.verification.blockedReasons[0]).toContain('verification/structure (line 7)')
  })

  test('a v1 fix ledger is not held to the v2 per-type rows', () => {
    const cwd = repo()
    const ledger = RESOLVED.replace('@regression', '@e2e')
    const status = computeStatus(cwd, unenforcedChange(cwd, 'fix', 1, ledger))
    expect(status.verification.blockedReasons).toEqual([])
    expect(status.archiveReady).toBe(true)
  })

  test('a type that forbids verification never reads a stray ledger', () => {
    const cwd = repo()
    const status = computeStatus(cwd, unenforcedChange(cwd, 'chore', 2, DEFERRED_NO_REASON))
    expect(status.verification.blockedReasons).toEqual([])
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
    const change = { id: 'c', schema: 'fix' }
    expect(readVerificationVerdict(dir, change, ['verification']).unresolved).toBe(1)
    expect(readVerificationVerdict(dir, change, ['proposal']).declared).toBe(false)
    expect(readVerificationVerdict(dir, change, ['proposal']).blockedReasons).toEqual([])
  })
})
