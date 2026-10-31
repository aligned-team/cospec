// `cospec archive` end to end from source against the pinned 1.15.0 binary, for the archive rows
// of openspec-1-15-parity's verification ledger: a plain-bullet `## Workflow follow-up` section
// is not a task (2.2), a retirement whose backup cleanup fails is still an archive the disk
// shows (4.7), and the merge keeps CRLF, follows a symlinked specs dir in or out of the project
// and refuses a `spec.md` link that leaves it (8.1).

import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'
import { authorFeat, BLOCKERS_EMPTY } from './support.ts'

afterAll(cleanupAll)

async function initRepo(): Promise<string> {
  const root = mkTempRepo({ git: true })
  const init = await cospec(['init', '--harness', 'none', '--no-gate', '--yes'], { cwd: root })
  expect(init.exitCode).toBe(0)
  return root
}

/** The archive entries for `id` (`YYYY-MM-DD-<id>`), as the disk shows them. */
function archivedAs(root: string, id: string): string[] {
  const dir = join(root, 'openspec/changes/archive')
  return existsSync(dir) ? readdirSync(dir).filter((d) => d.endsWith(`-${id}`)) : []
}

const MODIFY_PROPOSAL = `# change

## Why

The rendering requirement needs a firmer guarantee so callers can rely on the
widget appearing promptly; this change tightens the rendering requirement text.

## What Changes

- Tighten widget rendering.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const TASKS_DONE = '## 1. Implementation\n\n- [x] 1.1 Tighten the rendering path\n'

const LIVING_LINES = [
  '# Widgets Specification',
  '',
  '## Purpose',
  '',
  'Widgets render on request so callers can display their data consistently.',
  '',
  '## Requirements',
  '',
  '### Requirement: Widget rendering',
  '',
  'The system SHALL render a widget when requested.',
  '',
  '#### Scenario: Render a widget',
  '',
  '- **WHEN** a caller requests a widget',
  '- **THEN** a widget is rendered',
  '',
  '### Requirement: Widget sizing',
  '',
  'The system SHALL size a widget to its container.',
  '',
  '#### Scenario: Fit container',
  '',
  '- **WHEN** a widget renders in a container',
  '- **THEN** it fits the container',
  '',
]

const OLD_STATEMENT = 'The system SHALL render a widget when requested.'
const NEW_STATEMENT = 'The system SHALL render a widget within one second when requested.'

const MODIFY_DELTA = `## MODIFIED Requirements

### Requirement: Widget rendering

${NEW_STATEMENT}

#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

/** A v1 feat change `tweak` that MODIFIES "Widget rendering" in `widgets`. */
function authorTweak(root: string): void {
  const c = 'openspec/changes/tweak'
  writeFiles(root, {
    [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\n',
    [`${c}/proposal.md`]: MODIFY_PROPOSAL,
    [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
    [`${c}/specs/widgets/spec.md`]: MODIFY_DELTA,
    [`${c}/tasks.md`]: TASKS_DONE,
  })
}

describe('2.2: a plain-bullet Workflow follow-up section is not a task', () => {
  test('every checkbox checked plus follow-up bullets archives, and the move is on disk', async () => {
    const root = await initRepo()
    authorFeat(root, 'add-widgets', 'widgets', { tasksDone: true })
    const tasks = `## 1. Implementation

- [x] 1.1 Implement the capability
- [x] 1.2 Add a covering test

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
`
    writeFiles(root, { 'openspec/changes/add-widgets/tasks.md': tasks })

    const res = await cospec(['archive', 'add-widgets'], { cwd: root })
    expect(res.stderr).not.toContain('incomplete task')
    expect(res.exitCode).toBe(0)

    const targets = archivedAs(root, 'add-widgets')
    expect(targets).toHaveLength(1)
    const target = join(root, 'openspec/changes/archive', targets[0]!)
    expect(existsSync(join(root, 'openspec/changes/add-widgets'))).toBe(false)
    expect(existsSync(join(target, '.openspec.yaml'))).toBe(true)
    expect(readFileSync(join(target, 'tasks.md'), 'utf8')).toBe(tasks)
    expect(existsSync(join(root, 'openspec/specs/widgets/spec.md'))).toBe(true)
  }, 60_000)
})

describe('4.7: retirement cleanup fails after the move', () => {
  const GADGETS = `# Gadgets Specification

## Purpose

Gadgets were an early experiment that the product no longer offers to anyone.

## Requirements

### Requirement: Gadget listing

The system SHALL list gadgets on request.

#### Scenario: List gadgets

- **WHEN** a caller lists gadgets
- **THEN** every gadget is returned
`

  const RETIRE_PROPOSAL = `# change

## Why

Gadgets were an experiment nobody uses any more; keeping the capability around
costs maintenance on every release, so this change retires it entirely.

## What Changes

- Retire the gadgets capability.

## Capabilities

### Modified Capabilities

- gadgets

## Impact

- Removes gadgets; no other capability depends on it.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

  // Loaded into every Bun process of the run through `BUN_OPTIONS`, and active only in the
  // wrapped binary's: it records each invocation's argv, and fails the unlink of the displaced
  // retirement backup, which is the binary's own finalize step after the change has moved.
  const FAULT_PRELOAD = `import { appendFileSync } from 'node:fs'
import fs from 'node:fs'

if (process.argv.some((arg) => arg.endsWith('openspec.js'))) {
  appendFileSync(process.env.COSPEC_TEST_FAULT_LOG, JSON.stringify(process.argv.slice(2)) + '\\n')
  const unlink = fs.promises.unlink
  fs.promises.unlink = async (path) => {
    if (String(path).includes('.openspec-retire-')) {
      const error = new Error(\`EACCES: permission denied, unlink '\${path}'\`)
      error.code = 'EACCES'
      throw error
    }
    return unlink(path)
  }
}
`

  test('archive --json: one human-mode delegation, move verified, blockers fanned out, nonzero exit', async () => {
    const root = await initRepo()
    const c = 'openspec/changes/retire-gadgets'
    const d = 'openspec/changes/after-gadgets'
    writeFiles(root, {
      'openspec/specs/gadgets/spec.md': GADGETS,
      [`${c}/.openspec.yaml`]: 'schema: feat\ncreated: 2026-07-06\nretire_capabilities: true\n',
      [`${c}/proposal.md`]: RETIRE_PROPOSAL,
      [`${c}/blocking-changes.md`]: BLOCKERS_EMPTY,
      [`${c}/specs/gadgets/spec.md`]:
        '## REMOVED Requirements\n\n### Requirement: Gadget listing\n\n**Reason**: gadgets are retired.\n\n**Migration**: none; nothing uses them.\n',
      [`${c}/tasks.md`]: '## 1. Implementation\n\n- [x] 1.1 Remove the gadget code\n',
      [`${d}/.openspec.yaml`]: 'schema: ci\ncreated: 2026-07-06\n',
      [`${d}/proposal.md`]: RETIRE_PROPOSAL,
      [`${d}/blocking-changes.md`]:
        '# Dependencies\n\n## Blocked by\n\n- [ ] `retire-gadgets` — gadgets must go first\n\n## Soft-blocked by\n\nNone.\n',
      [`${d}/tasks.md`]: '## 1. Follow on\n\n- [ ] 1.1 Build on the retirement\n',
    })
    const tools = mkTempRepo()
    const preload = join(tools, 'fault-preload.mjs')
    const log = join(tools, 'openspec-calls.jsonl')
    writeFileSync(preload, FAULT_PRELOAD)

    const res = await cospec(['archive', 'retire-gadgets', '--json'], {
      cwd: root,
      env: { BUN_OPTIONS: `--preload ${preload}`, COSPEC_TEST_FAULT_LOG: log },
    })

    // Exactly one delegated archive, in human mode (cospec never hands the binary --json here).
    const calls = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as string[])
    const archiveCalls = calls.filter((argv) => argv.includes('archive'))
    expect(archiveCalls).toEqual([['--no-color', 'archive', 'retire-gadgets', '-y']])

    expect(res.exitCode).not.toBe(0)
    const body = JSON.parse(res.stdout) as {
      archived: boolean
      reason: string
      target: string
      blockers: { checkedOff: string[]; nowUnblocked: string[] }
      status: { severity: string; code: string; message: string }[]
    }
    expect(body.archived).toBe(true)
    expect(body.reason).toBe('retirement-cleanup-failed')
    expect(body.status.map((s) => s.code)).toEqual(['archive_retirement_cleanup_failed'])
    expect(body.status[0]?.message).toContain(
      'The change was archived, but retirement cleanup did not complete.',
    )

    // The move, as the disk shows it.
    expect(existsSync(join(root, c))).toBe(false)
    expect(archivedAs(root, 'retire-gadgets')).toEqual([body.target])
    expect(existsSync(join(root, 'openspec/changes/archive', body.target, '.openspec.yaml'))).toBe(
      true,
    )
    // The backup the binary could not finalize is still there for recovery.
    expect(readdirSync(join(root, 'openspec/specs/gadgets'))).toEqual([
      expect.stringMatching(/^spec\.md\.openspec-retire-/),
    ])

    // Blocker sync fanned out to the change that waited on this one.
    expect(body.blockers).toEqual({
      checkedOff: ['after-gadgets'],
      nowUnblocked: ['after-gadgets'],
    })
    expect(readFileSync(join(root, d, 'blocking-changes.md'), 'utf8')).toMatch(
      /- \[x\] `retire-gadgets` — gadgets must go first \*\(archived \d{4}-\d{2}-\d{2}\)\*/,
    )
  }, 60_000)
})

describe('8.1: living specs on CRLF and through symlinks', () => {
  test('a CRLF living spec stays CRLF and only the modified requirement changes', async () => {
    const root = await initRepo()
    const before = LIVING_LINES.join('\r\n')
    writeFiles(root, { 'openspec/specs/widgets/spec.md': before })
    authorTweak(root)

    const res = await cospec(['archive', 'tweak'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(archivedAs(root, 'tweak')).toHaveLength(1)

    const after = readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
    expect(after).toBe(before.replace(OLD_STATEMENT, NEW_STATEMENT))
    expect(
      after.split('\n').every((line, i, all) => i === all.length - 1 || line.endsWith('\r')),
    ).toBe(true)
  }, 60_000)

  test('a symlinked openspec/specs inside the project is followed', async () => {
    const root = await initRepo()
    rmSync(join(root, 'openspec/specs'), { recursive: true, force: true })
    writeFiles(root, { 'planning/specs/widgets/spec.md': LIVING_LINES.join('\n') })
    symlinkSync('../planning/specs', join(root, 'openspec/specs'))
    authorTweak(root)

    const res = await cospec(['archive', 'tweak'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(archivedAs(root, 'tweak')).toHaveLength(1)
    expect(readFileSync(join(root, 'planning/specs/widgets/spec.md'), 'utf8')).toContain(
      NEW_STATEMENT,
    )
  }, 60_000)

  test('a symlinked openspec/specs outside the project is followed', async () => {
    const root = await initRepo()
    const outside = mkTempRepo()
    writeFiles(outside, { 'specs/widgets/spec.md': LIVING_LINES.join('\n') })
    rmSync(join(root, 'openspec/specs'), { recursive: true, force: true })
    symlinkSync(join(outside, 'specs'), join(root, 'openspec/specs'))
    authorTweak(root)

    const res = await cospec(['archive', 'tweak'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(archivedAs(root, 'tweak')).toHaveLength(1)
    expect(readFileSync(join(outside, 'specs/widgets/spec.md'), 'utf8')).toContain(NEW_STATEMENT)
  }, 60_000)

  test('a symlinked spec.md that leaves the project is refused and nothing moves', async () => {
    const root = await initRepo()
    const outside = mkTempRepo()
    const external = LIVING_LINES.join('\n')
    writeFiles(outside, { 'spec.md': external })
    mkdirSync(join(root, 'openspec/specs/widgets'), { recursive: true })
    symlinkSync(join(outside, 'spec.md'), join(root, 'openspec/specs/widgets/spec.md'))
    authorTweak(root)

    const res = await cospec(['archive', 'tweak'], { cwd: root })
    expect(res.exitCode).not.toBe(0)
    expect(`${res.stdout}${res.stderr}`).toContain('Path is outside the allowed directory')
    expect(existsSync(join(root, 'openspec/changes/tweak'))).toBe(true)
    expect(archivedAs(root, 'tweak')).toEqual([])
    expect(readFileSync(join(outside, 'spec.md'), 'utf8')).toBe(external)
  }, 60_000)
})
