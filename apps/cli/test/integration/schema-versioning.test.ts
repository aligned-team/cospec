// Group 9 — schemaVersion stamping, migrate, doctor, and the status --json
// verification verdict (DESIGN §5, §3.6). Drives the real CLI end to end.

import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const CI_PROPOSAL = `# change

## Why

The pipeline is missing a step and we are adding it now.

## What Changes

- Add the step.

## Impact

- Config only; no application source touched.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Add the step
`

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  return root
}

describe('cospec new: schemaVersion stamping', () => {
  test('a newly created change is stamped schemaVersion: 2', async () => {
    const root = await initRepo()
    const res = await cospec(['new', 'ci', 'bump-image'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const yaml = readFileSync(join(root, 'openspec/changes/bump-image/.openspec.yaml'), 'utf8')
    expect(yaml).toMatch(/schemaVersion:\s*2/)
    expect(yaml).toMatch(/schema:\s*ci/)
  })
})

describe('cospec migrate', () => {
  function authorV1Feat(root: string, name: string): void {
    const c = `openspec/changes/${name}`
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-01\n',
      [`${c}/proposal.md`]: `# change

## Why

This capability does not exist yet and the team needs it end to end; without it
the described behavior cannot ship at all, blocking downstream work.

## What Changes

- Introduce the widget capability.

## Capabilities

### New Capabilities

- widget

## Impact

- New capability widget; no breaking changes.
`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/widget/spec.md`]: `## ADDED Requirements

### Requirement: widget behavior

The system SHALL provide the widget behavior when requested.

#### Scenario: widget works

- **WHEN** a caller invokes widget
- **THEN** the expected result is returned
`,
      [`${c}/tasks.md`]: TASKS_DONE,
    })
  }

  test('scaffolds a fully-deferred verification.md and bumps schemaVersion to 2', async () => {
    const root = await initRepo()
    authorV1Feat(root, 'legacy-widget')

    const res = await cospec(['migrate', 'legacy-widget'], { cwd: root })
    expect(res.exitCode).toBe(0)

    const yaml = readFileSync(join(root, 'openspec/changes/legacy-widget/.openspec.yaml'), 'utf8')
    expect(yaml).toMatch(/schemaVersion:\s*2/)

    const verification = readFileSync(
      join(root, 'openspec/changes/legacy-widget/verification.md'),
      'utf8',
    )
    // Every row is deferred with the standard pre-v2 reason; no bare `[ ]` rows survive.
    expect(verification).not.toMatch(/^-\s*\[ \]/m)
    expect(verification).toMatch(/\[~\].*defer: pre-v2 change, verified out-of-band/)

    // The migrated verification.md must itself parse cleanly (row grammar holds).
    const validated = await cospec(['validate', 'legacy-widget', '--strict', '--json'], {
      cwd: root,
    })
    const parsed = JSON.parse(validated.stdout) as { items: { issues: { rule: string }[] }[] }
    const rules = parsed.items[0]!.issues.map((i) => i.rule)
    expect(rules.filter((r) => r.startsWith('verification/'))).toEqual([])
  })

  test('is never automatic — a v1 change stays v1 through other commands', async () => {
    const root = await initRepo()
    authorV1Feat(root, 'untouched-widget')
    await cospec(['validate', 'untouched-widget'], { cwd: root })
    await cospec(['status', '--change', 'untouched-widget'], { cwd: root })
    const yaml = readFileSync(
      join(root, 'openspec/changes/untouched-widget/.openspec.yaml'),
      'utf8',
    )
    expect(yaml).not.toMatch(/schemaVersion/)
  })

  test('re-running migrate on an already-v2 change is a no-op success', async () => {
    const root = await initRepo()
    await cospec(['new', 'ci', 'already-v2'], { cwd: root })
    const res = await cospec(['migrate', 'already-v2'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('already on schemaVersion')
  })
})

describe('cospec doctor: pre-v2 changes', () => {
  test('lists an active v1 change', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/old-ci-change'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: ci\ncreated: 2026-07-01\n',
      [`${c}/proposal.md`]: CI_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
    })
    const res = await cospec(['doctor', '--json'], { cwd: root })
    const parsed = JSON.parse(res.stdout) as {
      findings: { check: string; message: string }[]
    }
    expect(
      parsed.findings.some(
        (f) => f.check === 'schema-version' && f.message.includes('old-ci-change'),
      ),
    ).toBe(true)
  })

  test('does not list a schemaVersion 2 change', async () => {
    const root = await initRepo()
    await cospec(['new', 'ci', 'fresh-ci-change'], { cwd: root })
    const res = await cospec(['doctor', '--json'], { cwd: root })
    const parsed = JSON.parse(res.stdout) as {
      findings: { check: string; message: string }[]
    }
    expect(
      parsed.findings.some(
        (f) => f.check === 'schema-version' && f.message.includes('fresh-ci-change'),
      ),
    ).toBe(false)
  })
})

describe('cospec status --json: verification verdict', () => {
  test('reports the declared, total, verified, deferred, unresolved, ciUncatchable, blockedReasons shape', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/status-check'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: fix\ncreated: 2026-07-06\nschemaVersion: 2\n',
      [`${c}/proposal.md`]: `# change

## Why

A mocked handler returned 200 regardless of input; this fix calls the real
dependency so the failure actually reproduces before the fix and passes after.

## What Changes

- Call the real dependency.

## Impact

- No breaking changes.
`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
      [`${c}/verification.md`]: [
        '## 1. Bug is fixed',
        '- [x] 1.1 @regression reran the failing case -> now passes',
        '- [~] 1.2 @manual exploratory check -> defer: no browser in CI',
        '- [ ] 1.3 @unit smoke test -> expected',
      ].join('\n'),
    })

    const res = await cospec(['status', '--change', 'status-check', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as {
      verification: {
        declared: boolean
        total: number
        verified: number
        deferred: number
        unresolved: number
        ciUncatchable: number
        blockedReasons: string[]
      }
    }
    expect(parsed.verification).toEqual({
      declared: true,
      total: 3,
      verified: 1,
      deferred: 1,
      unresolved: 1,
      ciUncatchable: 1,
      blockedReasons: ['1 row(s) still unresolved (bare [ ])'],
    })
  })

  test('a light type with verification Forbidden reports declared: false', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/docs-check'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: docs\ncreated: 2026-07-06\nschemaVersion: 2\n',
      [`${c}/proposal.md`]: `# change

## Why

The README is out of date.

## What Changes

- Fix the README.

## Impact

- Docs only.
`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
    })

    const res = await cospec(['status', '--change', 'docs-check', '--json'], { cwd: root })
    const parsed = JSON.parse(res.stdout) as { verification: { declared: boolean } }
    expect(parsed.verification.declared).toBe(false)
  })

  test('status never gates on verification (exits 0 with unresolved rows)', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/unresolved-status'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: fix\ncreated: 2026-07-06\nschemaVersion: 2\n',
      [`${c}/proposal.md`]: `# change

## Why

A mocked handler returned 200 regardless of input; this fix calls the real
dependency so the failure actually reproduces before the fix and passes after.

## What Changes

- Call the real dependency.

## Impact

- No breaking changes.
`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
      [`${c}/verification.md`]: '## 1. G\n- [ ] 1.1 @regression not run yet -> expected\n',
    })
    const res = await cospec(['status', '--change', 'unresolved-status', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })

  test('a v1 feat change with no verification.md reports archiveReady, matching the grandfathered gate', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/v1-feat'
    // No schemaVersion key ⇒ treated as v1: verification is grandfathered out of
    // enforcement, so status must agree with apply/archive and not report the
    // change verification-blocked / not-archive-ready.
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
      [`${c}/proposal.md`]: `# change

## Why

This capability does not exist yet and the team needs it end to end; without it
the described behavior cannot ship at all, blocking downstream work.

## What Changes

- Introduce the widget capability described in the spec deltas.

## Capabilities

### New Capabilities

- widget

## Impact

- New capability widget; no breaking changes.
`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/widget/spec.md`]: `## ADDED Requirements

### Requirement: widget behavior

The system SHALL provide the widget behavior when requested.

#### Scenario: widget works

- **WHEN** a caller invokes widget
- **THEN** the expected result is returned
`,
      [`${c}/tasks.md`]: `## 1. Implementation

- [x] 1.1 Implement the widget
`,
    })

    const res = await cospec(['status', '--change', 'v1-feat', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as {
      archiveReady: boolean
      verification: { declared: boolean }
    }
    expect(parsed.verification.declared).toBe(false)
    expect(parsed.archiveReady).toBe(true)
  })
})
