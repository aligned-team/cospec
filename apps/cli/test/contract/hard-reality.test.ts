// Hard reality #1 + MF6 regressions (DESIGN §8.2). openspec's validate hardcodes
// a "must have deltas" rule that false-errors on light changes; cospec suppresses
// it only where satisfying it is definitionally wrong, and forbids specs/ on
// no-specs types instead. README.md must never trip meta/unexpected-file.
//
// Re-probed against the 1.11.0 pin (2026-09-01): the landmine is unchanged.
// Raw `openspec validate --strict` on a delta-less change still exits 1 with
// the literal "Change must have at least one delta" (CHANGE_NO_DELTAS) and
// still hardcodes the "specs/ directory" wording. 1.10.0 APPENDS one more
// sentence to that guidance ("If this change intentionally modifies no specs
// (pure refactor, tooling, docs), set \"skip_specs: true\" in the change's
// .openspec.yaml instead."), on top of 1.5.0's "...Tip: run 'openspec change
// show ... --deltas-only'". Both are additive: the exit code and the sentence
// cospec's suppression logic keys on are untouched, so the assertions below
// still hold verbatim. Note the upstream escape hatch is a per-change marker a
// human must write, while cospec suppresses by SCHEMA — a `ci` change needs no
// marker to validate clean here, which is exactly what the first test pins.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const CI_PROPOSAL = `# add-lint

## Why

The release workflow is missing a lint gate and a broken workflow shipped last
week, so we are adding actionlint before anything else merges.

## What Changes

- Add an actionlint step to the release workflow.

## Impact

- CI workflow only; no application source or specs touched.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS = `## 1. Work

- [ ] 1.1 Add the actionlint step
- [ ] 1.2 Verify the workflow with actionlint
`

const SPEC_DELTA = `## ADDED Requirements

### Requirement: Lint gate

The system SHALL run actionlint on every workflow change.

#### Scenario: Lint runs

- **WHEN** a workflow file changes
- **THEN** actionlint runs
`

function ciChange(root: string, withSpecs: boolean, readme?: string): void {
  const c = 'openspec/changes/add-lint'
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: 'schema: ci\ncreated: 2026-07-03\n',
    [`${c}/proposal.md`]: CI_PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/tasks.md`]: TASKS,
  }
  if (readme !== undefined) files[`${c}/README.md`] = readme
  if (withSpecs) files[`${c}/specs/lint/spec.md`] = SPEC_DELTA
  writeFiles(root, files)
  mkdirSync(join(root, 'openspec/specs'), { recursive: true })
}

async function ruleIds(root: string, name: string): Promise<string[]> {
  const res = await cospec(['validate', name, '--strict', '--json'], { cwd: root })
  try {
    return Object.keys(
      (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } }).summary.byRule,
    )
  } catch {
    return []
  }
}

describe('hard reality #1: specless changes', () => {
  test('ci change without specs: raw openspec fails but cospec passes', async () => {
    const root = mkTempRepo({ git: true })
    ciChange(root, false)
    const raw = await openspec(['validate', 'add-lint', '--strict'], root)
    expect(raw.exitCode).toBe(1) // CHANGE_NO_DELTAS false-errors here

    const cv = await cospec(['validate', 'add-lint', '--strict'], { cwd: root })
    expect(cv.exitCode).toBe(0)
  })

  test('ci change WITH specs → meta/forbidden-artifact', async () => {
    const root = mkTempRepo({ git: true })
    ciChange(root, true)
    const cv = await cospec(['validate', 'add-lint', '--strict', '--json'], { cwd: root })
    expect(cv.exitCode).toBe(1)
    expect(await ruleIds(root, 'add-lint')).toContain('meta/forbidden-artifact')
  })
})

describe('MF6: README.md whitelist', () => {
  test('the README.md openspec new change writes does not trip meta/unexpected-file', async () => {
    // Produce the exact README.md the real binary emits, then validate as ci.
    const gen = mkTempRepo({ git: true })
    mkdirSync(join(gen, 'openspec/changes/archive'), { recursive: true })
    mkdirSync(join(gen, 'openspec/specs'), { recursive: true })
    await openspec(['new', 'change', 'add-lint', '--description', 'Add a lint gate'], gen)

    const root = mkTempRepo({ git: true })
    ciChange(root, false, '# add-lint\n\nAdd a lint gate\n')
    const rules = await ruleIds(root, 'add-lint')
    expect(rules).not.toContain('meta/unexpected-file')
  })
})
