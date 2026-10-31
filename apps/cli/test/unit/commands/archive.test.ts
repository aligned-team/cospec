// Archive pre-flight gate tests (steps 1–5). These resolve before step 8's
// `openspec archive` spawn, so no wrapped binary is used. The execute/verify/
// spot-check/fan-out steps (8–12) are exercised in lifecycle.test.ts against the
// real binary.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { isRetirementCleanupFailure, run as archiveRun } from '../../../src/commands/archive.ts'
import { diagnostics } from '../../../src/core/archive-output.ts'
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
    const r = await runCmd(archiveRun, ctx(cwd, ['ship-itt'], { command: 'archive' }))
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
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('incomplete task')
    expect(r.err).toContain('--force-incomplete')
  })

  test('today-dated archive slot collision exits 1 before delegating', async () => {
    const cwd = repo()
    const today = new Date().toISOString().slice(0, 10)
    writeArchived(cwd, `${today}-c`, 'ci')
    writeChange(cwd, 'c', 'ci', VALID_CI)
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('already exists')
  })

  // An unfinished task written with a widened list marker was invisible to
  // both the grammar rule and the tasks gate before openspec 1.13.1 parity:
  // `parseTasks` recorded neither an item nor a malformed row, so archive saw
  // an all-complete tasks.md and moved the change.
  test('an unfinished `+ [ ]` task blocks archive with exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': '## 1. G\n\n- [x] 1.1 done\n+ [ ] 1.2 not done yet\n',
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    // Refused by the grammar rule in step 2, ahead of the step 3 tasks gate —
    // and, unlike that gate, `--force-incomplete` does not waive it.
    expect(r.out).toContain('tasks/checkbox-grammar')
    expect(r.out).toContain('- [ ] 1.2 not done yet')
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
    const forced = await runCmd(
      archiveRun,
      ctx(cwd, ['c', '--force-incomplete'], { command: 'archive' }),
    )
    expect(forced.code).toBe(1)
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
  })

  test('a validation error blocks archive with exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'ci', {
      'proposal.md': '## Why\n\nshort\n',
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('proposal/sections')
  })
})

/** A project schema whose tasks artifact is a glob, tracked through `apply.tracks`. */
const MULTI_FILE_SCHEMA = `name: multi
version: 1
description: tasks split across files
artifacts:
  - id: proposal
    generates: proposal.md
    description: Proposal
    template: proposal.md
  - id: tasks
    generates: tasks/*.md
    description: Tasks
    template: tasks.md
    requires:
      - proposal
apply:
  requires:
    - tasks
  tracks: tasks/*.md
`

describe('archive task gate reads every tracked file', () => {
  test('an unchecked task in a second tracked file refuses, naming that file', async () => {
    const cwd = repo()
    mkdirSync(join(cwd, 'openspec', 'schemas', 'multi'), { recursive: true })
    writeFileSync(join(cwd, 'openspec', 'schemas', 'multi', 'schema.yaml'), MULTI_FILE_SCHEMA)
    writeChange(cwd, 'c', 'multi', {
      'proposal.md': LITE_PROPOSAL,
      'tasks/a.md': '## 1. A\n\n- [x] 1.1 done\n',
      'tasks/b.md': '## 2. B\n\n- [ ] 2.1 still open\n',
    })
    // `--no-validate` keeps the legacy schema's delegated validation out of a unit test.
    const r = await runCmd(archiveRun, ctx(cwd, ['c', '--no-validate'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('1 incomplete task(s)')
    expect(r.err).toContain('- [ ] 2.1 still open (tasks/b.md)')
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
  })

  test('a tasks.md beside a tracked glob is not what the gate reads', async () => {
    const cwd = repo()
    mkdirSync(join(cwd, 'openspec', 'schemas', 'multi'), { recursive: true })
    writeFileSync(join(cwd, 'openspec', 'schemas', 'multi', 'schema.yaml'), MULTI_FILE_SCHEMA)
    writeChange(cwd, 'c', 'multi', {
      'proposal.md': LITE_PROPOSAL,
      'tasks/a.md': '## 1. A\n\n- [ ] 1.1 open in the tracked file\n',
      'tasks.md': '## 1. A\n\n- [x] 1.1 done in an untracked file\n',
    })
    const r = await runCmd(archiveRun, ctx(cwd, ['c', '--no-validate'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('open in the tracked file (tasks/a.md)')
  })
})

describe('retirement cleanup failure classification', () => {
  const OUTPUT =
    'Error: Could not finalize the retirement backup at /x (EACCES). The change was archived, but retirement cleanup did not complete. Inspect all reported recovery paths before recovery or cleanup.'

  test("the binary's cleanup failure over a verified move", () => {
    expect(isRetirementCleanupFailure(OUTPUT, { moved: true, targetHasYaml: true })).toBe(true)
  })

  test('its words alone never count without the move on disk', () => {
    expect(isRetirementCleanupFailure(OUTPUT, { moved: false, targetHasYaml: false })).toBe(false)
    expect(isRetirementCleanupFailure(OUTPUT, { moved: true, targetHasYaml: false })).toBe(false)
  })

  test('any other failure is not one', () => {
    expect(isRetirementCleanupFailure('Error: boom', { moved: true, targetHasYaml: true })).toBe(
      false,
    )
  })

  test("its --json code is the binary's", () => {
    expect(diagnostics.retirementCleanupFailed('m').code).toBe('archive_retirement_cleanup_failed')
  })
})

/** Stamp `x-cospec-schema-version: 2` onto a change already written by `writeChange` —
 * the v2 gate (verification enforcement) applies from here on. */
function stampV2(cwd: string, id: string, schema: string): void {
  writeFileSync(
    join(cwd, 'openspec', 'changes', id, '.openspec.yaml'),
    `schema: ${schema}\ncreated: 2026-07-06\nx-cospec-schema-version: 2\n`,
  )
}

const VALID_FIX = {
  'proposal.md': LITE_PROPOSAL,
  'blocking-changes.md': EMPTY_BLOCKERS,
  'tasks.md': DONE_TASKS,
}

describe('archive/verification-incomplete (DESIGN §3.5 step 1)', () => {
  test('a bare unresolved row refuses archive with exit 1, independent of specs', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'fix', {
      ...VALID_FIX,
      'verification.md': [
        '## 1. Bug is fixed',
        '- [x] 1.1 @regression reran the failing case -> now passes',
        '- [ ] 1.2 @unit smoke test -> expected to pass',
      ].join('\n'),
    })
    stampV2(cwd, 'c', 'fix')
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('not fully resolved')
    expect(r.err).toContain('1.2 @unit')
    // No delegation happened — the change must still be in place.
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
  })

  test('a `+`-bulleted ledger refuses archive instead of reporting 0/0 verified', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'fix', {
      ...VALID_FIX,
      'verification.md': [
        '## 1. Bug is fixed',
        '+ [x] 1.1 @regression reran the failing case -> now passes',
        '+ [ ] 1.2 @unit smoke test -> expected to pass',
      ].join('\n'),
    })
    stampV2(cwd, 'c', 'fix')
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.out).toContain('verification/row-grammar')
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
  })

  test('a missing verification.md on an enforced change refuses archive', async () => {
    const cwd = repo()
    writeChange(cwd, 'c', 'fix', VALID_FIX)
    stampV2(cwd, 'c', 'fix')
    const r = await runCmd(archiveRun, ctx(cwd, ['c'], { command: 'archive' }))
    expect(r.code).toBe(1)
    expect(r.err).toContain('does not exist yet')
    expect(existsSync(join(cwd, 'openspec/changes/c'))).toBe(true)
  })
})
