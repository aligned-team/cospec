import { describe, expect, test } from 'bun:test'

import { mergeDelegated } from '../../../src/commands/validate.ts'
import type { Issue } from '../../../src/core/rules/issue.ts'

// mergeDelegated's DUPLICATE_CLASSES table drops a delegated (openspec/validate)
// issue only when a cospec-native issue already reported the same defect. The
// archive/target-invalid entry matches the pinned binary's structurally-invalid
// dry-run message (openspec/dist/core/specs-apply.js, each line built from
// findMainSpecStructureIssues in parsers/spec-structure.js) — three defect
// kinds, each line a header taken verbatim from the user's spec content.

const targetInvalidNative = (path: string, message: string): Issue => ({
  level: 'ERROR',
  rule: 'archive/target-invalid',
  path,
  message: `living spec openspec/${path} is structurally invalid — ${message}`,
})

describe('mergeDelegated: archive/target-invalid vs the pinned dry-run message', () => {
  test('a delta-header line is suppressed once cospec reported the same capability', () => {
    const native = [
      targetInvalidNative(
        'specs/widgets/spec.md',
        'line 5: delta header "## ADDED Requirements" belongs only in a change\'s delta spec',
      ),
    ]
    const delegated: Issue[] = [
      {
        level: 'INFO',
        rule: 'openspec/validate',
        path: 'specs/widgets/spec.md',
        message:
          'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
          'cannot be updated until fixed:\nline 5: Main spec contains delta header ' +
          '"## ADDED Requirements". Delta headers are only valid inside ' +
          'openspec/changes/<name>/specs/<capability-path>/spec.md and truncate the parsed ' +
          '## Requirements section.',
      },
    ]
    expect(mergeDelegated(native, delegated)).toEqual(native)
  })

  test('a duplicate-requirement line is suppressed once cospec reported the same capability', () => {
    const native = [
      targetInvalidNative(
        'specs/widgets/spec.md',
        'line 7: requirement "Existing" duplicates the one declared on line 3',
      ),
    ]
    const delegated: Issue[] = [
      {
        level: 'INFO',
        rule: 'openspec/validate',
        path: 'specs/widgets/spec.md',
        message:
          'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
          'cannot be updated until fixed:\nline 7: Requirement header ' +
          '"### Requirement: Existing" duplicates the requirement declared on line 3. ' +
          'Requirement names must be unique so spec updates cannot discard one block while ' +
          'updating another.',
      },
    ]
    expect(mergeDelegated(native, delegated)).toEqual(native)
  })

  test('a requirement-outside-section line is suppressed once cospec reported the same capability', () => {
    const native = [
      targetInvalidNative(
        'specs/widgets/spec.md',
        'line 12: requirement "Stray" is outside the ## Requirements section, so openspec never reads it',
      ),
    ]
    const delegated: Issue[] = [
      {
        level: 'INFO',
        rule: 'openspec/validate',
        path: 'specs/widgets/spec.md',
        message:
          'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
          'cannot be updated until fixed:\nline 12: Requirement header ' +
          '"### Requirement: Stray" appears outside the main ## Requirements section. Main ' +
          'specs only parse requirements inside that section, so this requirement is ' +
          'currently invisible to validate, list, and archive.',
      },
    ]
    expect(mergeDelegated(native, delegated)).toEqual(native)
  })

  test('multiple defect lines in one message are still recognised as one block', () => {
    const native = [
      targetInvalidNative(
        'specs/widgets/spec.md',
        'line 5: delta header "## ADDED Requirements" belongs only in a change\'s delta spec',
      ),
    ]
    const delegated: Issue[] = [
      {
        level: 'INFO',
        rule: 'openspec/validate',
        path: 'specs/widgets/spec.md',
        message:
          'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
          'cannot be updated until fixed:\nline 5: Main spec contains delta header ' +
          '"## ADDED Requirements". Delta headers are only valid inside spec.md and truncate ' +
          'the parsed ## Requirements section.\nline 9: Requirement header ' +
          '"### Requirement: Existing" duplicates the requirement declared on line 3. ' +
          'Requirement names must be unique so spec updates cannot discard one block while ' +
          'updating another.',
      },
    ]
    expect(mergeDelegated(native, delegated)).toEqual(native)
  })

  test('a defect kind cospec does not read is kept, not silently dropped', () => {
    const native = [
      targetInvalidNative(
        'specs/widgets/spec.md',
        'line 5: delta header "## ADDED Requirements" belongs only in a change\'s delta spec',
      ),
    ]
    const delegated: Issue[] = [
      {
        level: 'INFO',
        rule: 'openspec/validate',
        path: 'specs/widgets/spec.md',
        message:
          'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
          'cannot be updated until fixed:\nline 5: Some other structural issue nobody expects.',
      },
    ]
    expect(mergeDelegated(native, delegated)).toEqual([...native, ...delegated])
  })

  // Regression: the delegated regex used to backtrack the quoted header span
  // against a trailing `[^\n]*` once per "line N: …" repetition (CodeQL
  // js/redos, GHAS alert on this PR). A living spec's requirement/delta
  // headers are attacker-controlled markdown, so a header containing several
  // `".`-like substrings, repeated over many defect lines, made matching
  // exponential in the number of lines. Bounding the quoted span to `[^"\n]*`
  // (real header text never contains a literal quote) makes the match
  // deterministic; this must stay fast no matter how many lines or how much
  // punctuation the header carries.
  test('a pathological delegated message with quote-heavy headers resolves quickly', () => {
    const quotesPerLine = 6
    const lines = 200
    const header = `x".`.repeat(quotesPerLine) + 'x'
    let message =
      'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
      'cannot be updated until fixed:'
    for (let i = 0; i < lines; i++) {
      message += `\nline 9: Main spec contains delta header "${header}".`
    }
    // No cospec-native twin at all, so every DUPLICATE_CLASSES regex in the
    // table runs its `.exec()` against this message on the way to keeping it.
    const delegated: Issue[] = [
      { level: 'INFO', rule: 'openspec/validate', path: 'specs/widgets/spec.md', message },
    ]
    const start = performance.now()
    const result = mergeDelegated([], delegated)
    const elapsedMs = performance.now() - start
    expect(elapsedMs).toBeLessThan(1000)
    expect(result).toEqual(delegated)
  })
})
