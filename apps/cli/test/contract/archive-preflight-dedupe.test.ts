// The 1.12/1.13.1 additions to `openspec validate`, probed against the REAL
// pinned binary (DESIGN §8.2) — and what cospec's report does with them.
//
// Three delegated findings arrive free at the 1.13.1 pin, all of them saying
// something cospec's own rules already said:
//
//   - **archive-preflight INFO** (1.12): `validate` dry-runs archive's merge
//     builder and relays each thrown precondition as
//     `Archive would refuse this delta: …`. cospec's `archive/*` family reports
//     the same preconditions as ERRORs, with its own wording, before delegating.
//   - **case-only collisions** (1.13.1): the binary now refuses an ADDED or a
//     RENAMED target that folds onto an existing requirement. cospec's
//     pre-flight arms fold too, so the refusal is cospec's, not the binary's.
//   - **unread delta files** (1.13.1): a delta-shaped markdown file at a path
//     the merge never reads.
//
// What each test asserts is the pair: the real binary's behaviour, and that the
// same defect reaches the user EXACTLY ONCE through cospec. A doubled count
// here is a dedupe regression; a missing count is a suppression that swallowed
// a real finding.

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
import { writeLivingSpec } from './fixtures.ts'

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

const LIVING = `# Widgets Specification

## Purpose

Real purpose text for the widgets capability.

## Requirements

### Requirement: Widget rendering

The system SHALL render a widget when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered

### Requirement: Widget caching

The system SHALL cache a rendered widget.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from cache
`

/** Write a `feat` change carrying the given files under its `specs/`. */
function build(
  root: string,
  name: string,
  specFiles: Record<string, string>,
  tasks = TASKS_DONE,
): void {
  writeLivingSpec(root, 'widgets', LIVING)
  mkdirSync(join(root, 'openspec/changes/archive'), { recursive: true })
  const c = `openspec/changes/${name}`
  const files: Record<string, string> = {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
    [`${c}/proposal.md`]: PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS,
    [`${c}/tasks.md`]: tasks,
  }
  for (const [rel, body] of Object.entries(specFiles)) files[`${c}/specs/${rel}`] = body
  writeFiles(root, files)
}

/**
 * Copy this repo's composed `feat` schema into the temp store. openspec reads
 * `tracks:` from the schema to know which files hold the change's tasks, and
 * with no schema on disk it tracks nothing — so the delegated task diagnostics
 * are unreachable without this.
 */
function withFeatSchema(root: string): void {
  cpSync(join(REPO_ROOT, 'openspec/schemas/feat'), join(root, 'openspec/schemas/feat'), {
    recursive: true,
  })
}

interface ReportIssue {
  level: string
  rule: string
  path: string
  message: string
  hint?: string
}

interface JsonReport {
  items: { issues: ReportIssue[] }[]
  summary: { byRule: Record<string, number> }
}

async function validateJson(root: string, name: string): Promise<JsonReport> {
  const res = await cospec(['validate', name, '--strict', '--json'], { cwd: root })
  return JSON.parse(res.stdout) as JsonReport
}

function issues(report: JsonReport): ReportIssue[] {
  return report.items.flatMap((i) => i.issues)
}

/**
 * Findings that move the verdict. Every fixture here is a v1 change, so each
 * report also carries the `meta/schema-outdated` INFO — real, unrelated, and
 * not what any of these tests is about.
 */
function problems(report: JsonReport): ReportIssue[] {
  return issues(report).filter((i) => i.level !== 'INFO')
}

/** Every `Archive would refuse this delta:` INFO the binary relayed. */
function preflightInfos(report: JsonReport): string[] {
  return issues(report)
    .filter((i) => i.message.startsWith('Archive would refuse this delta:'))
    .map((i) => i.message)
}

const MODIFIED_GHOST = `## MODIFIED Requirements

### Requirement: Widget ghosting

The system SHALL ghost a widget when requested.

#### Scenario: Ghost a widget

- **WHEN** a caller requests a ghost
- **THEN** a ghost is rendered
`

describe('archive-preflight INFO is deduped against cospec archive/* rules', () => {
  test('the pinned binary really does emit the preflight INFO, once', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'ghost-modified', { 'widgets/spec.md': MODIFIED_GHOST })
    const res = await openspec(['validate', 'ghost-modified', '--strict', '--json'], root)
    const relayed = (
      JSON.parse(res.stdout) as { items: { issues: { level: string; message: string }[] }[] }
    ).items.flatMap((i) => i.issues)
    const infos = relayed.filter((i) => i.message.startsWith('Archive would refuse this delta:'))
    // One INFO for the one delta file: `findArchiveBlockers` builds each spec
    // once and stops at the first thrown precondition.
    expect(infos).toHaveLength(1)
    expect(infos[0]?.level).toBe('INFO')
    expect(infos[0]?.message).toContain(
      'MODIFIED failed for header "### Requirement: Widget ghosting" - not found',
    )
  })

  test('cospec reports the missing target exactly once, in its own words', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'ghost-modified', { 'widgets/spec.md': MODIFIED_GHOST })
    const report = await validateJson(root, 'ghost-modified')
    expect(report.summary.byRule['archive/target-missing']).toBe(1)
    // The delegated twin is gone; nothing else picked it up.
    expect(preflightInfos(report)).toEqual([])
    const named = issues(report).filter((i) => i.message.includes('Widget ghosting'))
    expect(named).toHaveLength(1)
    expect(named[0]?.rule).toBe('archive/target-missing')
    expect(named[0]?.level).toBe('ERROR')
  })

  test('the verdict and exit code are the ones cospec already gave', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'ghost-modified', { 'widgets/spec.md': MODIFIED_GHOST })
    // ERROR from cospec's own rule — the INFO class never moves either.
    const res = await cospec(['validate', 'ghost-modified', '--strict'], { cwd: root })
    expect(res.exitCode).toBe(1)
    expect(res.stdout).not.toContain('Archive would refuse this delta')
  })

  // The pairing is keyed on path as well as requirement name, and the two sides
  // spell the path differently: openspec reports `<specId>/spec.md` relative to
  // the change's specs/ dir, cospec reports `specs/<specId>/spec.md`.
  // `DELEGATED_DELTA_PATH_RE` bridges them at any depth — if it stopped
  // matching a nested capability, this dedupe would silently stop working.
  test('the dedupe survives a nested capability path', async () => {
    const root = mkTempRepo({ git: true })
    writeLivingSpec(
      root,
      'platform/session-layout',
      LIVING.replace('# Widgets Specification', '# Session layout Specification'),
    )
    build(root, 'nested-ghost', { 'platform/session-layout/spec.md': MODIFIED_GHOST })
    const report = await validateJson(root, 'nested-ghost')
    expect(report.summary.byRule['archive/target-missing']).toBe(1)
    expect(preflightInfos(report)).toEqual([])
    const found = issues(report).find((i) => i.rule === 'archive/target-missing')
    expect(found?.path).toBe('specs/platform/session-layout/spec.md')
  })

  test('a clean change relays no preflight INFO at all', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'restate-widget', {
      'widgets/spec.md': `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`,
    })
    const report = await validateJson(root, 'restate-widget')
    expect(preflightInfos(report)).toEqual([])
    expect(problems(report)).toEqual([])
  })
})

const ADDED_CASE_COLLISION = `## ADDED Requirements

### Requirement: widget rendering

The system SHALL render a widget when requested, on the new path.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const RENAMED_CASE_COLLISION = `## RENAMED Requirements

- FROM: \`### Requirement: Widget caching\`
- TO: \`### Requirement: widget rendering\`
`

/** A case-only rename of one requirement — the shape upstream exempts. */
const RENAMED_CASE_ONLY = `## RENAMED Requirements

- FROM: \`### Requirement: Widget caching\`
- TO: \`### Requirement: WIDGET CACHING\`
`

describe('case-only collisions (openspec 1.13.1)', () => {
  test('the binary refuses a case-only ADDED collision', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'added-case', { 'widgets/spec.md': ADDED_CASE_COLLISION })
    const res = await openspec(['archive', 'added-case', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('already exists and differs only in case or spacing')
    expect(res.stdout).toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/added-case'))).toBe(true)
  })

  test('cospec refuses it first, as archive/added-exists, reported once', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'added-case', { 'widgets/spec.md': ADDED_CASE_COLLISION })
    const report = await validateJson(root, 'added-case')
    expect(report.summary.byRule['archive/added-exists']).toBe(1)
    expect(preflightInfos(report)).toEqual([])
    const found = issues(report).find((i) => i.rule === 'archive/added-exists')
    expect(found?.message).toContain('differs only in case or spacing from "Widget rendering"')

    // Refused at cospec's pre-flight: the wrapped binary is never reached, so
    // its abort banner never appears.
    const res = await cospec(['archive', 'added-case'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(res.stdout).toContain('archive/added-exists')
    expect(`${res.stdout}${res.stderr}`).not.toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/added-case'))).toBe(true)
  })

  test('the binary refuses a case-only RENAMED-target collision', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'renamed-case', { 'widgets/spec.md': RENAMED_CASE_COLLISION })
    const res = await openspec(['archive', 'renamed-case', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('already exists and differs only in case or spacing')
    expect(existsSync(join(root, 'openspec/changes/renamed-case'))).toBe(true)
  })

  test('cospec refuses that one first too, reported once', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'renamed-case', { 'widgets/spec.md': RENAMED_CASE_COLLISION })
    const report = await validateJson(root, 'renamed-case')
    expect(report.summary.byRule['archive/added-exists']).toBe(1)
    expect(preflightInfos(report)).toEqual([])
    const found = issues(report).find((i) => i.rule === 'archive/added-exists')
    expect(found?.message).toContain('differs only in case or spacing from "Widget rendering"')

    const res = await cospec(['archive', 'renamed-case'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(existsSync(join(root, 'openspec/changes/renamed-case'))).toBe(true)
  })

  // The exemption that keeps the fold arms honest: renaming a requirement to a
  // different spelling of its OWN name is the rename, not a collision.
  test('a case-only rename of one requirement is accepted by both sides', async () => {
    const oRepo = mkTempRepo({ git: true })
    build(oRepo, 'rename-case-only', { 'widgets/spec.md': RENAMED_CASE_ONLY })
    const o = await openspec(['archive', 'rename-case-only', '-y'], oRepo)
    expect(o.exitCode).toBe(0)
    expect(readFileSync(join(oRepo, 'openspec/specs/widgets/spec.md'), 'utf8')).toContain(
      '### Requirement: WIDGET CACHING',
    )

    const cRepo = mkTempRepo({ git: true })
    build(cRepo, 'rename-case-only', { 'widgets/spec.md': RENAMED_CASE_ONLY })
    const report = await validateJson(cRepo, 'rename-case-only')
    expect(problems(report)).toEqual([])
    const c = await cospec(['archive', 'rename-case-only'], { cwd: cRepo })
    expect(c.exitCode).toBe(0)
    expect(existsSync(join(cRepo, 'openspec/changes/rename-case-only'))).toBe(false)
    expect(readFileSync(join(cRepo, 'openspec/specs/widgets/spec.md'), 'utf8')).toContain(
      '### Requirement: WIDGET CACHING',
    )
  })
})

/** REMOVE a requirement and ADD a fold-variant of its name in one delta. */
const REMOVED_THEN_ADDED_FOLD = `## REMOVED Requirements

- \`### Requirement: Widget caching\`

## ADDED Requirements

### Requirement: WIDGET CACHING

The system SHALL cache a rendered widget in the new store.

#### Scenario: Cache a widget

- **WHEN** a caller requests the same widget twice
- **THEN** the second request is served from the new store
`

/** A delta written at a path neither reader ever opens. */
const UNREAD_DELTA = `## ADDED Requirements

### Requirement: Widget tracing

The system SHALL trace a widget render.

#### Scenario: Trace a render

- **WHEN** a widget is rendered
- **THEN** a trace is emitted
`

const VALID_MODIFIED = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget promptly when requested.

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

describe('the fold arms do not over-refuse', () => {
  // openspec applies RENAMED, then REMOVED, then MODIFIED, then ADDED, and its
  // ADDED near-miss search reads the spec as it stands by then. A living name
  // this delta already removed is gone, so the fold-variant is not a second
  // copy of anything — cospec's arm has to exempt it or it refuses an archive
  // the binary performs.
  test('an ADDED folding onto a requirement the same delta REMOVES is applied by both', async () => {
    const oRepo = mkTempRepo({ git: true })
    build(oRepo, 'swap-caching', { 'widgets/spec.md': REMOVED_THEN_ADDED_FOLD })
    const o = await openspec(['archive', 'swap-caching', '-y'], oRepo)
    expect(o.exitCode).toBe(0)
    const oLiving = readFileSync(join(oRepo, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(oLiving).toContain('### Requirement: WIDGET CACHING')
    expect(oLiving).toContain('the new store')

    const cRepo = mkTempRepo({ git: true })
    build(cRepo, 'swap-caching', { 'widgets/spec.md': REMOVED_THEN_ADDED_FOLD })
    const report = await validateJson(cRepo, 'swap-caching')
    expect(problems(report)).toEqual([])
    const c = await cospec(['archive', 'swap-caching'], { cwd: cRepo })
    expect(c.exitCode).toBe(0)
    expect(existsSync(join(cRepo, 'openspec/changes/swap-caching'))).toBe(false)
  })
})

describe('unread delta files (openspec 1.13.1)', () => {
  test('the binary reports one beside a real delta; cospec reports it once', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'unread-beside', {
      'widgets/spec.md': VALID_MODIFIED,
      'widgets/notes.md': UNREAD_DELTA,
    })
    const raw = await openspec(['validate', 'unread-beside', '--strict', '--json'], root)
    expect(raw.stdout).toContain('Delta spec found at specs/widgets/notes.md')

    const report = await validateJson(root, 'unread-beside')
    expect(report.summary.byRule['deltas/unread-file']).toBe(1)
    const named = issues(report).filter((i) => i.message.includes('notes.md'))
    expect(named).toHaveLength(1)
    expect(named[0]?.rule).toBe('deltas/unread-file')
    expect(named[0]?.level).toBe('ERROR')
  })

  test('a change whose only delta sits at an unread path no longer archives clean', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'unread-only', { 'widgets.md': UNREAD_DELTA })
    const report = await validateJson(root, 'unread-only')
    const found = issues(report).find((i) => i.rule === 'deltas/unread-file')
    expect(found?.message).toContain('specs/widgets.md')
    expect(found?.hint).toContain('specs/widgets/spec.md')

    // Before the rule, this was a zero-delta change: cospec skipped specs and
    // archived it as done with nothing merged.
    const res = await cospec(['archive', 'unread-only'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(existsSync(join(root, 'openspec/changes/unread-only'))).toBe(true)
  })

  test('a delta-shaped file inside the capability folder is caught the same way', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'unread-delta-md', { 'widgets/delta.md': UNREAD_DELTA })
    const report = await validateJson(root, 'unread-delta-md')
    const found = issues(report).find((i) => i.rule === 'deltas/unread-file')
    expect(found?.message).toContain('specs/widgets/delta.md')
    expect(found?.hint).toContain('specs/widgets/spec.md')

    const res = await cospec(['archive', 'unread-delta-md'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(existsSync(join(root, 'openspec/changes/unread-delta-md'))).toBe(true)
  })

  test('a companion note carrying no delta section is still invisible to both', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'plain-note', {
      'widgets/spec.md': VALID_MODIFIED,
      'widgets/notes.md': '# Notes\n\nWhy the rendering path was narrowed.\n',
    })
    const raw = await openspec(['validate', 'plain-note', '--strict', '--json'], root)
    expect(raw.stdout).not.toContain('notes.md')

    const report = await validateJson(root, 'plain-note')
    expect(problems(report)).toEqual([])
  })
})

const TASKS_NO_CHECKBOXES = `## 1. Implementation

- Restate the requirement
- Add a covering test
`

describe('zero-checkbox tasks (openspec 1.13.1)', () => {
  test('cospec reports tasks/has-tasks once; the delegated warning is suppressed', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'no-checkboxes', { 'widgets/spec.md': VALID_MODIFIED }, TASKS_NO_CHECKBOXES)
    withFeatSchema(root)
    const raw = await openspec(['validate', 'no-checkboxes', '--strict', '--json'], root)
    // The binary really does say it, so the suppression below is suppressing
    // something that was there.
    expect(raw.stdout).toContain('This change counts as 0 tasks')

    const report = await validateJson(root, 'no-checkboxes')
    expect(report.summary.byRule['tasks/has-tasks']).toBe(1)
    const named = issues(report).filter((i) => i.message.includes('counts as 0 tasks'))
    expect(named).toEqual([])
  })
})

/** Two ADDED names in ONE delta that fold onto each other. */
const ADDED_SIBLING_FOLD = `## ADDED Requirements

### Requirement: Widget tracing

The system SHALL trace a widget render.

#### Scenario: Trace a render

- **WHEN** a widget is rendered
- **THEN** a trace is emitted

### Requirement: WIDGET TRACING

The system SHALL trace a widget render into the audit log.

#### Scenario: Trace a render

- **WHEN** a widget is rendered
- **THEN** a trace reaches the audit log
`

/** An ADDED folding onto the target this same delta renames a requirement to. */
const RENAMED_THEN_ADDED_FOLD = `## RENAMED Requirements

- FROM: \`### Requirement: Widget caching\`
- TO: \`### Requirement: Widget tracing\`

## ADDED Requirements

### Requirement: WIDGET TRACING

The system SHALL trace a widget render into the audit log.

#### Scenario: Trace a render

- **WHEN** a widget is rendered
- **THEN** a trace reaches the audit log
`

/** A swap: the second rename lands on the name the first one vacated. */
const RENAMED_CHAIN = `## RENAMED Requirements

- FROM: \`### Requirement: Widget rendering\`
- TO: \`### Requirement: Widget streaming\`
- FROM: \`### Requirement: Widget caching\`
- TO: \`### Requirement: Widget rendering\`
`

// openspec folds an op's name against the spec as it stands when that op runs,
// after the delta's earlier operations have been applied to it — so a delta
// whose own two operations write one requirement under two spellings is
// refused, and one that reuses a name an earlier operation vacated is not.
// Folding against the living names alone got both of those wrong: the first
// reported clean at `validate` and aborted inside the delegated merge, the
// second was refused for a collision that is not there.
describe('fold-equal collisions between two ops in one delta (openspec 1.13.1)', () => {
  test('the binary refuses two ADDED names that fold onto each other', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'sibling-fold', { 'widgets/spec.md': ADDED_SIBLING_FOLD })
    const res = await openspec(['archive', 'sibling-fold', '-y'], root)
    expect(res.exitCode).toBe(1)
    expect(res.stdout).toContain('already exists and differs only in case or spacing')
    expect(res.stdout).toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/sibling-fold'))).toBe(true)
  })

  test('cospec refuses it first, as archive/added-exists, reported once', async () => {
    const root = mkTempRepo({ git: true })
    build(root, 'sibling-fold', { 'widgets/spec.md': ADDED_SIBLING_FOLD })
    const report = await validateJson(root, 'sibling-fold')
    expect(report.summary.byRule['archive/added-exists']).toBe(1)
    expect(preflightInfos(report)).toEqual([])
    const found = issues(report).find((i) => i.rule === 'archive/added-exists')
    expect(found?.message).toContain('differs only in case or spacing from "Widget tracing"')
    // The twin is this delta's own earlier ADDED, not a living requirement.
    expect(found?.message).toContain('written by an earlier operation in this delta')

    const res = await cospec(['archive', 'sibling-fold'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(res.stdout).toContain('archive/added-exists')
    expect(`${res.stdout}${res.stderr}`).not.toContain('Aborted. No files were changed.')
    expect(existsSync(join(root, 'openspec/changes/sibling-fold'))).toBe(true)
  })

  test('an ADDED folding onto this delta’s RENAMED target is refused by both', async () => {
    const oRepo = mkTempRepo({ git: true })
    build(oRepo, 'rename-then-add', { 'widgets/spec.md': RENAMED_THEN_ADDED_FOLD })
    const o = await openspec(['archive', 'rename-then-add', '-y'], oRepo)
    expect(o.exitCode).toBe(1)
    expect(o.stdout).toContain('already exists and differs only in case or spacing')

    const cRepo = mkTempRepo({ git: true })
    build(cRepo, 'rename-then-add', { 'widgets/spec.md': RENAMED_THEN_ADDED_FOLD })
    const report = await validateJson(cRepo, 'rename-then-add')
    expect(report.summary.byRule['archive/added-exists']).toBe(1)
    const c = await cospec(['archive', 'rename-then-add'], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(`${c.stdout}${c.stderr}`).not.toContain('Aborted. No files were changed.')
  })

  test('a rename onto a name an earlier rename vacated is applied by both', async () => {
    const oRepo = mkTempRepo({ git: true })
    build(oRepo, 'swap-names', { 'widgets/spec.md': RENAMED_CHAIN })
    const o = await openspec(['archive', 'swap-names', '-y'], oRepo)
    expect(o.exitCode).toBe(0)
    const oLiving = readFileSync(join(oRepo, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(oLiving).toContain('### Requirement: Widget streaming')
    expect(oLiving).toContain('### Requirement: Widget rendering')

    const cRepo = mkTempRepo({ git: true })
    build(cRepo, 'swap-names', { 'widgets/spec.md': RENAMED_CHAIN })
    const report = await validateJson(cRepo, 'swap-names')
    expect(problems(report)).toEqual([])
    const c = await cospec(['archive', 'swap-names'], { cwd: cRepo })
    expect(c.exitCode).toBe(0)
    const cLiving = readFileSync(join(cRepo, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(cLiving).toContain('### Requirement: Widget streaming')
    expect(cLiving).toContain('### Requirement: Widget rendering')
  })
})
