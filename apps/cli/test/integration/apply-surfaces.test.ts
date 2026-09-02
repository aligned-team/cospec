// `cospec apply` — the enforcedApplyRequires presence filter and the surface
// soft-blocker step (DESIGN §3.3, §3.4, §5). `cospec new` does stamp
// `schemaVersion: 2` (covered in schema-versioning.test.ts); these cases
// hand-author `.openspec.yaml` and the artifacts so every field except the one
// under test is held fixed, exercising the v2 gate deterministically.

import { afterAll, describe, expect, test } from 'bun:test'

import { parseTasks } from '../../src/core/tasks.ts'
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

const LITE_CI_PROPOSAL = `# change

## Why

Bump a pinned CI script version.

## What Changes

- Adjust the workflow.

## Impact

- CI only; no application source touched.

## Surfaces

- [ ] deploy
- [ ] interactive
- [ ] integration
- [ ] agent-behavior
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

// `skip_specs` apply-gate parity (DESIGN §5, OpenSpec 1.7 parity, W7). Precedence:
// CLI flag > persisted `.openspec.yaml` marker > structural default (a
// spec-bearing type must show deltas). The conflict case — a marker declared
// alongside real files under `specs/` — is a validate-time concern, not this
// gate's; these cases hold `specs/` empty throughout.
describe('apply gate: skip_specs satisfies the specs requirement', () => {
  const CRITICAL_E2E =
    '## 1. Widget works end to end [critical]\n- [ ] 1.1 @e2e drive the real flow -> observe the widget\n'

  function authorFeatNoSpecs(root: string, extraYaml: string): void {
    const c = 'openspec/changes/no-deltas'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: `schema: feat\ncreated: 2026-07-05\nschemaVersion: 2\n${extraYaml}`,
      [`${c}/proposal.md`]: FEAT_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: TASKS_DONE,
      [`${c}/verification.md`]: CRITICAL_E2E,
    })
  }

  test('structural default: a feat change with no specs/ deltas and no marker is blocked on specs', async () => {
    const root = await initRepo()
    authorFeatNoSpecs(root, '')

    const res = await cospec(['apply', 'no-deltas', '--json'], { cwd: root })
    expect(res.exitCode).toBe(2)
    const payload = JSON.parse(res.stdout) as { gate: { missingArtifacts: string[] } }
    expect(payload.gate.missingArtifacts).toContain('specs')
  })

  test('persisted skip_specs: true satisfies specs with an empty specs/ (exit 0)', async () => {
    const root = await initRepo()
    authorFeatNoSpecs(root, 'skip_specs: true\n')

    const res = await cospec(['apply', 'no-deltas', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })

  test('the one-shot --skip-specs CLI flag satisfies specs without a persisted marker (exit 0)', async () => {
    const root = await initRepo()
    authorFeatNoSpecs(root, '')

    const res = await cospec(['apply', 'no-deltas', '--skip-specs', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
  })
})

// W21 — reconciling cospec's own task count (`core/tasks.ts parseTasks`, flat
// `- [ ] N.M` lines only) with the wrapped `openspec instructions apply --json`
// payload's `progress`/`tasks` (1.8+ nested-checkbox-aware counting, merged
// verbatim into cospec's own `--json` at step 6). Resolution: cospec's own
// tasks.md grammar is deliberately flat (DESIGN §3.1) and `tasks/checkbox-
// grammar` is an ERROR that fast validation (apply step 2) always runs, so a
// tasks.md with a nested/indented checkbox never reaches step 6 (the merged
// payload) in the first place — it is blocked before `instr.progress` is ever
// read. On every tasks.md that *does* reach the clear gate, both counters
// therefore agree, because there is nothing nested left to disagree about.
describe('apply gate: cospec/wrapped task-count reconciliation (W21)', () => {
  const V2_YAML = 'schema: ci\ncreated: 2026-07-05\nschemaVersion: 2\n'

  test('a nested checkbox is blocked at fast validation, before the wrapped call ever runs', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/nested-tasks'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: V2_YAML,
      [`${c}/proposal.md`]: LITE_CI_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]:
        '## 1. Implementation\n\n- [ ] 1.1 Implement the capability\n  - [ ] 1.1.1 A nested sub-task\n',
    })

    const res = await cospec(['apply', 'nested-tasks', '--json'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const payload = JSON.parse(res.stdout) as { items: { issues: { rule: string }[] }[] }
    expect(payload.items[0]?.issues.some((i) => i.rule === 'tasks/checkbox-grammar')).toBe(true)
    // Never got as far as the merged apply payload the wrapped call would add.
    expect(res.stdout).not.toContain('"progress"')
  })

  test("a flat tasks.md that clears the gate: cospec's count matches the wrapped payload's", async () => {
    const root = await initRepo()
    const c = 'openspec/changes/flat-tasks'
    const tasksText =
      '## 1. Implementation\n\n- [x] 1.1 Implement the capability\n- [ ] 1.2 Write tests\n'
    writeFiles(root, {
      [`${c}/.openspec.yaml`]: V2_YAML,
      [`${c}/proposal.md`]: LITE_CI_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/tasks.md`]: tasksText,
    })

    const res = await cospec(['apply', 'flat-tasks', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const payload = JSON.parse(res.stdout) as {
      apply: { progress: { total: number; complete: number } }
    }
    const cospecCount = parseTasks(tasksText)
    expect(payload.apply.progress.total).toBe(cospecCount.items.length)
    expect(payload.apply.progress.complete).toBe(cospecCount.items.filter((t) => t.checked).length)
  })
})
