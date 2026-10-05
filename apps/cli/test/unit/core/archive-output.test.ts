// Verification 7.3: the reader of the pinned binary's human-mode archive
// summary, on stdout captured from `openspec archive c1 -y` (1.13.1).

import { describe, expect, test } from 'bun:test'

import { readArchiveSummary, relayedReason } from '../../../src/core/archive-output.ts'

const APPLIED = `Task status: ✓ Complete
Specs to update:
  widgets: create
⚠️  Warning: widgets - 1 REMOVED requirement(s) ignored for new spec (nothing to remove).
Applying changes to openspec/specs/widgets/spec.md:
  + 1 added
Totals: + 1, ~ 0, - 0, → 0
Specs updated successfully.
Change 'c1' archived as '2026-10-05-c1'.
`

const IN_SYNC = `Task status: ✓ Complete
Specs to update:
  widgets: create
⚠️  Warning: widgets - 1 REMOVED requirement(s) ignored for new spec (nothing to remove).
Totals: + 0, ~ 0, - 0, → 0
Specs already in sync; no files changed.
Change 'c1' archived as '2026-10-05-c1'.
`

const SKIPPED = `Task status: ✓ Complete
Skipping spec updates (--skip-specs flag provided).
Change 'c1' archived as '2026-10-05-c1'.
`

const RETIRED = `Task status: ✓ Complete
Specs to update:
  widgets: update
Retiring openspec/specs/widgets/spec.md: all requirements removed.
   If it was committed, restore it with: git checkout HEAD -- ":(top)openspec/specs/widgets/spec.md"
Totals: + 0, ~ 0, - 1, → 0
Specs updated successfully.
Change 'c1' archived as '2026-10-05-c1'.
`

describe('readArchiveSummary', () => {
  test('an applied merge: totals, specsUpdated true and the merge warning', () => {
    expect(readArchiveSummary(APPLIED, ['widgets'])).toEqual({
      totals: { added: 1, modified: 0, removed: 0, renamed: 0 },
      specsUpdated: true,
      warnings: ['widgets - 1 REMOVED requirement(s) ignored for new spec (nothing to remove).'],
    })
  })

  test('an in-sync merge: zero totals, specsUpdated false', () => {
    const summary = readArchiveSummary(IN_SYNC, ['widgets'])
    expect(summary.totals).toEqual({ added: 0, modified: 0, removed: 0, renamed: 0 })
    expect(summary.specsUpdated).toBe(false)
  })

  test('--skip-specs: no totals and no specsUpdated, left to the caller', () => {
    expect(readArchiveSummary(SKIPPED, ['widgets'])).toEqual({ warnings: [] })
  })

  test('a stdout with no Totals line has no totals', () => {
    expect(readArchiveSummary("Change 'c1' archived as '2026-10-05-c1'.\n").totals).toBeUndefined()
  })

  test("a retirement becomes the binary's JSON note", () => {
    expect(readArchiveSummary(RETIRED, ['widgets']).warnings).toEqual([
      'widgets - capability retired; deleted the main spec (all requirements removed, declared by retire_capabilities) at openspec/specs/widgets/spec.md. Its section(s) went with it: Purpose. If it was committed, restore it with: git checkout HEAD -- ":(top)openspec/specs/widgets/spec.md"',
    ])
  })

  test('a line that only resembles one is not read', () => {
    expect(
      readArchiveSummary('  Totals: + 1, ~ 0, - 0, → 0\nSpecs updated successfully!\n'),
    ).toEqual({
      warnings: [],
    })
  })
})

describe('relayedReason', () => {
  test("the line before the binary's Aborted closer", () => {
    expect(
      relayedReason('Specs to update:\nwidgets MODIFIED failed\nAborted. No files were changed.\n'),
    ).toBe('widgets MODIFIED failed')
  })

  test("the CLI's Error line, its message", () => {
    expect(
      relayedReason(
        "Task status: ✓ Complete\n✖ Error: Spec updates for 'a' and 'b' resolve to the same target x.\n",
      ),
    ).toBe("Spec updates for 'a' and 'b' resolve to the same target x.")
  })
})
