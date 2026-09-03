// Pure helpers behind `cospec archive`'s steps 5, 9 and 12: the archive slot's
// date stamp, the date-agnostic target matcher, and the warning relay. Each is
// exercised directly here so the behaviours have coverage that does not depend
// on the wrapped binary or on the machine's clock and time zone.

import { describe, expect, test } from 'bun:test'

import {
  collectArchiveWarnings,
  formatLocalDate,
  isArchiveTargetFor,
} from '../../../src/commands/archive.ts'

/**
 * Bun re-reads `process.env.TZ` on the next Date operation — but only on a SET,
 * not on a `delete`, so the zone is always restored by assignment (falling back
 * to the runtime's own resolved zone when TZ was unset).
 */
function inZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    process.env.TZ = previous
  }
}

describe('formatLocalDate', () => {
  // 2026-07-05T22:00:00Z is 2026-07-06 in Tokyo and 2026-07-05 in UTC-12, while
  // `toISOString().slice(0,10)` says 2026-07-05 in both. openspec stamps the
  // LOCAL date (`formatLocalDate`, src/utils/date.ts), so a UTC stamp puts
  // cospec's archive slot on the wrong day for part of every day east of UTC —
  // the collision pre-check looks at the wrong slot and step 9 fails to
  // recognise a successful archive.
  // Built inside the zone: a Date caches its local-time fields on first use.
  const INSTANT = '2026-07-05T22:00:00Z'

  test('east of UTC it stamps tomorrow, where toISOString() still says today', () => {
    expect(inZone('Asia/Tokyo', () => formatLocalDate(new Date(INSTANT)))).toBe('2026-07-06')
    expect(new Date(INSTANT).toISOString().slice(0, 10)).toBe('2026-07-05')
  })

  test('west of UTC it agrees with the UTC date for the same instant', () => {
    expect(inZone('Etc/GMT+12', () => formatLocalDate(new Date(INSTANT)))).toBe('2026-07-05')
  })

  test('zero-pads month and day', () => {
    expect(formatLocalDate(new Date(2026, 0, 3, 12))).toBe('2026-01-03')
    expect(formatLocalDate(new Date(2026, 10, 30, 12))).toBe('2026-11-30')
  })
})

describe('isArchiveTargetFor', () => {
  test('accepts the dated form openspec creates for a normal slug', () => {
    expect(isArchiveTargetFor('fix-oauth', '2026-07-04-fix-oauth')).toBe(true)
    expect(isArchiveTargetFor('fix-oauth', '2026-12-31-fix-oauth')).toBe(true)
  })

  test('rejects a different change archived on the same day', () => {
    expect(isArchiveTargetFor('fix-oauth', '2026-07-04-fix-oauth-again')).toBe(false)
    expect(isArchiveTargetFor('fix-oauth', '2026-07-04-other')).toBe(false)
  })

  test('rejects an undated directory for an undated slug', () => {
    expect(isArchiveTargetFor('fix-oauth', 'fix-oauth')).toBe(false)
  })

  test('accepts BOTH forms for a slug that already carries a date prefix', () => {
    // openspec 1.7.0+ keeps the prefix verbatim (#1309); older binaries in
    // cospec's accepted range re-prefix it. Both are the same successful archive.
    expect(isArchiveTargetFor('2026-07-04-thing', '2026-07-04-thing')).toBe(true)
    expect(isArchiveTargetFor('2026-07-04-thing', '2026-09-01-2026-07-04-thing')).toBe(true)
  })

  test('treats regex metacharacters in a slug literally', () => {
    expect(isArchiveTargetFor('a.b', '2026-07-04-axb')).toBe(false)
    expect(isArchiveTargetFor('a.b', '2026-07-04-a.b')).toBe(true)
  })
})

describe('collectArchiveWarnings', () => {
  test('picks up a spec-merge warning printed on the success path', () => {
    const stdout = [
      'Task status: ✓ Complete',
      '',
      'Specs to update:',
      '  widgets: update',
      '⚠️  Warning: widgets - REMOVED requirement "Gone" is not in the current spec; treating it as already removed.',
      'Totals: + 0, ~ 1, - 0, → 0',
      "Change 'x' archived as '2026-09-01-x'.",
    ].join('\n')
    expect(collectArchiveWarnings(stdout)).toEqual([
      'widgets - REMOVED requirement "Gone" is not in the current spec; treating it as already removed.',
    ])
  })

  test('carries a retirement notice and its recovery hint as one warning', () => {
    const stdout = [
      'Specs to update:',
      '  widgets: update',
      'Retiring openspec/specs/widgets/spec.md: all requirements removed.',
      '   If it was committed, restore it with: git checkout HEAD -- ":(top)openspec/specs/widgets/spec.md"',
      'Totals: + 0, ~ 0, - 1, → 0',
    ].join('\n')
    expect(collectArchiveWarnings(stdout)).toEqual([
      'Retiring openspec/specs/widgets/spec.md: all requirements removed. ' +
        'If it was committed, restore it with: git checkout HEAD -- ":(top)openspec/specs/widgets/spec.md"',
    ])
  })

  test('picks up the non-blocking proposal-warning bullets', () => {
    const stdout = [
      '',
      'Proposal warnings in proposal.md (non-blocking):',
      '  ⚠ Change must have at least one delta. No deltas found.',
      'Task status: ✓ Complete',
      '  widgets: update',
    ].join('\n')
    expect(collectArchiveWarnings(stdout)).toEqual([
      'Change must have at least one delta. No deltas found.',
    ])
  })

  test('does not mistake ordinary archive output for a warning', () => {
    const stdout = [
      'Task status: ✓ Complete',
      '',
      'Specs to update:',
      '  widgets: update',
      'Totals: + 1, ~ 0, - 0, → 0',
      'Specs updated successfully.',
      "Change 'x' archived as '2026-09-01-x'.",
    ].join('\n')
    expect(collectArchiveWarnings(stdout)).toEqual([])
  })

  test('deduplicates a warning openspec prints more than once', () => {
    const line = '⚠️  Warning: widgets - delta Purpose ignored; widgets already has one.'
    expect(collectArchiveWarnings([line, 'Totals: + 0, ~ 1, - 0, → 0', line].join('\n'))).toEqual([
      'widgets - delta Purpose ignored; widgets already has one.',
    ])
  })

  test('no warning text ever contains the abort/cancel markers step 9 keys on', () => {
    // Step 9 computes success from `/\bAborted\b/` and `/\bArchive cancelled\b/`
    // over the SAME stdout. A relayed warning must never trip either one.
    const stdout = [
      'Proposal warnings in proposal.md (non-blocking):',
      '  ⚠ If this change intentionally modifies no specs (pure refactor, tooling, docs), set "skip_specs: true" in the change\'s .openspec.yaml instead.',
      '⚠️  Warning: widgets - REMOVED requirement "Gone" is not in the current spec; treating it as already removed.',
      'Retiring openspec/specs/widgets/spec.md: all requirements removed.',
    ].join('\n')
    for (const w of collectArchiveWarnings(stdout)) {
      expect(/\bAborted\b/.test(w)).toBe(false)
      expect(/\bArchive cancelled\b/.test(w)).toBe(false)
    }
    expect(collectArchiveWarnings(stdout)).toHaveLength(3)
  })
})
