import { describe, expect, test } from 'bun:test'

import {
  archivedUnsupportedRefusal,
  erroredChange,
  concurrencyBound,
  mapPool,
  mergeDelegated,
  TARGET_INVALID,
  TARGET_INVALID_HEAD,
  TARGET_INVALID_LINE,
} from '../../../src/commands/validate.ts'
import { rootSelectionDocument } from '../../../src/core/root.ts'
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

  // Regression: one regex over the whole message used to backtrack the quoted
  // header span against a trailing `[^\n]*` once per "line N: …" repetition
  // (CodeQL js/redos). A living spec's requirement/delta headers are
  // attacker-controlled markdown, so a header holding several `".`-like
  // substrings, repeated over many defect lines, made matching exponential in
  // the number of lines. TARGET_INVALID now matches the head once and each
  // line on its own, so no group repeats around the quoted span; this must
  // stay fast no matter how many lines or how much punctuation a header holds.
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

/**
 * Whether a regex source nests an unbounded quantifier (`*`, `+`, `{n,}`)
 * inside a group that is itself unboundedly quantified — star height two, the
 * shape behind every exponential-backtracking alert (CodeQL js/redos). It
 * reads the source as text and never compiles it.
 */
function repeatsAQuantifiedGroup(source: string): boolean {
  // One frame per open group: whether its body holds an unbounded quantifier.
  const frames: boolean[] = [false]
  // The atom a following quantifier applies to: a group's body flag, or false.
  let atom: boolean | undefined
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (c === '\\') {
      atom = false
      i += 2
    } else if (c === '[') {
      i++
      while (i < source.length && source[i] !== ']') i += source[i] === '\\' ? 2 : 1
      atom = false
      i++
    } else if (c === '(') {
      frames.push(false)
      atom = undefined
      i++
      if (source[i] === '?') {
        i++
        if (source[i] === '<' && source[i + 1] !== '=' && source[i + 1] !== '!')
          i = source.indexOf('>', i) + 1
        else i += source[i] === '<' ? 2 : 1
      }
    } else if (c === ')') {
      const body = frames.pop()!
      frames[frames.length - 1] ||= body
      atom = body
      i++
    } else if (c === '*' || c === '+' || c === '?' || c === '{') {
      let unbounded = c === '*' || c === '+'
      if (c === '{') {
        const close = source.indexOf('}', i)
        // A `{` that opens no `{n}`/`{n,}`/`{n,m}` is a literal.
        if (close === -1 || !/^\{\d+(?:,\d*)?$/.test(source.slice(i, close))) {
          atom = false
          i++
          continue
        }
        unbounded = source.slice(i, close).endsWith(',')
        i = close + 1
      } else i++
      if (source[i] === '?') i++
      if (unbounded && atom === true) return true
      if (unbounded) frames[frames.length - 1] = true
      atom = undefined
    } else {
      atom = c === '|' || c === '^' || c === '$' ? undefined : false
      i++
    }
  }
  return false
}

describe('the target-invalid dedupe is linear (verification 11.2, 15.13)', () => {
  /**
   * The pattern before 74d5ea4, as text only — it is never compiled. A quoted
   * span `[^\n]*"` before a required literal, inside a repeated group,
   * backtracks exponentially in the number of lines on a message that ends in
   * a line it cannot match.
   */
  const PRE_FIX_SOURCE =
    '^Archive would refuse this delta: (.+?): target spec is structurally invalid and cannot ' +
    'be updated until fixed:(?:\\nline \\d+: (?:Main spec contains delta header "[^\\n]*"\\.|' +
    'Requirement header "[^\\n]*" (?:duplicates the requirement declared on line \\d+\\.|' +
    'appears outside the main ## Requirements section\\.))[^\\n]*)+\\n?$'

  test('the star-height guard flags the pre-fix pattern and the textbook shapes', () => {
    expect(repeatsAQuantifiedGroup(PRE_FIX_SOURCE)).toBe(true)
    for (const shape of ['(a+)+', '(?:a|b*)*', '(?<n>x[^y]*)+z', '((ab)*c){2,}', '(a{1,})+'])
      expect({ shape, flagged: repeatsAQuantifiedGroup(shape) }).toEqual({ shape, flagged: true })
    for (const shape of [
      '(a+)',
      '(?:ab)+',
      '(a+){2}',
      '[(a+)+]',
      '\\(a+\\)+',
      '(a+)?b*',
      '(a+){x}',
    ])
      expect({ shape, flagged: repeatsAQuantifiedGroup(shape) }).toEqual({ shape, flagged: false })
  })

  test("neither of the per-line matcher's patterns repeats a quantified group", () => {
    expect(repeatsAQuantifiedGroup(TARGET_INVALID_HEAD.source)).toBe(false)
    expect(repeatsAQuantifiedGroup(TARGET_INVALID_LINE.source)).toBe(false)
  })

  /** The bound a linear matcher meets on the input below; a backtracking one never finishes. */
  const BOUND_MS = 100

  /** 200 quote-heavy defect lines, then a line of a kind cospec's rule does not read. */
  function adversarial(): string {
    const header = 'x".'.repeat(6) + 'x'
    let message =
      'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
      'cannot be updated until fixed:'
    for (let i = 0; i < 200; i++)
      message += `\nline 9: Main spec contains delta header "${header}".`
    return `${message}\nline 210: Some structural issue nobody expects.`
  }

  test('the per-line matcher refuses the adversarial message well under the bound', () => {
    const start = performance.now()
    const hit = TARGET_INVALID.exec(adversarial())
    expect(hit).toBeNull()
    expect(performance.now() - start).toBeLessThan(BOUND_MS)
  })

  test('the per-line matcher reads a quoted header and keys on the capability', () => {
    const message =
      'Archive would refuse this delta: widgets: target spec is structurally invalid and ' +
      'cannot be updated until fixed:\nline 9: Requirement header ' +
      '"### Requirement: Widget "quoted" name" duplicates the requirement declared on line 3. ' +
      'Requirement names must be unique so spec updates cannot discard one block while ' +
      'updating another.\n'
    expect(TARGET_INVALID.exec(message)?.[1]).toBe('widgets')
    // The narrowed span this replaced (`[^"\n]*`) cannot cross the header's own
    // `"`, so it missed this line and the defect was reported twice.
    const line = message.split('\n')[1]!
    expect(TARGET_INVALID_LINE.test(line)).toBe(true)
    expect(
      /^line \d+: (?:Main spec contains delta header "[^"\n]*"\.|Requirement header "[^"\n]*" (?:duplicates the requirement declared on line \d+\.|appears outside the main ## Requirements section\.))/.test(
        line,
      ),
    ).toBe(false)
  })
})

describe('the bulk validation pool (verification 7.7)', () => {
  /** Eight stubbed validations; the most ever in flight at once, and the results. */
  async function run(bound: number): Promise<{ peak: number; results: number[] }> {
    let inFlight = 0
    let peak = 0
    const results = await mapPool([0, 1, 2, 3, 4, 5, 6, 7], bound, async (n) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      // Later items settle first, so the order is the pool's, not completion's.
      await Bun.sleep(8 - n)
      inFlight--
      return n * 10
    })
    return { peak, results }
  }

  const cases: [string, string | undefined, NodeJS.ProcessEnv, number][] = [
    ['--concurrency 2', '2', {}, 2],
    ['--concurrency 0', '0', {}, 6],
    ['--concurrency abc', 'abc', {}, 6],
    ['unset, OPENSPEC_CONCURRENCY=3', undefined, { OPENSPEC_CONCURRENCY: '3' }, 3],
    ['all unset', undefined, {}, 6],
  ]
  for (const [label, flag, env, bound] of cases)
    test(`${label}: bounded at ${bound}, results in input order`, async () => {
      expect(concurrencyBound(flag, env)).toBe(bound)
      const { peak, results } = await run(concurrencyBound(flag, env))
      expect(peak).toBe(bound)
      expect(results).toEqual([0, 10, 20, 30, 40, 50, 60, 70])
    })

  test('a bad OPENSPEC_CONCURRENCY falls back to the default; the flag outranks the env', () => {
    expect(concurrencyBound(undefined, { OPENSPEC_CONCURRENCY: 'abc' })).toBe(6)
    expect(concurrencyBound('4', { OPENSPEC_CONCURRENCY: '3' })).toBe(4)
    expect(concurrencyBound('abc', { OPENSPEC_CONCURRENCY: '3' })).toBe(3)
  })
})

describe('a change whose validation throws (verification 16.3)', () => {
  test("an errno failure is that change's meta/unreadable-artifact ERROR, naming the file", () => {
    const error = Object.assign(new Error("EACCES: permission denied, open '/r/openspec/x.md'"), {
      code: 'EACCES',
      syscall: 'open',
      path: '/r/openspec/x.md',
    })
    expect(erroredChange('/r', 'c1', error)).toEqual({
      id: 'c1',
      kind: 'change',
      valid: false,
      issues: [
        {
          level: 'ERROR',
          rule: 'meta/unreadable-artifact',
          path: '.',
          message: 'could not read openspec/x.md (EACCES)',
          hint: 'fix the file permissions (or replace the entry with a readable file) and re-run',
        },
      ],
    })
  })

  test('anything that is not an errno failure propagates', () => {
    const error = new Error('boom')
    expect(() => erroredChange('/r', 'c1', error)).toThrow(error)
  })
})

describe("archivedUnsupportedRefusal: validate --archived's version-floor guard", () => {
  test('no refusal at or above the floor', () => {
    expect(archivedUnsupportedRefusal('1.9.0')).toBeUndefined()
    expect(archivedUnsupportedRefusal('1.13.1')).toBeUndefined()
  })

  test('a document under --json below the floor, not stderr text', () => {
    const refusal = archivedUnsupportedRefusal('1.8.0')
    expect(refusal).toBeDefined()
    expect(refusal!.diagnostic.message).toBe(
      'validate --archived needs OpenSpec >=1.9.0; the wrapped OpenSpec is 1.8.0',
    )
    // The command's --json branch calls rootSelectionDocument(refusal), exactly
    // as its sibling no-root guard does: one parseable JSON document, never the
    // unconditional stderr text the pre-fix guard wrote regardless of --json.
    const doc = JSON.parse(rootSelectionDocument(refusal!)) as {
      status: { severity: string; code: string; message: string }[]
    }
    expect(doc.status).toEqual([
      {
        severity: 'error',
        code: 'openspec_version_too_old',
        message: 'validate --archived needs OpenSpec >=1.9.0; the wrapped OpenSpec is 1.8.0',
      },
    ])
  })

  test('an unparseable version is never judged too old (drift allowed)', () => {
    expect(archivedUnsupportedRefusal('not-a-version')).toBeUndefined()
  })
})
