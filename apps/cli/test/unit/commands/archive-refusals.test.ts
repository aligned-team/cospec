// Verification 2.5: every refusal path of `cospec archive` answers `--json`
// with exactly one document on stdout and exit 1. The table below has one case
// per refusal reason `commands/archive.ts` names, so a new refusal fails here
// until it has a case; a refusal that returns without the shared `refuse`
// (and so without a document) fails the source check. The wrapped binary is
// stubbed for the three refusals that come after delegation.

import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { formatLocalDate, run as archiveRun } from '../../../src/commands/archive.ts'
import { ARCHIVE_REFUSAL_REASONS } from '../../../src/core/archive-output.ts'
import { PINNED_OPENSPEC_VERSION } from '../../../src/core/openspec.ts'
import {
  ctx,
  DONE_TASKS,
  EMPTY_BLOCKERS,
  LITE_PROPOSAL,
  makeRepo,
  runCmd,
  writeArchived,
  writeChange,
} from './helpers.ts'

const roots: string[] = []
function repo(): string {
  const dir = makeRepo()
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) {
    chmodSync(join(dir, 'openspec/changes/archive'), 0o755)
    rmSync(dir, { recursive: true, force: true })
  }
})

const SOURCE = readFileSync(join(import.meta.dir, '../../../src/commands/archive.ts'), 'utf8')

const FEAT_PROPOSAL = `# change

## Why

The widgets capability has to change shape for the next release, and the main
specs must say so; without this change the archive would describe a widget
behaviour the product no longer has.

## What Changes

- Change the widgets capability.

## Capabilities

### Modified Capabilities

- widgets

## Impact

- No breaking changes.

## Surfaces

- [ ] interactive — a user-visible/interactive surface (UI, TUI, CLI UX)
`

const REQUIREMENT = (scenarios: string): string => `### Requirement: Widget rendering

The system SHALL render a widget when requested.
${scenarios}`

const RENDER = `
#### Scenario: Render a widget

- **WHEN** a caller requests a widget
- **THEN** a widget is rendered
`

const EMPTY = `
#### Scenario: Render an empty widget

- **WHEN** a caller requests an empty widget
- **THEN** a placeholder is rendered
`

function living(cwd: string, body: string): void {
  mkdirSync(join(cwd, 'openspec/specs/widgets'), { recursive: true })
  writeFileSync(
    join(cwd, 'openspec/specs/widgets/spec.md'),
    `# Widgets Specification\n\n## Purpose\n\nReal purpose text for widgets.\n\n## Requirements\n\n${body}`,
  )
}

function feat(cwd: string, id: string, delta: string, files: Record<string, string> = {}): void {
  writeChange(cwd, id, 'feat', {
    'proposal.md': FEAT_PROPOSAL,
    'blocking-changes.md': EMPTY_BLOCKERS,
    'tasks.md': DONE_TASKS,
    'specs/widgets/spec.md': delta,
    ...files,
  })
}

const CI = {
  'proposal.md': LITE_PROPOSAL,
  'blocking-changes.md': EMPTY_BLOCKERS,
  'tasks.md': DONE_TASKS,
}

interface Case {
  /** Builds the repo and returns the change name to archive. */
  build(cwd: string): string
  /** What the stubbed binary does with `archive <id> -y`; absent = never spawned. */
  binary?: (cwd: string, id: string) => number
}

const ADDED_NEW = `## ADDED Requirements\n\n${REQUIREMENT(RENDER)}`

const CASES: Record<string, Case> = {
  'invalid-name': { build: () => 'a/b' },
  // macOS refuses at the root confinement, Linux at the slot `lstat`: the
  // same reason either way.
  'archive-unreadable': {
    build(cwd) {
      writeChange(cwd, 'c', 'ci', CI)
      chmodSync(join(cwd, 'openspec/changes/archive'), 0o000)
      return 'c'
    },
  },
  'unknown-change': {
    build(cwd) {
      writeChange(cwd, 'c', 'ci', CI)
      return 'nope'
    },
  },
  'namespace-folder': {
    build(cwd) {
      writeChange(cwd, 'mobile/refresh', 'ci', CI)
      rmSync(join(cwd, 'openspec/changes/mobile/.openspec.yaml'), { force: true })
      return 'mobile'
    },
  },
  validation: {
    build(cwd) {
      feat(cwd, 'c', `## ADDED Requirements\n\n${REQUIREMENT('')}`)
      return 'c'
    },
  },
  'tasks-incomplete': {
    build(cwd) {
      writeChange(cwd, 'c', 'ci', { ...CI, 'tasks.md': '## 1. G\n\n- [ ] 1.1 not yet\n' })
      return 'c'
    },
  },
  'archive/verification-incomplete': {
    build(cwd) {
      writeChange(cwd, 'c', 'ci', CI)
      writeFileSync(
        join(cwd, 'openspec/changes/c/.openspec.yaml'),
        'schema: fix\ncreated: 2026-10-05\nschemaVersion: 2\n',
      )
      writeFileSync(
        join(cwd, 'openspec/changes/c/verification.md'),
        '## 1. Works\n\n- [ ] 1.1 @regression rerun the case -> passes\n',
      )
      return 'c'
    },
  },
  'slot-exists': {
    build(cwd) {
      writeChange(cwd, 'c', 'ci', CI)
      writeArchived(cwd, `${formatLocalDate()}-c`, 'ci')
      return 'c'
    },
  },
  'archive/scenario-preservation': {
    build(cwd) {
      living(cwd, REQUIREMENT(`${RENDER}${EMPTY}`))
      feat(cwd, 'c', `## MODIFIED Requirements\n\n${REQUIREMENT(RENDER)}`)
      return 'c'
    },
  },
  aborted: {
    build(cwd) {
      feat(cwd, 'c', ADDED_NEW)
      return 'c'
    },
    binary: () => 1,
  },
  'half-state': {
    build(cwd) {
      feat(cwd, 'c', ADDED_NEW)
      return 'c'
    },
    binary(cwd, id) {
      rmSync(join(cwd, 'openspec/changes', id), { recursive: true })
      return 0
    },
  },
  'spec-verification-failed': {
    build(cwd) {
      feat(cwd, 'c', ADDED_NEW)
      return 'c'
    },
    binary(cwd, id) {
      // Moves the change as an archive would, but never writes the ADDED spec.
      renameSync(
        join(cwd, 'openspec/changes', id),
        join(cwd, 'openspec/changes/archive', `${formatLocalDate()}-${id}`),
      )
      return 0
    },
  },
}

/** Run `archive <id> --json` in-process, the binary answered by `binary`. */
async function archiveJson(cwd: string, id: string, binary: Case['binary']) {
  const originalSpawn = Bun.spawn
  let spawned = 0
  // @ts-expect-error — test-only override of Bun.spawn's overloaded signature.
  Bun.spawn = (cmd: string[], opts: Parameters<typeof Bun.spawn>[1]) => {
    const argv = cmd.slice(3)
    // Revalidation's delegated `validate` is the real binary's.
    if (argv[0] === 'validate') return originalSpawn(cmd, opts)
    const version = argv.length === 1 && argv[0] === '--version'
    if (!version) spawned++
    const exitCode = version ? 0 : (binary?.(cwd, id) ?? 0)
    return {
      stdout: new Response(version ? `${PINNED_OPENSPEC_VERSION}\n` : '').body,
      stderr: new Response('').body,
      exited: Promise.resolve(exitCode),
    }
  }
  try {
    const r = await runCmd(archiveRun, ctx(cwd, [id], { json: true, command: 'archive' }))
    return { ...r, spawned }
  } finally {
    Bun.spawn = originalSpawn
  }
}

describe('2.5 every archive refusal under --json is one document', () => {
  test('no refusal in commands/archive.ts returns without the shared document', () => {
    // The one `return EXIT.failure` is `refuse`'s own.
    expect(SOURCE.match(/return EXIT\.failure/g)).toHaveLength(1)
    expect(SOURCE).toMatch(/const refuse = \([^]*?return EXIT\.failure\n {2}\}/)
  })

  test('every refusal reason archive.ts names has a case', () => {
    const named: string[] = ARCHIVE_REFUSAL_REASONS.filter((r) => SOURCE.includes(`'${r}'`))
    expect(named.toSorted()).toEqual(Object.keys(CASES).toSorted())
  })

  for (const [reason, c] of Object.entries(CASES))
    test(`${reason}: one document on stdout, exit 1`, async () => {
      const cwd = repo()
      const id = c.build(cwd)
      const r = await archiveJson(cwd, id, c.binary)
      expect(r.code).toBe(1)
      expect(r.spawned).toBe(c.binary === undefined ? 0 : 1)
      const doc = JSON.parse(r.out) as Record<string, unknown>
      expect(r.out.trim().endsWith('}')).toBe(true)
      expect(doc.reason).toBe(reason)
      expect(doc.archive).toBeNull()
      expect(doc.status).toEqual([expect.objectContaining({ severity: 'error' })])
      if (reason === 'validation')
        for (const key of ['version', 'items', 'summary']) expect(doc).toHaveProperty(key)
    })
})
