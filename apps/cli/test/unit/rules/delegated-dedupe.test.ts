// The merge step that joins cospec's own rule output to `openspec validate`'s
// (commands/validate.ts). It lives beside the rule-family tests because what it
// tests is a property OF those rules: which cospec finding makes which
// delegated finding redundant.

import { describe, expect, test } from 'bun:test'

import { archivedSlugsFor, mergeDelegated } from '../../../src/commands/validate.ts'
import type { Issue } from '../../../src/core/rules/issue.ts'

function delegated(message: string, path = 'specs/widgets/spec.md'): Issue {
  return { level: 'ERROR', rule: 'openspec/validate', path, message }
}

function native(rule: string, message: string, path = 'specs/widgets/spec.md'): Issue {
  return { level: 'ERROR', rule, path, message }
}

describe('mergeDelegated', () => {
  test('keeps every delegated issue when no cospec rule covers it', () => {
    const d = [delegated('ADDED "X" must include at least one scenario')]
    expect(mergeDelegated([], d)).toEqual(d)
  })

  test('drops the delegated purpose placeholder once specs/purpose-tbd fired', () => {
    const merged = mergeDelegated(
      [native('specs/purpose-tbd', '## Purpose still holds the placeholder', 'specs/x/spec.md')],
      [
        delegated(
          'Purpose section is still a placeholder rather than a Purpose anyone wrote',
          'overview',
        ),
      ],
    )
    expect(merged.map((i) => i.rule)).toEqual(['specs/purpose-tbd'])
  })

  test('keeps the delegated purpose placeholder when cospec did not fire', () => {
    const d = [delegated('Purpose section is still a placeholder rather than…', 'overview')]
    expect(mergeDelegated([], d)).toEqual(d)
  })

  test('drops the delegated root-level delta block once deltas/spec-at-specs-root fired', () => {
    const merged = mergeDelegated(
      [native('deltas/spec-at-specs-root', 'delta spec found at specs/spec.md', 'specs/spec.md')],
      [delegated('Delta spec found at specs/spec.md. Delta specs must live…', 'specs/spec.md')],
    )
    expect(merged.map((i) => i.rule)).toEqual(['deltas/spec-at-specs-root'])
  })

  test('drops the delegated skip_specs conflict once cospec reported it', () => {
    const merged = mergeDelegated(
      [native('deltas/skip-specs-conflict', 'skip_specs is set but 1 file(s) exist', 'specs/x.md')],
      [
        delegated(
          'skip_specs is set in .openspec.yaml but spec files exist under specs/. Remove skip_specs…',
          'file',
        ),
      ],
    )
    expect(merged.map((i) => i.rule)).toEqual(['deltas/skip-specs-conflict'])
  })

  describe('scenario loss', () => {
    // The name-identity shape cospec prints today.
    const nativeDrop = native(
      'archive/scenario-preservation',
      'MODIFIED "Widget rendering" drops scenario(s) "Empty widget" (living 2 -> delta 1)',
    )
    const delegatedDrop = delegated(
      'MODIFIED "Widget rendering" omits scenario(s) the current spec still has: "Empty widget".',
    )

    test('drops the delegated twin naming the same requirement on the same file', () => {
      expect(mergeDelegated([nativeDrop], [delegatedDrop]).map((i) => i.rule)).toEqual([
        'archive/scenario-preservation',
      ])
    })

    // The count arm's wording is the other shape the suppressor must still key
    // on — it fires whenever the two parsers disagree about scenario names.
    test('drops the delegated twin of a count-arm drop too', () => {
      const countArm = native(
        'archive/scenario-preservation',
        'MODIFIED "Widget rendering" drops scenario count from 2 to 1',
      )
      expect(mergeDelegated([countArm], [delegatedDrop]).map((i) => i.rule)).toEqual([
        'archive/scenario-preservation',
      ])
    })

    test('keeps a delegated loss for a DIFFERENT requirement', () => {
      // Both sides key on the requirement name, so a second requirement losing
      // a scenario is a second real finding, not a duplicate.
      const other = delegated(
        'MODIFIED "Widget sizing" omits scenario(s) the current spec still has: "Wide".',
      )
      expect(mergeDelegated([nativeDrop], [other]).map((i) => i.rule)).toEqual([
        'archive/scenario-preservation',
        'openspec/validate',
      ])
    })

    test('keeps a delegated loss on a different capability file', () => {
      const other = delegated(
        'MODIFIED "Widget rendering" omits scenario(s) the current spec still has: "Empty".',
        'specs/gadgets/spec.md',
      )
      expect(mergeDelegated([nativeDrop], [other])).toHaveLength(2)
    })
  })
})

describe('archivedSlugsFor', () => {
  test('strips the archive date prefix', () => {
    expect(archivedSlugsFor('2026-07-04-add-widgets')).toEqual([
      'add-widgets',
      '2026-07-04-add-widgets',
    ])
  })

  test('an undated directory is its own slug', () => {
    expect(archivedSlugsFor('add-widgets')).toEqual(['add-widgets'])
  })

  test('a date-prefixed slug resolves under both readings', () => {
    // openspec >=1.7.0 archives `2026-07-04-thing` verbatim rather than stamping
    // a second date on it, so the directory name is ambiguous on disk. A blocker
    // naming either reading must resolve.
    expect(archivedSlugsFor('2026-07-04-2026-07-04-thing')).toEqual([
      '2026-07-04-thing',
      '2026-07-04-2026-07-04-thing',
    ])
  })
})
