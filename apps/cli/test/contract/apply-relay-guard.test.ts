// The bare-`openspec` relay guard vs the real pinned binary (plan §7.3,
// §7.6 row 8, as corrected by critique B2/B3).
//
// `commands/apply.ts` relays the wrapped binary's `instruction` and
// `warnings[]` verbatim into both its `--json` payload and its human
// transcript. At 1.13.1 those strings name the `openspec` binary directly, so
// without a guard `cospec apply` hands an agent a command it is not supposed
// to run (CLAUDE.md: every agent-facing OpenSpec access routes through
// `cospec`).
//
// Reachability was re-probed by hand against 1.13.1 before this suite was
// written, because the obvious path is vacuous: on the main lane
// `missingArtifacts()` (Step 3) returns exit 2 before Step 5 ever calls
// `openspec instructions apply`, and an empty `tasks.md` is caught by Step 2's
// fast validation (`tasks/has-tasks` ERROR, exit 1). The paths that DO reach a
// relayed upstream string, each covered below:
//
// (a) a v1-grandfathered change — `enforcedApplyRequires(type, 1)` filters
//     `verification` out, so cospec's gate clears while the binary still
//     returns `state: "blocked"` naming it, and cospec prints its remedy at
//     exit 0. The one main-lane blocked-remedy leak.
// (b) `applyLegacy` — a forked (legacy) schema bypasses the cospec gate
//     entirely and echoes the binary's remedy with no rewriting at all.
// (c) the main lane's clear gate with an unread delta file — the binary's
//     1.13.1 `findUnreadDeltaFiles` warning, which names `openspec validate`.
// (d) `applyLegacy` with a schema whose `apply.requires` omits `specs` — the
//     no-delta-specs warning, the one relayed string that embeds an absolute
//     `…/.openspec.yaml` path beside its command spans. That path must survive
//     byte-identical, which is why the guard anchors on backtick spans rather
//     than on an `openspec ` token.

import { afterAll, describe, expect, test } from 'bun:test'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface ApplyJson {
  apply: { state: string; instruction: string; warnings?: string[] }
}

/**
 * A relayed remedy leaks when a backtick-delimited command span names the
 * `openspec` binary, or when any of the three verbs 1.13.1 emits
 * (`instructions`, `status`, `validate`) follows a bare `openspec` word.
 *
 * Deliberately NOT a bare `openspec` substring check: every payload here
 * legitimately carries `openspec/changes/…` paths and `.openspec.yaml`
 * filenames, and those must survive untouched.
 */
const BACKTICKED = /`openspec[ `]/
const VERB = /\bopenspec (?:instructions|status|validate)\b/

function expectNoBareRelay(text: string): void {
  expect(text).not.toMatch(BACKTICKED)
  expect(text).not.toMatch(VERB)
}

const BLOCKERS_EMPTY = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const SURFACES =
  '## Surfaces\n\n- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)\n'

const PROPOSAL = `# change

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

${SURFACES}`

const DELTA = `## ADDED Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const VERIFICATION = `## 1. Widgets behavior [critical]

- [ ] 1.1 @integration (agent) call the widgets capability -> returns the expected result
`

async function freshRepo(): Promise<string> {
  const root = mkTempRepo({ fixture: 'fresh', git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  return root
}

describe('bare-`openspec` relay guard (OpenSpec 1.13.1)', () => {
  test('(a) a v1-grandfathered change relays the blocked remedy through cospec', async () => {
    const root = await freshRepo()
    const name = 'v1-grandfathered'
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/specs/widgets/spec.md`]: DELTA,
      [`openspec/changes/${name}/tasks.md`]: '## 1. Implementation\n\n- [ ] 1.1 Add the step\n',
    })
    // schemaVersion 1: `enforcedApplyRequires` drops `verification`, so cospec's
    // Step 3 clears while the binary's own apply.requires still names it.
    writeFileSync(
      join(root, `openspec/changes/${name}/.openspec.yaml`),
      'schema: feat\ncreated: 2026-09-22\nschemaVersion: 1\n',
    )

    const json = await cospec(['apply', name, '--json'], { cwd: root })
    expect(json.exitCode).toBe(0)
    const parsed = JSON.parse(json.stdout) as ApplyJson
    // The binary really is blocked here — this is the leak, not a vacuous pass.
    expect(parsed.apply.state).toBe('blocked')
    expect(parsed.apply.instruction).toContain('Missing artifacts: verification.')
    expect(parsed.apply.instruction).toContain(
      `\`cospec instructions verification --change ${name}\``,
    )
    expect(parsed.apply.instruction).toContain(`\`cospec status --change ${name}\``)
    expectNoBareRelay(json.stdout)

    const human = await cospec(['apply', name], { cwd: root })
    expect(human.exitCode).toBe(0)
    expect(human.stdout).toContain(`\`cospec instructions verification --change ${name}\``)
    expectNoBareRelay(human.stdout)
  })

  test('(b) applyLegacy relays the many-artifact remedy through cospec', async () => {
    const root = await freshRepo()
    const fork = await cospec(['schema', 'fork', 'feat', 'legacyish'], { cwd: root })
    expect(fork.exitCode).toBe(0)

    const name = 'legacy-blocked'
    const created = await cospec(['new', 'legacyish', name, '--json'], { cwd: root })
    expect(created.exitCode).toBe(0)
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
    })

    const json = await cospec(['apply', name, '--json'], { cwd: root })
    expect(json.exitCode).toBe(2)
    const parsed = JSON.parse(json.stdout) as ApplyJson
    expect(parsed.apply.state).toBe('blocked')
    expect(parsed.apply.instruction).toContain(
      `\`cospec instructions <artifact> --change ${name}\``,
    )
    expectNoBareRelay(json.stdout)

    const human = await cospec(['apply', name], { cwd: root })
    expect(human.exitCode).toBe(2)
    // The legacy lane's own note names the binary as prose, not as a command
    // span — the guard must leave that alone.
    expect(human.stdout).toContain('delegating to openspec.')
    expect(human.stdout).toContain(`\`cospec instructions <artifact> --change ${name}\``)
    expectNoBareRelay(human.stdout)
  })

  test('(c) the clear gate relays the unread-delta warning, in JSON and in the transcript', async () => {
    const root = await freshRepo()
    const name = 'unread-delta'
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/verification.md`]: VERIFICATION,
      [`openspec/changes/${name}/tasks.md`]: '## 1. Implementation\n\n- [x] 1.1 Add the step\n',
      // One level too shallow to be a capability's spec.md: cospec's own
      // `hasSpecFiles` accepts any .md under specs/, so the gate clears and the
      // binary's stricter `findUnreadDeltaFiles` is what objects.
      [`openspec/changes/${name}/specs/widgets.md`]: DELTA,
    })
    writeFileSync(
      join(root, `openspec/changes/${name}/.openspec.yaml`),
      'schema: feat\ncreated: 2026-09-22\nschemaVersion: 2\n',
    )

    const json = await cospec(['apply', name, '--json'], { cwd: root })
    expect(json.exitCode).toBe(0)
    const parsed = JSON.parse(json.stdout) as ApplyJson
    expect(parsed.apply.warnings).toHaveLength(1)
    expect(parsed.apply.warnings?.[0]).toContain(`\`cospec validate ${name}\``)
    expect(parsed.apply.warnings?.[0]).toContain('specs/widgets.md')
    expectNoBareRelay(json.stdout)

    const human = await cospec(['apply', name], { cwd: root })
    expect(human.exitCode).toBe(0)
    // Warnings reach the human transcript at all only because of this track:
    // before it, `warnings[]` existed solely in `--json`.
    expect(human.stdout).toContain(`Warning: specs/widgets.md is not a capability's spec.md`)
    expect(human.stdout).toContain(`\`cospec validate ${name}\``)
    expectNoBareRelay(human.stdout)
  })

  test('(d) the no-delta-specs warning is relayed with its .openspec.yaml path intact', async () => {
    const root = await freshRepo()
    const fork = await cospec(['schema', 'fork', 'feat', 'nospecgate'], { cwd: root })
    expect(fork.exitCode).toBe(0)

    // Drop `specs` from apply.requires only: the specs ARTIFACT stays declared,
    // so the binary reaches `ready` (not `blocked`, which short-circuits
    // `collectApplyWarnings`) and still has a spec-producing artifact to warn
    // about. This is the only shape that produces the metadataPath warning.
    const schemaPath = join(root, 'openspec/schemas/nospecgate/schema.yaml')
    const schema = readFileSync(schemaPath, 'utf8')
    const patched = schema.replace(
      'requires: [ proposal, blocking-changes, specs, verification, tasks ]',
      'requires: [ proposal, blocking-changes, verification, tasks ]',
    )
    expect(patched).not.toBe(schema) // the substitution must have actually matched
    writeFileSync(schemaPath, patched)

    const name = 'nospec-warn'
    const created = await cospec(['new', 'nospecgate', name, '--json'], { cwd: root })
    expect(created.exitCode).toBe(0)
    writeFiles(root, {
      [`openspec/changes/${name}/proposal.md`]: PROPOSAL,
      [`openspec/changes/${name}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`openspec/changes/${name}/verification.md`]: VERIFICATION,
      [`openspec/changes/${name}/tasks.md`]: '## 1. Implementation\n\n- [ ] 1.1 Add the step\n',
    })

    const json = await cospec(['apply', name, '--json'], { cwd: root })
    expect(json.exitCode).toBe(0)
    const parsed = JSON.parse(json.stdout) as ApplyJson
    const warning = parsed.apply.warnings?.[0]
    expect(warning).toBeDefined()
    expect(warning).toContain(`\`cospec validate ${name}\``)
    expect(warning).toContain(`\`cospec instructions specs --change ${name}\``)
    // The path is real and un-backticked; it must come through byte-identical.
    // `realpathSync` because the binary reports the resolved temp dir
    // (`/private/var/…` on macOS) while `mkTempRepo` hands back the symlink.
    const metaPath = join(realpathSync(root), `openspec/changes/${name}/.openspec.yaml`)
    expect(warning).toContain(`${metaPath} if this change`)
    expect(warning).toContain('`skip_specs: true`')
    expectNoBareRelay(json.stdout)

    const human = await cospec(['apply', name], { cwd: root })
    expect(human.exitCode).toBe(0)
    expect(human.stdout).toContain('Warning: This change has no delta specs')
    expect(human.stdout).toContain(metaPath)
    expectNoBareRelay(human.stdout)
  })
})
