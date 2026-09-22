import { describe, expect, test } from 'bun:test'

import { deltasRules, skipSpecsConflictIssues } from '../../../src/core/rules/deltas.ts'
import { makeChange, rules } from './helpers.ts'

function delta(path: string, capability: string, text: string) {
  return makeChange({ deltaFiles: [{ path, capability, text }] })
}

const GOOD = `## ADDED Requirements

### Requirement: X

The system SHALL x.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

describe('deltasRules', () => {
  test('a valid delta produces no issues', () => {
    expect(deltasRules(delta('specs/x/spec.md', 'x', GOOD))).toHaveLength(0)
  })

  test('deltas/scenario-depth on a 3-hashtag scenario', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n### Scenario: s\n'
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', text)))).toContain(
      'deltas/scenario-depth',
    )
  })

  test('deltas/header-present when no delta header exists', () => {
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', '# prose\n\nnothing')))).toContain(
      'deltas/header-present',
    )
  })

  test('deltas/requirement-shape when SHALL/MUST or a scenario is missing', () => {
    const noShall =
      '## ADDED Requirements\n\n### Requirement: X\n\nplain text.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const noScenario = '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n'
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', noShall)))).toContain(
      'deltas/requirement-shape',
    )
    expect(rules(deltasRules(delta('specs/x/spec.md', 'x', noScenario)))).toContain(
      'deltas/requirement-shape',
    )
  })

  // A requirement whose only scenario is a bare header has no scenario at all,
  // and the author is staring at a visible `#### Scenario:` line while cospec
  // says there is none. Same condition and wording as openspec's
  // `emptyScenarioHint` (src/core/validation/validator.ts, 1.13.1).
  test('deltas/requirement-shape explains a scenario header that has no body', () => {
    const hollow =
      '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n#### Scenario: s\n'
    const issues = deltasRules(delta('specs/x/spec.md', 'x', hollow))
    const shape = issues.filter((i) => i.rule === 'deltas/requirement-shape')
    expect(shape.map((i) => i.message)).toEqual([
      'ADDED "X" must include at least one #### Scenario:',
    ])
    expect(shape[0]!.hint).toBe(
      'a scenario header with no body under it does not count; add its steps, e.g. "- **WHEN** ..." and "- **THEN** ..."',
    )
  })

  test('the hint is withheld when the block carries no scenario header at all', () => {
    const noScenario = '## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n'
    const shape = deltasRules(delta('specs/x/spec.md', 'x', noScenario)).filter(
      (i) => i.rule === 'deltas/requirement-shape',
    )
    expect(shape).toHaveLength(1)
    expect(shape[0]!.hint).toBeUndefined()
  })

  test('deltas/capability-kebab on a non-kebab capability', () => {
    expect(rules(deltasRules(delta('specs/BadCap/spec.md', 'BadCap', GOOD)))).toContain(
      'deltas/capability-kebab',
    )
  })
})

describe('nested capability paths', () => {
  test('specs/<area>/<capability>/spec.md is valid', () => {
    expect(
      deltasRules(delta('specs/platform/session-layout/spec.md', 'platform/session-layout', GOOD)),
    ).toHaveLength(0)
  })

  test('deltas/capability-kebab on a non-kebab segment anywhere in the path', () => {
    expect(
      rules(
        deltasRules(
          delta('specs/Platform/session-layout/spec.md', 'Platform/session-layout', GOOD),
        ),
      ),
    ).toContain('deltas/capability-kebab')
  })

  test('deltas/capability-kebab on a delta file that is not spec.md', () => {
    expect(rules(deltasRules(delta('specs/web/extra.md', 'web', GOOD)))).toContain(
      'deltas/capability-kebab',
    )
  })
})

describe('deltas/spec-at-specs-root', () => {
  test('a spec.md at the specs/ root is an ERROR and nothing else', () => {
    // The merge path drops it, so the change would otherwise validate clean and
    // archive while its requirements never reach openspec/specs/.
    const issues = deltasRules(delta('specs/spec.md', '', GOOD))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/spec-at-specs-root')
    expect(issues[0]!.level).toBe('ERROR')
  })

  test('a DIRECTORY named spec.md is a capability, not the root-level case', () => {
    // It still fails deltas/capability-kebab (a dot is not kebab-case), but it
    // must not be reported as the root-level delta openspec blocks outright.
    expect(rules(deltasRules(delta('specs/spec.md/spec.md', 'spec.md', GOOD)))).toEqual([
      'deltas/capability-kebab',
    ])
  })
})

// A rename cospec cannot pair is a rename that does not happen: openspec drops
// the stray line, archive still reports success, and the requirement keeps its
// old name. 1.13.1 reports the same shape as an ERROR; cospec reports it at
// every pin.
describe('deltas/unpaired-rename', () => {
  const renamed = (...lines: string[]) =>
    delta('specs/x/spec.md', 'x', ['## RENAMED Requirements', '', ...lines, ''].join('\n'))

  test('a complete FROM:/TO: pair reports nothing', () => {
    expect(
      deltasRules(renamed('- FROM: `### Requirement: A`', '- TO: `### Requirement: B`')),
    ).toHaveLength(0)
  })

  test('a dangling FROM: is an ERROR naming the missing TO:', () => {
    const issues = deltasRules(renamed('- FROM: `### Requirement: A`'))
    expect(issues).toHaveLength(1)
    const issue = issues[0]!
    expect(issue.rule).toBe('deltas/unpaired-rename')
    expect(issue.level).toBe('ERROR')
    expect(issue.line).toBe(3)
    expect(issue.message).toBe('RENAMED FROM: "A" has no matching TO: line')
    expect(issue.hint).toBe(
      'write each rename as a FROM: line followed immediately by its TO: line',
    )
  })

  test('a dangling TO: is an ERROR naming the missing FROM:', () => {
    const issue = deltasRules(renamed('- TO: `### Requirement: B`'))[0]!
    expect(issue.rule).toBe('deltas/unpaired-rename')
    expect(issue.message).toBe('RENAMED TO: "B" has no matching FROM: line')
  })

  test('the displaced FROM: of an interleaved run is reported once', () => {
    const issues = deltasRules(
      renamed(
        '- FROM: `### Requirement: a`',
        '- FROM: `### Requirement: b`',
        '- TO: `### Requirement: x`',
      ),
    )
    expect(rules(issues)).toEqual(['deltas/unpaired-rename'])
    expect(issues[0]!.message).toBe('RENAMED FROM: "a" has no matching TO: line')
  })
})

describe('skipSpecsConflictIssues', () => {
  test('no marker, no issue — whatever is under specs/', () => {
    expect(skipSpecsConflictIssues(makeChange({ files: ['specs/x/spec.md'] }))).toHaveLength(0)
  })

  test('the marker with an empty specs/ is accepted', () => {
    const change = makeChange({
      openspecYaml: { present: true, parseable: true, schema: 'feat', skipSpecs: true },
      files: ['proposal.md', 'tasks.md'],
    })
    expect(skipSpecsConflictIssues(change)).toHaveLength(0)
  })

  test('the marker plus ANY file under specs/ is an ERROR', () => {
    // Not just parsed deltas: a headerless or stray file is dropped at archive
    // while the change claims to carry nothing.
    const change = makeChange({
      openspecYaml: { present: true, parseable: true, schema: 'feat', skipSpecs: true },
      files: ['proposal.md', 'specs/notes.txt'],
    })
    const issues = skipSpecsConflictIssues(change)
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/skip-specs-conflict')
    expect(issues[0]!.level).toBe('ERROR')
  })
})

describe('deltasRules — orphaned requirements', () => {
  // WARNING, not ERROR: pre-format archived changes carry this shape, and the
  // fix is to move the block. Same level openspec 1.13.1 chose.
  test('deltas/orphaned-requirement warns and names the section', () => {
    const text = `${GOOD}\n## Notes\n\n### Requirement: Stray\n`
    const issues = deltasRules(delta('specs/x/spec.md', 'x', text))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('deltas/orphaned-requirement')
    expect(issues[0]!.level).toBe('WARNING')
    expect(issues[0]!.message).toContain('under "## Notes"')
    expect(issues[0]!.hint).toContain('## ADDED Requirements')
  })

  test('a requirement above every section reports the above-first-section wording', () => {
    const text = `### Requirement: Stray\n\n${GOOD}`
    const issues = deltasRules(delta('specs/x/spec.md', 'x', text))
    expect(rules(issues)).toEqual(['deltas/orphaned-requirement'])
    expect(issues[0]!.message).toContain('above the first "## " section')
  })

  // header-present already stops the file, so the orphan is not piled on top.
  test('a file with no delta section at all reports only deltas/header-present', () => {
    expect(
      rules(deltasRules(delta('specs/x/spec.md', 'x', '## Notes\n\n### Requirement: A\n'))),
    ).toEqual(['deltas/header-present'])
  })
})
