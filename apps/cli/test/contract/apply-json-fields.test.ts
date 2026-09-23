// `ApplyInstructionsJson.warnings` / `.missingPrerequisites` (1.13.0/1.13.1)
// vs the real pinned binary (plan §7.2, §7.6 rows 6-7, §10 skip_specs row).
//
// cospec spreads `openspec instructions apply --json`'s payload verbatim into
// the JSON output's `apply` key, on both the main gate's clear-gate path and
// the legacy lane's delegation — `commands/apply.ts` never re-derives these
// fields, so this suite pins the SHAPE cospec's own `ApplyInstructionsJson`
// type now declares them with (`core/openspec.ts`) against what the real
// binary actually emits, not against cospec logic.
//
// Three scenarios, each re-probed by hand against 1.13.1 before being pinned
// here:
//
// (a) A change on a FORKED schema (the legacy lane, where cospec runs no rule
//     family of its own) carrying a delta file that is NOT at its capability's
//     `spec.md` → the real binary's `findUnreadDeltaFiles` reports it and
//     `apply.warnings` carries that string, exit 0. On a cospec-typed change
//     the same file never gets that far any more: `deltas/unread-file` refuses
//     it at Step 2, which the second half of (a) pins.
// (b) A legacy (forked) schema whose `tasks` artifact requires `design` even
//     though `design` is not itself in `apply.requires` — the real binary's
//     `collectMissingPrerequisites` walks the artifact graph transitively,
//     so `apply.missingPrerequisites` names `design` too while
//     `apply.missingArtifacts` (apply.requires-only) does not: a strict
//     superset, exit 2 (blocked).
// (c) A change cospec correctly resolves as `skip_specs` (no specs/ dir at
//     all): the real binary's `collectApplyWarnings` returns early when the
//     specs artifact is in `skippedArtifacts`, so no "no delta specs" warning
//     is emitted to contradict cospec's own precedence — `apply.warnings` is
//     absent, exit 0.

import { afterAll, describe, expect, test } from 'bun:test'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface ApplyJson {
  apply: {
    state: string
    warnings?: string[]
    missingArtifacts?: string[]
    missingPrerequisites?: string[]
  }
}

function surfacesSection(): string {
  return '## Surfaces\n\n- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)\n'
}

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

describe('apply.warnings / apply.missingPrerequisites (OpenSpec 1.13.1)', () => {
  test('(a) an unread delta file surfaces apply.warnings on the legacy lane, exit 0', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
    expect(init.exitCode).toBe(0)
    // A fork of `feat`: same artifacts, but an id cospec does not classify as
    // one of its 11 types, so `apply` takes the legacy lane and delegates
    // without running `deltas/unread-file`. That is the only lane left where
    // this warning reaches a user — see the second half of this test.
    const fork = await cospec(['schema', 'fork', 'feat', 'unreadlane'], { cwd: root })
    expect(fork.exitCode).toBe(0)

    const name = 'unread-delta-warning'
    const newRes = await cospec(['new', 'unreadlane', name, '--json'], { cwd: root })
    expect(newRes.exitCode).toBe(0)
    const proposal = `# change

## Why

This capability does not exist yet and the team needs it; without it downstream
work cannot proceed at all.

## What Changes

- Introduce the widgets capability described in the spec deltas.

## Capabilities

### New Capabilities

- widgets

## Impact

- New capability; no breaking changes.

${surfacesSection()}`
    const verification = `## 1. Widgets behavior [critical]

- [ ] 1.1 @integration (agent) call the widgets capability -> returns the expected result
`
    // A real delta (ADDED Requirements section present) at specs/widgets.md —
    // one level too shallow to be a capability's spec.md. The artifact graph's
    // recursive specs/**/*.md glob counts it as written on both sides, so the
    // gate clears and only `findUnreadDeltaFiles` objects.
    const delta = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: proposal,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/verification.md`]: verification,
      [`openspec/changes/${name}/tasks.md`]: `## 1. Implementation\n\n- [x] 1.1 Add the step\n`,
      [`openspec/changes/${name}/specs/widgets.md`]: delta,
    })

    const res = await cospec(['apply', name, '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as ApplyJson
    expect(parsed.apply.warnings).toBeDefined()
    expect(parsed.apply.warnings).toHaveLength(1)
    expect(parsed.apply.warnings?.[0]).toContain('specs/widgets.md')
    expect(parsed.apply.warnings?.[0]).toContain("is not a capability's spec.md")

    // The same change on cospec's own `feat` schema: refused at Step 2, so the
    // advisory warning is no longer the only thing standing between the author
    // and an archive that merges nothing.
    writeFileSync(
      join(root, `openspec/changes/${name}/.openspec.yaml`),
      'schema: feat\ncreated: 2026-09-22\nschemaVersion: 2\n',
    )
    const typed = await cospec(['apply', name, '--json'], { cwd: root })
    expect(typed.exitCode).toBe(1)
    expect(typed.stdout).toContain('deltas/unread-file')
  })

  test('(b) a legacy schema with a transitive-only artifact dependency: missingPrerequisites is a strict superset of missingArtifacts, exit 2', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
    expect(init.exitCode).toBe(0)

    const fork = await cospec(['schema', 'fork', 'feat', 'multihop'], { cwd: root })
    expect(fork.exitCode).toBe(0)

    // Add `design` as a transitive-only dependency of `tasks`: `design` stays
    // OUT of `apply.requires`, so cospec's own gate never names it, but the
    // real binary's `collectMissingPrerequisites` walks every artifact's
    // `requires` edges — reachable through `tasks` even though `apply.requires`
    // never lists `design` itself.
    const schemaPath = join(root, 'openspec/schemas/multihop/schema.yaml')
    const schema = readFileSync(schemaPath, 'utf8')
    const patched = schema.replace(
      /requires:\s*\[\s*proposal,\s*specs\s*\]/,
      'requires: [ proposal, specs, design ]',
    )
    expect(patched).not.toBe(schema) // the substitution must have actually matched
    writeFileSync(schemaPath, patched)

    const name = 'multihop-gap'
    const newRes = await cospec(['new', 'multihop', name, '--json'], { cwd: root })
    expect(newRes.exitCode).toBe(0)

    const proposal = `# change

## Why

This capability does not exist yet and the team needs it; without it downstream
work cannot proceed at all.

## What Changes

- Introduce the widgets capability described in the spec deltas.

## Impact

- New capability; no breaking changes.
`
    const delta = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`
    const verification = `## 1. Widgets behavior [critical]

- [ ] 1.1 @integration (agent) call the widgets capability -> returns the expected result
`
    // proposal, blocking-changes, specs, verification are all present so
    // cospec's own gate (`apply.requires`) has exactly one gap: `tasks`.
    // `design` and `tasks.md` are both left unwritten.
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: proposal,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/specs/widgets/spec.md`]: delta,
      [`openspec/changes/${name}/verification.md`]: verification,
    })

    const res = await cospec(['apply', name, '--json'], { cwd: root })
    expect(res.exitCode).toBe(2)
    const parsed = JSON.parse(res.stdout) as ApplyJson
    expect(parsed.apply.state).toBe('blocked')
    expect(parsed.apply.missingArtifacts).toEqual(['tasks'])
    expect(parsed.apply.missingPrerequisites).toBeDefined()
    const prereqs = parsed.apply.missingPrerequisites!
    const artifacts = parsed.apply.missingArtifacts!
    // Strict superset: every missingArtifacts entry is in missingPrerequisites,
    // and missingPrerequisites has at least one entry missingArtifacts lacks.
    for (const id of artifacts) expect(prereqs).toContain(id)
    expect(prereqs.length).toBeGreaterThan(artifacts.length)
    expect(prereqs).toContain('design')
  })

  test('(c) a correctly skip_specs change emits no contradicting upstream warning, exit 0', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
    expect(init.exitCode).toBe(0)

    const name = 'skip-specs-clean'
    const newRes = await cospec(['new', 'feat', name, '--json'], { cwd: root })
    expect(newRes.exitCode).toBe(0)
    appendFileSync(join(root, `openspec/changes/${name}/.openspec.yaml`), 'skip_specs: true\n')

    const proposal = `# change

## Why

This is a pure tooling change with no observable behavior; the team needs the
automation regardless of any spec delta.

## What Changes

- Tooling only.

## Capabilities

None.

## Impact

- No capabilities changed.

${surfacesSection()}`
    const verification = `## 1. Tooling behavior [critical]

- [ ] 1.1 @integration (agent) run the tool -> succeeds
`
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: proposal,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/verification.md`]: verification,
      [`openspec/changes/${name}/tasks.md`]: `## 1. Implementation\n\n- [x] 1.1 Add the step\n`,
    })
    // No specs/ directory at all — the durable skip_specs marker written above
    // is cospec's own precedence (DESIGN §5); this asserts the real binary
    // agrees rather than emitting a contradicting "no delta specs" warning.

    const res = await cospec(['apply', name, '--json'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const parsed = JSON.parse(res.stdout) as ApplyJson
    expect(parsed.apply.warnings).toBeUndefined()
  })
})
