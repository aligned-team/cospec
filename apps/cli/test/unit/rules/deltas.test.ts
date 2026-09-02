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
