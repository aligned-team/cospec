// Delta bullet markers, probed against the REAL pinned binary (DESIGN §8.2).
//
// cospec's delta reader accepts CommonMark's full bullet set (`-`, `*`, `+`)
// with leading whitespace, and at the 1.13.1 pin so does the binary — its
// `requirement-blocks.ts` REMOVED and FROM:/TO: readers take `[-*+]`. Both
// halves of that statement have a history, re-probed at every pin bump:
//
// - **Leading whitespace** has been accepted since at least 1.11.0 (`^\s*`
//   anchors every delta regex), so an indented entry has always been portable.
// - **`*` and `+` arrived in 1.13.1.** 1.11.0's REMOVED reader was
//   ``/^\s*-\s*`?###\s*Requirement:\s*(.+?)`?\s*$/`` and its `FROM:`/`TO:`
//   readers took an optional SINGLE hyphen, so the same delta was refused
//   (`no requirement entries parsed`) and cospec relayed that refusal rather
//   than archiving on its own reading.
//
// So this file used to record a disagreement and now records an agreement. It
// is kept because the accepted openspec range is still `>=1.0.0 <2.0.0`: on a
// 1.0.0–1.13.0 runtime the binary refuses these deltas, and what keeps that
// from becoming a false archive PASS is not cospec's parser — it is the
// delegated `openspec validate` relay plus `cospec archive` verifying the move
// on disk. Both are still asserted, through the agreement case: an archive
// claimed here is an archive that really happened.

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

type Build = (root: string, marker: string, name: string) => void

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

describe('delta bullet markers at the 1.13.1 pin', () => {
  for (const marker of ['*', '+'] as const) {
    test(`REMOVED \`${marker}\`: both readers apply it`, async () => {
      await expectBothApply(
        buildMarkerRemoved,
        marker,
        `marker-removed-${marker === '*' ? 'star' : 'plus'}`,
      )
    })

    test(`RENAMED \`${marker}\`: both readers apply it`, async () => {
      await expectBothApply(
        buildMarkerRenamed,
        marker,
        `marker-renamed-${marker === '*' ? 'star' : 'plus'}`,
      )
    })
  }

  // The control that keeps the whitespace half of the claim honest: the SAME
  // fixtures with an indented hyphen, which both readers have always taken.
  test('REMOVED with an indented `-`: both readers apply it', async () => {
    await expectBothApply(buildMarkerRemoved, '  -', 'marker-removed-indented')
  })

  test('RENAMED with an indented `-`: both readers apply it', async () => {
    await expectBothApply(buildMarkerRenamed, '  -', 'marker-renamed-indented')
  })
})
