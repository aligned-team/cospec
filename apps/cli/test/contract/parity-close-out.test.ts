// Whole-system close-out for the 1.13.1 bump (plan §7.4), probed against the
// REAL pinned binary. Each test names the evidence row it discharges.
//
// Four of these are inherited behaviour — states the bump changed upstream,
// where cospec's job is only to not get in the way. The fifth (the namespace
// folder) is a DEFERRED gap, and the test exists to bound it: it records what
// a user actually sees today so the deferral is a measured one rather than an
// assumption.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  cleanupAll,
  cospec,
  mkTempRepo,
  openspec,
  REPO_ROOT,
  writeFiles,
} from '../fixtures/support.ts'

afterAll(cleanupAll)

const PROPOSAL = `# change

## Why

The widget rendering path is being restated so the spec matches the code that
ships today; without the restatement the capability is documented wrongly.

## What Changes

- Restate the widget rendering requirement.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const BLOCKERS = `# Dependencies

## Blocked by

None.

## Soft-blocked by

None.
`

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Restate the requirement
`

/**
 * `openspec` reads `tracks:` from the composed schema to know which files hold
 * a change's tasks, and honours `retire_capabilities:` only for a change whose
 * `schema:` it can load — with no schema on disk it refuses the retirement
 * with `cannot be honored (schema: unknown schema 'feat')`. Copying this
 * repo's own composed `feat` schema in is the only way to reach either.
 */
function withFeatSchema(root: string): void {
  cpSync(join(REPO_ROOT, 'openspec/schemas/feat'), join(root, 'openspec/schemas/feat'), {
    recursive: true,
  })
}

/** Write a `feat` change carrying the given files under its `specs/`. */
function build(
  root: string,
  name: string,
  specFiles: Record<string, string>,
  yamlExtra = '',
): void {
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: `schema: feat\ncreated: 2026-09-22\n${yamlExtra}`,
    [`${c}/proposal.md`]: PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/tasks.md`]: TASKS_DONE,
  }
  for (const [rel, body] of Object.entries(specFiles)) files[`${c}/specs/${rel}`] = body
  writeFiles(root, files)
}

function livingSpec(requirements: string): string {
  return `# Widgets Specification

## Purpose

Real purpose text for the widgets capability.

## Requirements
${requirements}`
}

const LIVING_REQ = `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

interface ReportIssue {
  level: string
  rule: string
  path: string
  message: string
}

async function validateIssues(root: string, name: string): Promise<ReportIssue[]> {
  const res = await cospec(['validate', name, '--strict', '--json'], { cwd: root })
  const parsed = JSON.parse(res.stdout) as { items: { issues: ReportIssue[] }[] }
  return parsed.items.flatMap((i) => i.issues)
}

// --- evidence 8.1 / 8.2: the nested-change deferral, bounded ---------------
//
// `listChanges` (`core/change.ts`) treats every non-`archive` directory under
// `openspec/changes/` as a change with no shape check, so a folder WRAPPING
// changes is reported as one. Closing that properly is deferred to its own
// change (plan §2 decision 3, §9).
//
// The plan predicted the bound would be upstream's own namespace ERROR
// reaching the user through `mergeDelegated`. Probed at 1.13.1, it does NOT:
// cospec's Step 2 fast validation raises `meta/openspec-yaml` on the wrapper's
// missing `.openspec.yaml` and exits before delegating, so the reader is told
// the file is missing rather than that the folder is a namespace. What IS
// proven here is the part that matters for safety — both surfaces REFUSE, and
// archive moves nothing — plus the exact upstream text the deferred change
// will need to surface.
describe('a namespace folder under openspec/changes/', () => {
  function buildNamespace(root: string): void {
    withFeatSchema(root)
    writeFiles(root, {
      'openspec/specs/widgets/spec.md': livingSpec(LIVING_REQ),
    })
    build(root, 'ns-wrap/real-change', {
      'widgets/spec.md': `## MODIFIED Requirements
${LIVING_REQ}`,
    })
  }

  test('the pinned binary refuses it at validate, with the namespace message', async () => {
    const root = mkTempRepo({ git: true })
    buildNamespace(root)
    const res = await openspec(['validate', 'ns-wrap', '--strict', '--json'], root)
    expect(res.exitCode).toBe(1)
    const parsed = JSON.parse(res.stdout) as { items: { issues: { message: string }[] }[] }
    const messages = parsed.items.flatMap((i) => i.issues).map((i) => i.message)
    expect(messages.join('\n')).toContain(
      '"ns-wrap" is not a change: it is a folder wrapping openspec/changes/ns-wrap/real-change/',
    )
  })

  test('the pinned binary refuses it at archive, before validation', async () => {
    const root = mkTempRepo({ git: true })
    buildNamespace(root)
    const res = await openspec(['archive', 'ns-wrap', '--yes'], root)
    expect(res.exitCode).toBe(1)
    expect(`${res.stdout}${res.stderr}`).toContain('is not a change: it is a folder wrapping')
    expect(existsSync(join(root, 'openspec/changes/ns-wrap/real-change'))).toBe(true)
  })

  test('cospec refuses it too — on its OWN rule, not the delegated message', async () => {
    const root = mkTempRepo({ git: true })
    buildNamespace(root)
    const res = await cospec(['validate', 'ns-wrap', '--strict'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const issues = await validateIssues(root, 'ns-wrap')
    // The wrapper has no `.openspec.yaml`, so cospec's meta rule fires in
    // Step 2 and the run never reaches the delegated call.
    expect(issues.map((i) => i.rule)).toContain('meta/openspec-yaml')
    // Recorded, not asserted as desirable: the delegated namespace ERROR does
    // not reach the reader. The deferred nested-change work closes this.
    expect(issues.some((i) => i.message.includes('folder wrapping'))).toBe(false)
  })

  test('cospec archive refuses and moves nothing', async () => {
    const root = mkTempRepo({ git: true })
    buildNamespace(root)
    const res = await cospec(['archive', 'ns-wrap', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(existsSync(join(root, 'openspec/changes/ns-wrap/real-change/proposal.md'))).toBe(true)
    expect(existsSync(join(root, 'openspec/changes/archive/2026-09-22-ns-wrap'))).toBe(false)
  })
})

// --- evidence 6.4: unpaired FROM: -----------------------------------------
describe('an unpaired RENAMED FROM:', () => {
  const LONE_FROM = '## RENAMED Requirements\n\n- FROM: `### Requirement: Widget rendering`\n'

  test('cospec refuses it, and reports it exactly once', async () => {
    const root = mkTempRepo({ git: true })
    withFeatSchema(root)
    writeFiles(root, { 'openspec/specs/widgets/spec.md': livingSpec(LIVING_REQ) })
    build(root, 'lone-from', { 'widgets/spec.md': LONE_FROM })

    // The binary reports it too, as of 1.13.1 — cospec no longer leads the pin
    // here, so the delegated twin has to be deduped away.
    const raw = await openspec(['validate', 'lone-from', '--strict', '--json'], root)
    const rawMessages = (
      JSON.parse(raw.stdout) as { items: { issues: { message: string }[] }[] }
    ).items
      .flatMap((i) => i.issues)
      .map((i) => i.message)
    expect(rawMessages.join('\n')).toContain(
      'RENAMED FROM: "Widget rendering" has no matching TO: line.',
    )

    const res = await cospec(['validate', 'lone-from', '--strict'], { cwd: root })
    expect(res.exitCode).toBe(1)
    const issues = await validateIssues(root, 'lone-from')
    const unpaired = issues.filter((i) => i.message.includes('has no matching TO: line'))
    expect(unpaired).toHaveLength(1)
    expect(unpaired[0]?.rule).toBe('deltas/unpaired-rename')
    // The delegated archive-preflight dry-run never throws on this change:
    // upstream's own validator stops it before `buildUpdatedSpec` runs.
    expect(issues.some((i) => i.message.startsWith('Archive would refuse this delta:'))).toBe(false)
  })
})

// --- evidence 6.6: fence-aware blank-line collapse -------------------------
describe('a fenced block with consecutive blank lines', () => {
  const FENCE = '```text\nline one\n\n\n\nline two\n```'
  const REQ_WITH_FENCE = `
### Requirement: Widget rendering

The system SHALL render a widget when requested.

${FENCE}

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

  test('survives cospec archive byte-for-byte', async () => {
    const root = mkTempRepo({ git: true })
    withFeatSchema(root)
    writeFiles(root, { 'openspec/specs/widgets/spec.md': livingSpec(LIVING_REQ) })
    build(root, 'fence-keep', {
      'widgets/spec.md': `## MODIFIED Requirements
${REQ_WITH_FENCE}`,
    })

    const res = await cospec(['archive', 'fence-keep', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    const living = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    // 1.13's collapse is fence-aware: three blank lines inside the fence, and
    // no doubled blank line introduced around it.
    expect(living).toContain(FENCE)
    expect(living).not.toContain('```text\nline one\n\nline two')
  })
})

// --- evidence 6.7: retirement with a line-wrapped scenario bullet ----------
describe('retire_capabilities on a spec with a line-wrapped scenario bullet', () => {
  const WRAPPED_LIVING = livingSpec(`
### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget through the public rendering entry point
  and the cache is cold
- **THEN** a widget is rendered
`)

  test('the retirement succeeds and the living spec is deleted', async () => {
    const root = mkTempRepo({ git: true })
    withFeatSchema(root)
    writeFiles(root, { 'openspec/specs/widgets/spec.md': WRAPPED_LIVING })
    build(
      root,
      'retire-wrapped',
      { 'widgets/spec.md': '## REMOVED Requirements\n\n- `### Requirement: Widget rendering`\n' },
      'retire_capabilities: true\n',
    )

    const res = await cospec(['archive', 'retire-wrapped', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // 1.13 loosened the retirement path's reader: the wrapped bullet no longer
    // makes the scenario unreadable, so the REMOVED takes the last requirement
    // and the spec is retired rather than rebuilt empty.
    expect(existsSync(join(root, 'openspec/specs/widgets/spec.md'))).toBe(false)
    expect(existsSync(join(root, 'openspec/changes/retire-wrapped'))).toBe(false)
  })
})
