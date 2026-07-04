import { describe, expect, test } from 'bun:test'

import {
  exitCode,
  type Issue,
  type ItemReport,
  renderHuman,
  renderJson,
  type ReportJson,
  summarize,
} from '../../../src/core/report.ts'

function issue(partial: Partial<Issue> & Pick<Issue, 'level' | 'rule'>): Issue {
  return { path: 'proposal.md', message: 'msg', ...partial }
}

const sample: ItemReport[] = [
  {
    id: 'add-widget',
    kind: 'change',
    type: 'feat',
    valid: false,
    issues: [
      issue({
        level: 'ERROR',
        rule: 'deltas/scenario-depth',
        path: 'specs/widgets/spec.md',
        line: 14,
        message: 'scenario heading uses 3 hashtags; must be `#### Scenario:`',
      }),
      issue({
        level: 'ERROR',
        rule: 'blockers/dangling-ref',
        path: 'blocking-changes.md',
        line: 7,
        message: '`add-auth` is not an active or archived change',
        hint: '`cospec list` shows active changes; fix the slug or remove the entry',
        fixable: false,
      }),
      issue({
        level: 'WARNING',
        rule: 'proposal/why-substantive',
        message: '## Why is shorter than 50 characters',
      }),
    ],
  },
  { id: 'fix-null-crash', kind: 'change', type: 'fix', valid: true, issues: [] },
]

describe('summarize', () => {
  test('counts by level and by rule', () => {
    const summary = summarize(sample)
    expect(summary.errors).toBe(2)
    expect(summary.warnings).toBe(1)
    expect(summary.infos).toBe(0)
    expect(summary.byRule['deltas/scenario-depth']).toBe(1)
    expect(summary.byRule['blockers/dangling-ref']).toBe(1)
  })
})

describe('exitCode', () => {
  test('errors fail regardless of strict', () => {
    expect(exitCode(sample)).toBe(1)
    expect(exitCode(sample, true)).toBe(1)
  })

  test('warnings only fail under strict', () => {
    const warnOnly: ItemReport[] = [
      { id: 'x', kind: 'change', valid: true, issues: [issue({ level: 'WARNING', rule: 'a/b' })] },
    ]
    expect(exitCode(warnOnly)).toBe(0)
    expect(exitCode(warnOnly, true)).toBe(1)
  })

  test('info-only and clean pass in both modes', () => {
    const infoOnly: ItemReport[] = [
      { id: 'x', kind: 'change', valid: true, issues: [issue({ level: 'INFO', rule: 'meta/x' })] },
    ]
    expect(exitCode(infoOnly, true)).toBe(0)
    expect(exitCode([], true)).toBe(0)
  })
})

describe('renderJson', () => {
  test('matches the DESIGN §4.4 shape', () => {
    const parsed = JSON.parse(renderJson(sample)) as ReportJson
    expect(parsed.version).toBe(1)
    expect(parsed.items).toHaveLength(2)
    expect(parsed.items[0]!.issues[0]!.rule).toBe('deltas/scenario-depth')
    expect(parsed.items[0]!.issues[0]!.line).toBe(14)
    expect(parsed.summary).toEqual({
      errors: 2,
      warnings: 1,
      byRule: {
        'deltas/scenario-depth': 1,
        'blockers/dangling-ref': 1,
        'proposal/why-substantive': 1,
      },
    })
  })
})

describe('renderHuman', () => {
  const text = renderHuman(sample, { noColor: true })

  test('header counts changes and specs', () => {
    expect(text.startsWith('cospec validate — 2 changes, 0 specs\n')).toBe(true)
  })

  test('marks invalid and valid changes with type suffix', () => {
    expect(text).toContain('✗ add-widget  (feat)')
    expect(text).toContain('✓ fix-null-crash  (fix)')
  })

  test('renders rule id, path:line, message and hint', () => {
    expect(text).toContain('deltas/scenario-depth')
    expect(text).toContain('specs/widgets/spec.md:14')
    expect(text).toContain('hint: `cospec list` shows active changes')
  })

  test('footer pluralizes and reports failure', () => {
    expect(text).toContain('2 errors, 1 warning — validation failed')
  })

  test('passing footer when clean', () => {
    const clean = renderHuman([{ id: 'ok', kind: 'change', type: 'ci', valid: true, issues: [] }], {
      noColor: true,
    })
    expect(clean).toContain('0 errors, 0 warnings — validation passed')
  })

  test('folds valid specs into an aggregate line', () => {
    const withSpecs: ItemReport[] = [
      { id: 's1', kind: 'spec', valid: true, issues: [] },
      { id: 's2', kind: 'spec', valid: true, issues: [] },
    ]
    const out = renderHuman(withSpecs, { noColor: true })
    expect(out).toContain('specs: 2/2 valid')
    expect(out).not.toContain('✓ s1')
  })

  test('noColor omits ANSI escapes', () => {
    expect(text.includes('\x1b[')).toBe(false)
  })

  test('color enabled emits ANSI escapes', () => {
    const colored = renderHuman(sample, { noColor: false })
    // Guard against a NO_COLOR env in the runner masking this.
    if (process.env.NO_COLOR === undefined || process.env.NO_COLOR === '')
      expect(colored.includes('\x1b[')).toBe(true)
  })
})
