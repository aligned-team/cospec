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

/** openspec 1.13.1's unread-delta ERROR, verbatim. */
function unreadDelegated(path: string, expected: string): string {
  return (
    `Delta spec found at specs/${path}. Delta specs must be a spec.md inside a capability ` +
    `folder — this file is ignored when the change is applied or archived. Move its ` +
    `requirements into specs/${expected}.`
  )
}

/** cospec's `deltas/unread-file` message for the same file. */
function unreadNative(path: string): string {
  return (
    `delta spec found at specs/${path} — delta specs must be a capability's spec.md; this ` +
    `file is ignored when the change is applied or archived`
  )
}

/** An archive-preflight INFO as `Validator.findArchiveBlockers` wraps it. */
function preflight(tail: string, path = 'specs/widgets/spec.md'): Issue {
  return {
    level: 'INFO',
    rule: 'openspec/validate',
    path,
    message: `Archive would refuse this delta: widgets ${tail}`,
  }
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

  // Both message literals below are openspec 1.13.1's and cospec's, verbatim:
  // the two open with the same six words, which is exactly why the suppressor
  // has to read further than the prefix.
  const ROOT_NATIVE =
    'delta spec found at specs/spec.md — delta specs must live under a capability path ' +
    '(specs/<capability-path>/spec.md); a file at the specs/ root is ignored when the change ' +
    'is applied or archived'
  const ROOT_DELEGATED =
    'Delta spec found at specs/spec.md. Delta specs must live under a capability path ' +
    '(e.g. specs/<capability-path>/spec.md) — a file at the specs/ root is ignored when the ' +
    'change is applied or archived.'

  test('drops the delegated root-level delta block once deltas/spec-at-specs-root fired', () => {
    const merged = mergeDelegated(
      [native('deltas/spec-at-specs-root', ROOT_NATIVE, 'specs/spec.md')],
      [delegated(ROOT_DELEGATED, 'specs/spec.md')],
    )
    expect(merged.map((i) => i.rule)).toEqual(['deltas/spec-at-specs-root'])
  })

  describe('unread delta files (1.13.1)', () => {
    // A file named `spec.md.md` at the specs/ root is the shape that makes the
    // two classes collide: openspec's unread-delta message opens with the same
    // words as its root-level-spec message, and the root-level class used to
    // suppress on rule alone.
    test('drops the delegated twin once deltas/unread-file fired on the same file', () => {
      const merged = mergeDelegated(
        [native('deltas/unread-file', unreadNative('widgets/notes.md'), 'specs/widgets/notes.md')],
        [
          delegated(
            unreadDelegated('widgets/notes.md', 'widgets/spec.md'),
            'specs/widgets/notes.md',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['deltas/unread-file'])
    })

    test('keeps the delegated twin for a DIFFERENT unread file', () => {
      const merged = mergeDelegated(
        [native('deltas/unread-file', unreadNative('widgets/notes.md'), 'specs/widgets/notes.md')],
        [
          delegated(
            unreadDelegated('gadgets/draft.md', 'gadgets/spec.md'),
            'specs/gadgets/draft.md',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['deltas/unread-file', 'openspec/validate'])
    })

    // The regression D5 exists for: `specs/spec.md.md` is an unread delta file
    // whose delegated message begins `Delta spec found at specs/spec.md`, and a
    // change can carry both defects at once.
    test('a root-level spec.md finding never swallows the unread spec.md.md finding', () => {
      const merged = mergeDelegated(
        [native('deltas/spec-at-specs-root', ROOT_NATIVE, 'specs/spec.md')],
        [
          delegated(ROOT_DELEGATED, 'specs/spec.md'),
          delegated(unreadDelegated('spec.md.md', 'spec.md/spec.md'), 'specs/spec.md.md'),
        ],
      )
      expect(merged.map((i) => i.message)).toEqual([
        ROOT_NATIVE,
        unreadDelegated('spec.md.md', 'spec.md/spec.md'),
      ])
    })
  })

  // 1.13.1 warns where cospec errors, on the same state.
  test('drops the delegated zero-checkbox warning once tasks/has-tasks fired', () => {
    const merged = mergeDelegated(
      [native('tasks/has-tasks', 'no trackable `- [ ] ` / `- [x] ` task items found', 'tasks.md')],
      [
        delegated(
          'This change counts as 0 tasks: no line in its tracked task files is a checkbox, so ' +
            '"openspec list" and "openspec status" report no work and "openspec archive" has ' +
            'nothing to flag as incomplete. Write each task as "- [ ] 1.1 Description".',
          'tasks.md',
        ),
      ],
    )
    expect(merged.map((i) => i.rule)).toEqual(['tasks/has-tasks'])
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

  // openspec 1.12+ dry-runs archive's merge during validate and relays each
  // thrown precondition as an INFO prefixed `Archive would refuse this delta:`.
  // Every literal below is the real 1.13.1 throw from `src/core/specs-apply.ts`,
  // wrapped exactly as `Validator.findArchiveBlockers` wraps it.
  describe('archive-preflight INFO (1.12+)', () => {
    test('drops the MODIFIED-not-found twin of archive/target-missing', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'MODIFIED target "Widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [preflight('MODIFIED failed for header "### Requirement: Widget rendering" - not found')],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/target-missing'])
    })

    test('keeps a preflight INFO naming a DIFFERENT requirement', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'MODIFIED target "Widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [preflight('MODIFIED failed for header "### Requirement: Widget sizing" - not found')],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/target-missing', 'openspec/validate'])
    })

    test('keeps a preflight INFO on a different capability file', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'MODIFIED target "Widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [
          preflight(
            'MODIFIED failed for header "### Requirement: Widget rendering" - not found',
            'specs/gadgets/spec.md',
          ),
        ],
      )
      expect(merged).toHaveLength(2)
    })

    // The near-miss tails are the reason every capture stops inside the closing
    // quote: an anchored-to-end key would never match these.
    test('drops the REMOVED-not-found twin even with the near-miss tail', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'REMOVED target "widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [
          preflight(
            'REMOVED failed for header "### Requirement: widget rendering" - not found, but "### Requirement: Widget rendering" exists; fix the header to match it exactly',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/target-missing'])
    })

    test('drops the RENAMED-source-not-found twin even with the near-miss tail', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'RENAMED target "widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [
          preflight(
            'RENAMED failed for header "### Requirement: widget rendering" - source not found, but "### Requirement: Widget rendering" exists; fix the header to match it exactly',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/target-missing'])
    })

    test('drops the RENAMED-target-exists twin of archive/added-exists', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/added-exists',
            `RENAMED target "Widget caching" collides with an existing requirement in capability 'widgets'`,
          ),
        ],
        [
          preflight(
            'RENAMED failed for header "### Requirement: Widget caching" - target already exists',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/added-exists'])
    })

    test('drops the ADDED-already-exists twin of archive/added-exists', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/added-exists',
            'ADDED "Widget rendering" already exists with different content in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [preflight('ADDED failed for header "### Requirement: Widget rendering" - already exists')],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/added-exists'])
    })

    test('drops the 1.13.1 ADDED case-collision twin', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/added-exists',
            'ADDED "widget rendering" differs only in case or spacing from "Widget rendering" in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [
          preflight(
            'ADDED failed for header "### Requirement: widget rendering" - "### Requirement: Widget rendering" already exists and differs only in case or spacing; use MODIFIED with that exact header to change it, or choose a distinct name',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/added-exists'])
    })

    test('drops the 1.13.1 RENAMED case-collision twin', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/added-exists',
            `RENAMED target "widget caching" differs only in case or spacing from "Widget caching" in capability 'widgets'`,
          ),
        ],
        [
          preflight(
            'RENAMED failed for header "### Requirement: widget caching" - "### Requirement: Widget caching" already exists and differs only in case or spacing; choose a distinct name',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/added-exists'])
    })

    // No cospec rule reads the MODIFIED block's own header line, so this one
    // has no twin and must survive every archive/* finding on the same file.
    test('keeps the header-mismatch refusal, which has no cospec twin', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/target-missing',
            'MODIFIED target "Widget rendering" does not exist in living spec openspec/specs/widgets/spec.md',
          ),
        ],
        [
          preflight(
            'MODIFIED failed for header "### Requirement: Widget rendering" - header mismatch in content',
          ),
        ],
      )
      expect(merged.map((i) => i.rule)).toEqual(['archive/target-missing', 'openspec/validate'])
    })

    // Upstream suppresses this one itself: findArchiveBlockers skips a spec
    // whose path already carries an ERROR, and findScenarioLossIssues has
    // emitted one there first. If it ever does arrive, it is kept — the
    // scenario-preservation class keys on upstream's own `omits scenario(s)`
    // wording, not on this one.
    test('keeps the scenario-loss preflight INFO, which upstream suppresses by path', () => {
      const merged = mergeDelegated(
        [
          native(
            'archive/scenario-preservation',
            'MODIFIED "Widget rendering" drops scenario(s) "Empty widget" (living 2 -> delta 1)',
          ),
        ],
        [
          preflight(
            'MODIFIED failed for header "### Requirement: Widget rendering" - current spec contains scenario(s) not present in the modified block: "Empty widget". Refresh the change spec before archiving to avoid dropping scenarios.',
          ),
        ],
      )
      expect(merged).toHaveLength(2)
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
