// Probe §5.5 gotcha regressions (DESIGN §8.2). The dangerous openspec behavior:
// an invalid delta makes `openspec archive -y` print "Aborted." and NOT move the
// change. Each test first pins that real behavior, then asserts cospec never
// reports success when openspec no-ops.
//
// Re-probed against the 1.11.0 pin (2026-09-01). The exit code moved: an
// aborted archive now exits 1, where it exited 0 through 1.6.x. Everything the
// design leans on is unchanged — the change directory is not moved and stdout
// still ends `Aborted. No files were changed.`, which ABORTED_RE matches.
//
// The exit-code-is-not-enough discipline STAYS. cospec accepts openspec
// `>=1.0.0 <2.0.0`, and on 1.0.0–1.6.x an aborted archive really does exit 0,
// so a cospec that trusted the exit code would report a successful archive that
// never happened on any of those runtimes. These tests therefore assert the
// post-conditions (unmoved directory, abort banner) and read the exit code as
// one term among several, exactly as `cospec archive` step 9 does.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { formatLocalDate } from '../../src/commands/archive.ts'
import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { PARITY_FIXTURES } from './fixtures.ts'

afterAll(cleanupAll)

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
- [x] 1.2 Add a covering test
`

function fixture(key: string): (typeof PARITY_FIXTURES)[number] {
  const f = PARITY_FIXTURES.find((p) => p.key === key)
  if (f === undefined) throw new Error(`missing fixture ${key}`)
  return f
}

function markDone(root: string, name: string): void {
  writeFiles(root, { [`openspec/changes/${name}/tasks.md`]: TASKS_DONE })
}

function movedToArchive(root: string, name: string): boolean {
  return !existsSync(join(root, 'openspec/changes', name))
}

describe('archive gotcha regressions (re-probed at 1.11.0: aborts now exit 1)', () => {
  test('no-op delta: openspec aborts without moving the change; cospec refuses to claim success', async () => {
    const name = 'zero-op-delta'
    // Pin the real openspec behaviour.
    const oRepo = mkTempRepo({ git: true })
    fixture(name).build(oRepo)
    const o = await openspec(['archive', name, '-y'], oRepo)
    // The post-conditions cospec's step 9 actually reads.
    expect(o.stdout).toMatch(/\bAborted\b/)
    expect(o.stdout).toContain('Aborted. No files were changed.')
    expect(movedToArchive(oRepo, name)).toBe(false)
    // 1.7.0 gave the abort a non-zero exit; below that it was 0.
    expect(o.exitCode).toBe(1)

    // cospec must NOT silently succeed.
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(false)
  })

  test('MODIFIED vs missing target: same abort; cospec refuses', async () => {
    const name = 'modified-missing-target'
    const oRepo = mkTempRepo({ git: true })
    fixture(name).build(oRepo)
    const o = await openspec(['archive', name, '-y'], oRepo)
    expect(o.stdout).toMatch(/\bAborted\b/)
    expect(o.stdout).toContain('Aborted. No files were changed.')
    expect(movedToArchive(oRepo, name)).toBe(false)
    expect(o.exitCode).toBe(1)

    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name], { cwd: cRepo })
    expect(c.exitCode).not.toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(false)
  })

  test('--skip-specs genuinely moves a change openspec would otherwise abort on', async () => {
    const name = 'modified-missing-target'
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name, '--skip-specs'], { cwd: cRepo })
    expect(c.exitCode).toBe(0)
    expect(movedToArchive(cRepo, name)).toBe(true)
  })

  // The slot openspec claims is stamped with the LOCAL calendar date
  // (`formatLocalDate`, src/utils/date.ts), not `toISOString()`'s UTC one.
  //
  // `bun test` runs the suite process in UTC while a spawned child inherits the
  // machine's own zone, so a test that derived the slot from the test process's
  // clock would silently pass on a UTC CI box and fail on a developer's laptop.
  // Both are pinned instead in a zone whose calendar date is deliberately NOT
  // today's UTC date — the exact condition under which the old UTC stamp made
  // cospec look for a slot openspec never created. UTC+14 is a day ahead of UTC
  // from 10:00 UTC on and UTC-12 is a day behind before 12:00, so one of the two
  // always disagrees with today's UTC date whenever this suite runs.
  const SKEWED_ZONE = new Date().getUTCHours() >= 12 ? 'Pacific/Kiritimati' : 'Etc/GMT+12'
  const ORIGINAL_ZONE = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone

  // `process.env.TZ = …` changes the SUITE process's zone (Bun re-reads it on a
  // set, which is also why it is restored by assignment and never `delete`d),
  // but it does NOT survive `{ ...process.env }` — a spawned child inherits the
  // machine's zone instead. So every child below is handed `TZ` explicitly; the
  // assignment here only makes `formatLocalDate()` agree with them.
  beforeAll(() => {
    process.env.TZ = SKEWED_ZONE
  })
  afterAll(() => {
    process.env.TZ = ORIGINAL_ZONE
  })

  test(`the archive slot is stamped in local time, not UTC (${SKEWED_ZONE})`, async () => {
    const name = 'valid-added'
    const localDate = formatLocalDate()
    expect(localDate).not.toBe(new Date().toISOString().slice(0, 10))

    const oRepo = mkTempRepo({ git: true })
    fixture(name).build(oRepo)
    const o = await openspec(['archive', name, '-y'], oRepo, { TZ: SKEWED_ZONE })
    expect(o.exitCode).toBe(0)
    expect(o.stdout).toContain(`archived as '${localDate}-${name}'`)
    expect(existsSync(join(oRepo, 'openspec/changes/archive', `${localDate}-${name}`))).toBe(true)

    // cospec must claim the SAME slot, and report success rather than the
    // HALF-STATE a UTC stamp produced whenever the two dates disagreed.
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    const c = await cospec(['archive', name], { cwd: cRepo, env: { TZ: SKEWED_ZONE } })
    expect(c.exitCode).toBe(0)
    expect(c.stdout).toContain(`openspec/changes/archive/${localDate}-${name}/`)
    expect(movedToArchive(cRepo, name)).toBe(true)
  })

  test('duplicate archive slot for today → exit 1 before touching the tree', async () => {
    const name = 'valid-added'
    const localDate = formatLocalDate()
    const cRepo = mkTempRepo({ git: true })
    fixture(name).build(cRepo)
    markDone(cRepo, name)
    // Pre-create the archive slot that today's archive would claim.
    writeFiles(cRepo, {
      [`openspec/changes/archive/${localDate}-${name}/.openspec.yaml`]: 'schema: feat\n',
    })
    const c = await cospec(['archive', name], { cwd: cRepo, env: { TZ: SKEWED_ZONE } })
    expect(c.exitCode).toBe(1)
    expect(c.stderr).toContain(`${localDate}-${name}`)
    // The live change must remain in place (not half-archived).
    expect(movedToArchive(cRepo, name)).toBe(false)
  })
})
