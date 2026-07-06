// `cospec apply` — the enforcedApplyRequires presence filter and the surface
// soft-blocker step (DESIGN §3.3, §3.4, §5). `cospec new` does stamp
// `schemaVersion: 2` (covered in schema-versioning.test.ts); these cases
// hand-author `.openspec.yaml` and the artifacts so every field except the one
// under test is held fixed, exercising the v2 gate deterministically.

import { afterAll, describe, expect, test } from 'bun:test'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
`

const FEAT_PROPOSAL = `# change

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

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const SPEC_DELTA = `## ADDED Requirements

### Requirement: widget behavior

The system SHALL provide the widget behavior when requested.

#### Scenario: widget works

- **WHEN** a caller invokes widget
- **THEN** the expected result is returned
`

/** `.openspec.yaml` stamped at schema version 2 — the v2 gate applies. */
function openspecYamlV2(schema: string): string {
  return `schema: ${schema}\ncreated: 2026-07-05\nschemaVersion: 2\n`
}

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  return root
}

describe('apply gate: enforcedApplyRequires presence filter', () => {
  test('a v2 feat change with no verification.md is blocked (exit 2)', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/needs-verification'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('feat'),
      [`${c}/proposal.md`]: FEAT_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/widget/spec.md`]: SPEC_DELTA,
      [`${c}/tasks.md`]: TASKS_DONE,
    })

    const res = await cospec(['apply', 'needs-verification', '--json'], { cwd: root })
    expect(res.exitCode).toBe(2)
    const payload = JSON.parse(res.stdout) as { gate: { missingArtifacts: string[] } }
    expect(payload.gate.missingArtifacts).toContain('verification')
  })

  test('the same change clears once verification.md exists (with a satisfying row)', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/needs-verification'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('feat'),
      [`${c}/proposal.md`]: FEAT_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/widget/spec.md`]: SPEC_DELTA,
      [`${c}/tasks.md`]: TASKS_DONE,
      [`${c}/verification.md`]:
        '## 1. Widget works end to end [critical]\n- [ ] 1.1 @e2e drive the real flow -> observe the widget\n',
    })

    const res = await cospec(['apply', 'needs-verification', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })
})

describe('apply gate: surface soft-blockers', () => {
  const SURFACE_PROPOSAL = `# change

## Why

Bump the pinned base image to pick up a security fix in the runtime.

## What Changes

- Bump the pin.

## Impact

- Config only; no application source touched.

## Surfaces

- [x] deploy — runtime image pin
- [ ] interactive
- [ ] integration
- [ ] agent-behavior
`

  async function authorPinBump(root: string): Promise<void> {
    const c = 'openspec/changes/pin-bump'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('build'),
      [`${c}/proposal.md`]: SURFACE_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
    })
  }

  test('a build change with deploy checked and no verification.md soft-blocks (exit 3)', async () => {
    const root = await initRepo()
    await authorPinBump(root)

    const res = await cospec(['apply', 'pin-bump', '--json'], { cwd: root })
    expect(res.exitCode).toBe(3)
    const payload = JSON.parse(res.stdout) as {
      gate: { softBlockers: { slug: string; description?: string }[] }
    }
    expect(payload.gate.softBlockers.some((b) => b.slug === 'surface:deploy')).toBe(true)
  })

  test('--allow-soft clears the surface nudge and the gate proceeds (exit 0)', async () => {
    const root = await initRepo()
    await authorPinBump(root)

    const res = await cospec(['apply', 'pin-bump', '--allow-soft', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const payload = JSON.parse(res.stdout) as { gate: { softAcknowledged: string[] } }
    expect(payload.gate.softAcknowledged).toContain('surface:deploy')
  })

  test('build without any Surfaces flag checked never soft-blocks (default stays 2-minute)', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/trivial-pin'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('build'),
      [`${c}/proposal.md`]: `# change\n\n## Why\n\nBump a transitive dev dependency.\n\n## What Changes\n\n- Bump it.\n\n## Impact\n\n- Dev-only; no runtime effect.\n\n## Surfaces\n\n- [ ] interactive\n- [ ] deploy\n- [ ] integration\n- [ ] agent-behavior\n`,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
    })

    const res = await cospec(['apply', 'trivial-pin', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })
})

// The R types (feat/fix/perf/refactor) reach the soft-blocker layer through the
// present-file `design/*` and `verification/*` surface rules — not the O(trig)
// `meta/surface-unmet` path above. These guard that a checked flag whose
// consequence is missing from a present, otherwise-valid artifact folds into
// gate.soft (exit 3) rather than passing clean at exit 0 (the review finding).
describe('apply gate: surface soft-blockers on feat (present-file gaps)', () => {
  function featProposal(flags: { deploy?: boolean; interactive?: boolean }): string {
    const box = (on: boolean | undefined): string => (on === true ? 'x' : ' ')
    return `# change

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

## Surfaces

- [${box(flags.deploy)}] deploy — deploy/runtime topology
- [${box(flags.interactive)}] interactive — a user-visible surface
- [ ] integration
- [ ] agent-behavior
`
  }

  const CRITICAL_E2E =
    '## 1. Widget works end to end [critical]\n- [ ] 1.1 @e2e drive the real flow -> observe the widget\n'
  const CRITICAL_INTEGRATION =
    '## 1. Widget works end to end [critical]\n- [ ] 1.1 @integration exercise the real dependency -> observe the widget\n'

  function authorFeat(root: string, files: Record<string, string>): void {
    const c = 'openspec/changes/widget'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: openspecYamlV2('feat'),
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/widget/spec.md`]: SPEC_DELTA,
      [`${c}/tasks.md`]: TASKS_DONE,
      ...Object.fromEntries(Object.entries(files).map(([k, v]) => [`${c}/${k}`, v])),
    })
  }

  test('deploy flag + design missing ## Operational surface soft-blocks (exit 3)', async () => {
    const root = await initRepo()
    authorFeat(root, {
      'proposal.md': featProposal({ deploy: true }),
      'verification.md': CRITICAL_E2E,
    })

    const res = await cospec(['apply', 'widget', '--json'], { cwd: root })
    expect(res.exitCode).toBe(3)
    const payload = JSON.parse(res.stdout) as { gate: { softBlockers: { slug: string }[] } }
    expect(
      payload.gate.softBlockers.some((b) => b.slug === 'surface:design/operational-surface'),
    ).toBe(true)
  })

  test('--allow-soft clears the feat surface nudge (exit 0)', async () => {
    const root = await initRepo()
    authorFeat(root, {
      'proposal.md': featProposal({ deploy: true }),
      'verification.md': CRITICAL_E2E,
    })

    const res = await cospec(['apply', 'widget', '--allow-soft', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })

  test('interactive flag + verification lacking a @manual/@e2e row soft-blocks (exit 3)', async () => {
    const root = await initRepo()
    // A present ## Operational surface isolates the verification/interactive
    // -required nudge (interactive also demands that design section otherwise).
    authorFeat(root, {
      'proposal.md': featProposal({ interactive: true }),
      'design.md':
        '# Design\n\n## Operational surface\n\nBinds 0.0.0.0:8080 in-container; needs WIDGET_SECRET.\n',
      'verification.md': CRITICAL_INTEGRATION,
    })

    const res = await cospec(['apply', 'widget', '--json'], { cwd: root })
    expect(res.exitCode).toBe(3)
    const payload = JSON.parse(res.stdout) as { gate: { softBlockers: { slug: string }[] } }
    expect(
      payload.gate.softBlockers.some((b) => b.slug === 'surface:verification/interactive-required'),
    ).toBe(true)
  })
})
