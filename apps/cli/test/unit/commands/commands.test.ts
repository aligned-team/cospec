import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { run as instructionsRun } from '../../../src/commands/instructions.ts'
import { run as listRun } from '../../../src/commands/list.ts'
import { run as newRun, slugify } from '../../../src/commands/new.ts'
import {
  computeStatus,
  gateLabel,
  hasAnyArtifact,
  run as statusRun,
} from '../../../src/commands/status.ts'
import { run as validateRun } from '../../../src/commands/validate.ts'
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
function repo(schema?: string): string {
  const dir = makeRepo(schema)
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('new: slugify', () => {
  test('derives kebab slugs from free text', () => {
    expect(slugify('add a greeting endpoint')).toBe('add-a-greeting-endpoint')
    expect(slugify('  Fix the Release Workflow!! ')).toBe('fix-the-release-workflow')
  })
  test('strips leading non-letters so the slug grammar holds', () => {
    expect(slugify('123 go')).toBe('go')
  })
  test('undefined when nothing usable remains', () => {
    expect(slugify('12345')).toBeUndefined()
    expect(slugify('   ')).toBeUndefined()
  })
})

describe('new: validation before delegation', () => {
  test('no openspec/ directory exits 1 with an actionable init hint', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-noinit-'))
    roots.push(cwd)
    const r = await runCmd(newRun, ctx(cwd, ['feat', 'foo']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
    // Must not leak the internal wrapped-openspec spawn command / exit code.
    expect(r.err).not.toContain('openspec new change')
    expect(r.err).not.toContain('exited')
  })

  test('unknown type exits 1 with a suggestion and the table', async () => {
    const cwd = repo()
    const r = await runCmd(newRun, ctx(cwd, ['feaf', 'x']))
    expect(r.code).toBe(1)
    expect(r.err).toContain("unknown type 'feaf'")
    expect(r.err).toContain("Did you mean 'feat'")
    expect(r.err).toContain('Valid types:')
  })

  test('invalid slug exits 1', async () => {
    const cwd = repo()
    const r = await runCmd(newRun, ctx(cwd, ['ci', 'Bad_Slug']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('invalid slug')
  })

  test('collision with an active change exits 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'dup', 'ci')
    const r = await runCmd(newRun, ctx(cwd, ['ci', 'dup']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('already exists')
  })

  test('collision with an archive-entry suffix exits 1', async () => {
    const cwd = repo()
    writeArchived(cwd, '2026-06-01-shipped', 'ci')
    const r = await runCmd(newRun, ctx(cwd, ['ci', 'shipped']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('collides with an archived change')
  })
})

describe('status', () => {
  test('empty change renders "in progress", never Unknown item', async () => {
    const cwd = repo()
    writeChange(cwd, 'bare', 'feat')
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'bare']))
    expect(r.code).toBe(0)
    expect(r.out).toContain('in progress — no artifacts yet')
    expect(r.out).toContain('cospec instructions proposal --change bare')
  })

  test('unknown change exits 1 with a suggestion', async () => {
    const cwd = repo()
    writeChange(cwd, 'add-widget', 'feat')
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'add-widgets']))
    expect(r.code).toBe(1)
    expect(r.err).toContain("Did you mean 'add-widget'")
  })

  test('computeStatus reports artifacts, gate, and archive-readiness', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'ci' })
    expect(status.type).toBe('ci')
    expect(status.gate).toBe('clear')
    expect(status.tasks).toEqual({ total: 1, complete: 1 })
    expect(status.archiveReady).toBe(true)
    const specs = status.artifacts.find((a) => a.id === 'proposal')
    expect(specs?.done).toBe(true)
    // Every artifact is done, so every artifact's deps are satisfied.
    expect(status.artifacts.every((a) => a.ready)).toBe(true)
  })

  test('ready reflects the dependency graph — deps unmet means not ready', () => {
    const cwd = repo()
    // blocking-changes present but proposal (its only dep) is missing.
    const dir = writeChange(cwd, 'partial', 'ci', {
      'blocking-changes.md': EMPTY_BLOCKERS,
    })
    const status = computeStatus(cwd, { id: 'partial', dir, schema: 'ci' })
    const byId = (id: string) => status.artifacts.find((a) => a.id === id)!
    // proposal has no deps → ready even though it is not written yet.
    expect(byId('proposal')).toMatchObject({ done: false, ready: true })
    // blocking-changes requires proposal, which is not done → not ready.
    expect(byId('blocking-changes')).toMatchObject({ done: true, ready: false })
    // tasks requires proposal → not ready.
    expect(byId('tasks')).toMatchObject({ done: false, ready: false })
  })

  test('feat tasks stay not-ready until specs exists (dependency graph)', () => {
    const cwd = repo()
    // feat: tasks requires [proposal, specs]; design requires [proposal].
    const dir = writeChange(cwd, 'f', 'feat', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
    })
    const status = computeStatus(cwd, { id: 'f', dir, schema: 'feat' })
    const byId = (id: string) => status.artifacts.find((a) => a.id === id)!
    expect(byId('specs').ready).toBe(true) // only needs proposal (done)
    expect(byId('design').ready).toBe(true) // only needs proposal (done)
    expect(byId('tasks').ready).toBe(false) // needs specs, which is not written
  })

  test('human output marks each unwritten artifact ready or waiting', async () => {
    const cwd = repo()
    writeChange(cwd, 'partial', 'ci', { 'blocking-changes.md': EMPTY_BLOCKERS })
    const r = await runCmd(statusRun, ctx(cwd, ['--change', 'partial']))
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/proposal.*ready/)
    expect(r.out).toMatch(/tasks.*waiting/)
  })

  test('archiveReady is false while a hard blocker is unchecked', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': `## Blocked by\n\n- [ ] \`dep\` — needed\n\n## Soft-blocked by\n\nNone.\n`,
      'tasks.md': DONE_TASKS,
    })
    writeChange(cwd, 'dep', 'ci')
    const status = computeStatus(cwd, { id: 'c', dir, schema: 'ci' })
    expect(status.gate).toBe('blocked (1 hard)')
    expect(status.archiveReady).toBe(false)
  })

  test('gateLabel formats each state', () => {
    expect(gateLabel({ state: 'clear', hard: [], soft: [] })).toBe('clear')
    expect(gateLabel({ state: 'blocked', hard: [{ slug: 'a', active: true }], soft: [] })).toBe(
      'blocked (1 hard)',
    )
    expect(
      gateLabel({ state: 'soft-blocked', hard: [], soft: [{ slug: 'a', active: false }] }),
    ).toBe('soft-blocked (1)')
  })

  test('hasAnyArtifact detects specs-only changes', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'feat', { 'specs/w/spec.md': 'x' })
    expect(hasAnyArtifact(dir)).toBe(true)
    const empty = writeChange(cwd, 'e', 'feat')
    expect(hasAnyArtifact(empty)).toBe(false)
  })
})

describe('status --all (OpenSpec 1.11 parity)', () => {
  test('--all and --change are mutually exclusive', async () => {
    const cwd = repo()
    const r = await runCmd(statusRun, ctx(cwd, ['--all', '--change', 'bare']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('--all and --change options are mutually exclusive')
  })

  test('--json turns the mutex error into a JSON envelope on stdout', async () => {
    // A caller that asked for JSON must always get something parseable — a
    // bare stderr line leaves it with nothing to parse.
    const cwd = repo()
    const r = await runCmd(statusRun, ctx(cwd, ['--all', '--change', 'bare'], { json: true }))
    expect(r.code).toBe(1)
    expect(r.err).toBe('')
    expect(JSON.parse(r.out)).toEqual({
      changes: [],
      root: null,
      error: 'The --all and --change options are mutually exclusive.',
    })
  })

  test('--all and a positional change name are mutually exclusive', async () => {
    const cwd = repo()
    const r = await runCmd(statusRun, ctx(cwd, ['--all', 'bare']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('mutually exclusive')
  })

  test('no active changes: reports the empty case and exits 0', async () => {
    const cwd = repo()
    const r = await runCmd(statusRun, ctx(cwd, ['--all']))
    expect(r.code).toBe(0)
    expect(r.out).toContain('no active changes')
  })

  test('--all --json sweeps every change, sorted by id, in one envelope', async () => {
    const cwd = repo()
    writeChange(cwd, 'zeta', 'ci')
    writeChange(cwd, 'alpha', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true }))
    expect(r.code).toBe(0)
    const parsed = JSON.parse(r.out) as { changes: { change: string }[]; root: string }
    expect(parsed.changes.map((c) => c.change)).toEqual(['alpha', 'zeta'])
    expect(parsed.root).toBe(cwd)
  })

  test('single-change JSON shape is unchanged by the --all addition', async () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const single = await runCmd(statusRun, ctx(cwd, ['--change', 'c'], { json: true }))
    const swept = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true }))
    const sweptParsed = JSON.parse(swept.out) as { changes: unknown[] }
    expect(sweptParsed.changes).toEqual([JSON.parse(single.out)])
    expect(computeStatus(cwd, { id: 'c', dir, schema: 'ci' }).change).toBe('c')
  })

  test('one bad change does not abort the sweep — it becomes a failure entry, exit 1', async () => {
    const cwd = repo()
    writeChange(cwd, 'good', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    // A change directory with a blocking-changes.md that hasAnyArtifact sees but
    // whose content computeStatus's blocker parse can't make sense of is hard to
    // provoke deterministically; instead corrupt the artifact-presence path by
    // making blocking-changes.md a directory, so `readFileSync` throws in
    // `computeStatus`'s gate lookup.
    const badDir = writeChange(cwd, 'bad', 'ci', { 'proposal.md': LITE_PROPOSAL })
    mkdirSync(join(badDir, 'blocking-changes.md'))

    const r = await runCmd(statusRun, ctx(cwd, ['--all'], { json: true }))
    expect(r.code).toBe(1)
    const parsed = JSON.parse(r.out) as {
      changes: ({ change: string; error: string } | { change: string })[]
    }
    const bad = parsed.changes.find((c) => c.change === 'bad') as { error?: string }
    expect(bad?.error).toBeDefined()
    const good = parsed.changes.find((c) => c.change === 'good') as { archiveReady?: boolean }
    expect(good?.archiveReady).toBe(true)
  })
})

describe('list', () => {
  test('renders one row per change; empty change shows "no artifacts yet"', async () => {
    const cwd = repo()
    writeChange(cwd, 'bare', 'ci')
    writeChange(cwd, 'ready', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(listRun, ctx(cwd, []))
    expect(r.code).toBe(0)
    expect(r.out).toContain('bare')
    expect(r.out).toContain('no artifacts yet')
    expect(r.out).toContain('ready')
    expect(r.out).toContain('archive-ready')
  })

  test('--blocked filters to gated changes', async () => {
    const cwd = repo()
    writeChange(cwd, 'clear-one', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': EMPTY_BLOCKERS,
      'tasks.md': DONE_TASKS,
    })
    writeChange(cwd, 'blocked-one', 'ci', {
      'proposal.md': LITE_PROPOSAL,
      'blocking-changes.md': `## Blocked by\n\n- [ ] \`dep\` — needed\n\n## Soft-blocked by\n\nNone.\n`,
      'tasks.md': DONE_TASKS,
    })
    const r = await runCmd(listRun, ctx(cwd, ['--blocked'], { json: true }))
    const parsed = JSON.parse(r.out) as { changes: { change: string }[] }
    expect(parsed.changes.map((c) => c.change)).toEqual(['blocked-one'])
  })

  test('--specs delegates to `openspec list --specs` and renders a spec table', async () => {
    const cwd = repo()
    mkdirSync(join(cwd, 'openspec', 'specs', 'widget'), { recursive: true })
    writeFileSync(
      join(cwd, 'openspec', 'specs', 'widget', 'spec.md'),
      [
        '# widget Specification',
        '',
        '## Purpose',
        '',
        'Widgets exist to exercise `list --specs` in a fixture repo.',
        '',
        '## Requirements',
        '',
        '### Requirement: Widgets spin',
        '',
        'The system SHALL spin widgets.',
        '',
        '#### Scenario: A widget spins',
        '',
        '- **WHEN** a widget is asked to spin',
        '- **THEN** it spins',
        '',
      ].join('\n'),
    )

    const jsonResult = await runCmd(listRun, ctx(cwd, ['--specs'], { json: true }))
    expect(jsonResult.code).toBe(0)
    const parsed = JSON.parse(jsonResult.out) as {
      specs: { id: string; requirementCount: number }[]
    }
    expect(parsed.specs).toEqual([{ id: 'widget', requirementCount: 1 }])

    const humanResult = await runCmd(listRun, ctx(cwd, ['--specs']))
    expect(humanResult.code).toBe(0)
    expect(humanResult.out).toContain('widget')
    expect(humanResult.out).toContain('1 requirement')
  })
})

describe('instructions: argument handling', () => {
  test('missing artifact exits 1', async () => {
    const cwd = repo()
    const r = await runCmd(instructionsRun, ctx(cwd, []))
    expect(r.code).toBe(1)
    expect(r.err).toContain('an artifact is required')
  })

  test('non-apply artifact without --change exits 1', async () => {
    const cwd = repo()
    const r = await runCmd(instructionsRun, ctx(cwd, ['proposal']))
    expect(r.code).toBe(1)
    expect(r.err).toContain('--change <id> is required')
  })
})

describe('validate: validation before delegation', () => {
  test('no openspec/ directory exits 1 with an actionable init hint', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'cospec-noinit-'))
    roots.push(cwd)
    const r = await runCmd(validateRun, ctx(cwd, []))
    expect(r.code).toBe(1)
    expect(r.err).toContain('no openspec/ directory')
    expect(r.err).toContain("run 'cospec init' first")
  })
})
