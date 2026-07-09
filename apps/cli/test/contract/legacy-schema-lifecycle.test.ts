// Legacy-lane lifecycle contract test (schema-fork-and-docs-parity §4.1): a
// schema created via `cospec schema fork` flows new -> validate -> apply ->
// archive against the real pinned openspec binary. Locks in the
// schema-customization decision's Option (b): forking rides the existing
// legacy lane, so cospec's schema-agnostic hard gates (tasks,
// scenario-preservation, filesystem-move) still apply while no cospec-typed
// rule family (proposal/*, verification/*, design/*, …) ever fires for it —
// and openspec's OWN `apply.requires` (copied verbatim into the fork) governs
// what "ready" means, unfiltered by cospec's schemaVersion grandfathering.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

let root: string
const FORK_NAME = 'feat-custom'
const SLUG = 'legacy-lifecycle'

const PROPOSAL = `# change

## Why

This capability does not exist yet and the team needs it to complete the flow;
without it the described behavior cannot ship at all, blocking downstream work.

## What Changes

- Introduce the widgets capability described in the spec deltas.

## Impact

- New capability widgets; no breaking changes.
`

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const SPEC_DELTA = `## ADDED Requirements

### Requirement: Widgets behavior

The system SHALL provide the widgets behavior when requested.

#### Scenario: widgets works

- **WHEN** a caller invokes widgets
- **THEN** the expected result is returned
`

const VERIFICATION = `## 1. Widgets behavior [critical]

- [ ] 1.1 @unit (agent) call the widgets capability -> returns the expected result
`

function tasksBody(done: boolean): string {
  const box = done ? 'x' : ' '
  return `## 1. Implementation\n\n- [${box}] 1.1 Add the step\n`
}

beforeAll(async () => {
  root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  // Fork `feat` — its `apply.requires` (proposal/blocking-changes/specs/
  // verification/tasks) is copied verbatim into the fork's schema.yaml, so
  // the lifecycle below exercises openspec's own artifact-gate + the
  // spec-delta merge, not just the tasks-only light types.
  const fork = await cospec(['schema', 'fork', 'feat'], { cwd: root })
  expect(fork.exitCode).toBe(0)
  expect(existsSync(join(root, `openspec/schemas/${FORK_NAME}/schema.yaml`))).toBe(true)
})

describe('legacy lane: a forked schema flows new -> validate -> apply -> archive', () => {
  test('`cospec new` delegates to the fork with reduced guarantees', async () => {
    const res = await cospec(['new', FORK_NAME, SLUG, '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as { legacy: boolean; note: string; type: string }
    expect(parsed.legacy).toBe(true)
    expect(parsed.type).toBe(FORK_NAME)
    expect(parsed.note).toMatch(/reduced cospec guarantees/)
    const yamlPath = join(root, `openspec/changes/${SLUG}/.openspec.yaml`)
    expect(existsSync(yamlPath)).toBe(true)
    const yaml = readFileSync(yamlPath, 'utf8')
    expect(yaml).toMatch(new RegExp(`schema:\\s*${FORK_NAME}`))
    expect(yaml).not.toMatch(/schemaVersion/)
  })

  test('`cospec validate` delegates to openspec structural checks — no cospec-typed rule fires', async () => {
    writeFiles(root, {
      [`openspec/changes/${SLUG}/proposal.md`]: PROPOSAL,
      [`openspec/changes/${SLUG}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${SLUG}/specs/widgets/spec.md`]: SPEC_DELTA,
      [`openspec/changes/${SLUG}/tasks.md`]: tasksBody(false),
      // No verification.md yet — proves cospec's own verification/* rule
      // family never fires for a legacy change (only openspec's raw
      // `apply.requires` cares, and only `apply` reads that, not `validate`).
    })
    const res = await cospec(['validate', SLUG, '--strict', '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const rules = Object.keys(
      (JSON.parse(res.stdout) as { summary: { byRule: Record<string, number> } }).summary.byRule,
    )
    expect(rules).toContain('meta/legacy-schema')
    for (const r of rules) {
      expect(r).not.toMatch(/^proposal\//)
      expect(r).not.toMatch(/^verification\//)
      expect(r).not.toMatch(/^design\//)
      expect(r).not.toMatch(/^specs\//)
    }
  })

  test('`cospec apply` delegates to openspec — its raw apply.requires gates readiness', async () => {
    // verification.md is still missing: openspec's own (unfiltered) apply.requires
    // for the fork includes `verification`, so it blocks — with no cospec
    // schemaVersion grandfathering to exempt it, unlike a canon feat change.
    const before = await cospec(['apply', SLUG, '--json'], { cwd: root })
    expect(before.exitCode).toBe(2)
    const parsedBefore = JSON.parse(before.stdout) as {
      legacy: boolean
      apply: { state: string; missingArtifacts?: string[] }
    }
    expect(parsedBefore.legacy).toBe(true)
    expect(parsedBefore.apply.state).toBe('blocked')
    expect(parsedBefore.apply.missingArtifacts).toContain('verification')

    writeFiles(root, { [`openspec/changes/${SLUG}/verification.md`]: VERIFICATION })
    const after = await cospec(['apply', SLUG, '--json'], { cwd: root })
    expect(after.exitCode).toBe(0)
    const parsedAfter = JSON.parse(after.stdout) as { legacy: boolean; apply: { state: string } }
    expect(parsedAfter.legacy).toBe(true)
    expect(parsedAfter.apply.state).toBe('ready')
  })

  test('`cospec archive` keeps the tasks + filesystem-move gates for a legacy change', async () => {
    // Incomplete tasks still refuse archive even though the schema is legacy.
    const blocked = await cospec(['archive', SLUG], { cwd: root })
    expect(blocked.exitCode).toBe(1)
    expect(existsSync(join(root, `openspec/changes/${SLUG}`))).toBe(true)

    writeFiles(root, { [`openspec/changes/${SLUG}/tasks.md`]: tasksBody(true) })
    const archived = await cospec(['archive', SLUG], { cwd: root })
    expect(archived.exitCode).toBe(0)
    expect(existsSync(join(root, `openspec/changes/${SLUG}`))).toBe(false)
    const entries = readdirSync(join(root, 'openspec/changes/archive'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
    expect(entries.some((d) => d.endsWith(SLUG))).toBe(true)
    // The spec-merge spot-check still runs for a legacy change.
    expect(existsSync(join(root, 'openspec/specs/widgets/spec.md'))).toBe(true)
  })
})
