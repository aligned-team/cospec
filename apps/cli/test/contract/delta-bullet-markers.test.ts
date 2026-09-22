// Delta bullet markers, probed against the REAL pinned binary (DESIGN §8.2).
//
// cospec's delta reader accepts CommonMark's full bullet set (`-`, `*`, `+`)
// with leading whitespace. The PINNED 1.11.0 binary does not, and the halves of
// that statement have different histories — probed from
// `src/core/parsers/requirement-blocks.ts` at both tags, then confirmed by
// spawning the binary here:
//
// - **Leading whitespace** was already accepted at 1.11.0 (`^\s*` anchors every
//   one of its delta regexes), so an indented entry is portable at the pin.
// - **The `*` and `+` markers are 1.13.1-only.** 1.11.0's REMOVED reader is
//   ``/^\s*-\s*`?###\s*Requirement:\s*(.+?)`?\s*$/`` and its `FROM:`/`TO:`
//   readers take an optional SINGLE hyphen; 1.13.1 widened both to `[-*+]`.
//
// So the marker class is the one place in this change where cospec's native
// reader LEADS the pin rather than catching up to it, and a `*`/`+` delta is
// not portable at 1.11.0 — the earlier claim that the pin "already accepted
// `[-*+]`" was wrong. What keeps that from becoming a false archive PASS is not
// the parser: it is the delegated `openspec validate` relay (rule
// `openspec/validate`), which carries the binary's own refusal into cospec's
// report, plus `cospec archive` verifying the move on disk rather than trusting
// its own preconditions. Both are asserted below.
//
// At the 1.13.1 pin bump the `*`/`+` expectations here flip — the binary
// accepts the delta, the relay goes quiet, and both sides archive. Restamp this
// file there; deleting it would drop the only evidence of what the accepted
// range `>=1.0.0 <2.0.0` does with these markers below 1.13.1.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, openspec, writeFiles } from '../fixtures/support.ts'
import { buildMarkerRemoved, buildMarkerRenamed, MARKER_TARGET } from './fixtures.ts'

afterAll(cleanupAll)

const TASKS_DONE = `## 1. Implementation

- [x] 1.1 Implement the capability
- [x] 1.2 Add a covering test
`

function markDone(root: string, name: string): void {
  writeFiles(root, { [`openspec/changes/${name}/tasks.md`]: TASKS_DONE })
}

function movedToArchive(root: string, name: string): boolean {
  return !existsSync(join(root, 'openspec/changes', name))
}

function livingSpecText(root: string): string {
  return readFileSync(join(root, 'openspec/specs/widgets/spec.md'), 'utf8')
}

/** 1.11.0's message for a delta section whose only entry it could not read. */
const NO_ENTRIES_RE = /no requirement entries parsed/

type Build = (root: string, marker: string, name: string) => void

/**
 * The pinned binary refuses `marker`, and cospec — whose own parser reads it —
 * still never reports the change clean, and still never claims an archive.
 */
async function expectPinRefuses(build: Build, marker: string, name: string): Promise<void> {
  const oRepo = mkTempRepo({ git: true })
  build(oRepo, marker, name)
  const ov = await openspec(['validate', name, '--strict'], oRepo)
  expect(ov.exitCode).toBe(1)
  const oa = await openspec(['archive', name, '-y'], oRepo)
  expect(oa.exitCode).toBe(1)
  expect(oa.stdout).toMatch(NO_ENTRIES_RE)
  expect(movedToArchive(oRepo, name)).toBe(false)
  expect(livingSpecText(oRepo)).toContain(MARKER_TARGET)

  // cospec's native parser DOES read the entry, so nothing in its own rule set
  // objects. The relayed `openspec validate` failure is what keeps the verdict
  // honest at the pin.
  const cRepo = mkTempRepo({ git: true })
  build(cRepo, marker, name)
  const cv = await cospec(['validate', name, '--strict'], { cwd: cRepo })
  expect(cv.exitCode).toBe(1)
  expect(cv.stdout).toContain('openspec/validate')
  expect(cv.stdout).toMatch(NO_ENTRIES_RE)

  markDone(cRepo, name)
  const ca = await cospec(['archive', name], { cwd: cRepo })
  expect(ca.exitCode).not.toBe(0)
  expect(movedToArchive(cRepo, name)).toBe(false)
  expect(livingSpecText(cRepo)).toContain(MARKER_TARGET)
}

/** Both readers accept `marker`, and both sides apply the delta. */
async function expectBothApply(build: Build, marker: string, name: string): Promise<void> {
  const oRepo = mkTempRepo({ git: true })
  build(oRepo, marker, name)
  const oa = await openspec(['archive', name, '-y'], oRepo)
  expect(oa.exitCode).toBe(0)
  expect(movedToArchive(oRepo, name)).toBe(true)
  expect(livingSpecText(oRepo)).not.toContain(`### Requirement: ${MARKER_TARGET}`)

  const cRepo = mkTempRepo({ git: true })
  build(cRepo, marker, name)
  const cv = await cospec(['validate', name, '--strict'], { cwd: cRepo })
  expect(cv.exitCode).toBe(0)
  markDone(cRepo, name)
  const ca = await cospec(['archive', name], { cwd: cRepo })
  expect(ca.exitCode).toBe(0)
  expect(movedToArchive(cRepo, name)).toBe(true)
  expect(livingSpecText(cRepo)).not.toContain(`### Requirement: ${MARKER_TARGET}`)
}

describe('delta bullet markers at the 1.11.0 pin', () => {
  for (const marker of ['*', '+'] as const) {
    test(`REMOVED \`${marker}\`: the pin refuses it; cospec relays the refusal`, async () => {
      await expectPinRefuses(
        buildMarkerRemoved,
        marker,
        `marker-removed-${marker === '*' ? 'star' : 'plus'}`,
      )
    })

    test(`RENAMED \`${marker}\`: the pin refuses it; cospec relays the refusal`, async () => {
      await expectPinRefuses(
        buildMarkerRenamed,
        marker,
        `marker-renamed-${marker === '*' ? 'star' : 'plus'}`,
      )
    })
  }

  // The control that keeps the whitespace half of the claim honest: the SAME
  // fixtures with an indented hyphen are read by both binaries, so widening
  // cospec to `^\s*` really was catching up to the pin.
  test('REMOVED with an indented `-`: both readers apply it', async () => {
    await expectBothApply(buildMarkerRemoved, '  -', 'marker-removed-indented')
  })

  test('RENAMED with an indented `-`: both readers apply it', async () => {
    await expectBothApply(buildMarkerRenamed, '  -', 'marker-renamed-indented')
  })
})
