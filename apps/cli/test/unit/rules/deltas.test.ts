import { describe, expect, test } from 'bun:test'

import { deltasRules } from '../../../src/core/rules/deltas.ts'
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
