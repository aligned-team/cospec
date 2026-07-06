import { describe, expect, test } from 'bun:test'

import { parseLivingSpec } from '../../../src/core/deltas.ts'
import { archiveRules } from '../../../src/core/rules/archive.ts'
import { makeChange, rules } from './helpers.ts'

const LIVING = `# X Specification

## Purpose

Real purpose.

## Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

function change(text: string, opts: { living?: string } = {}) {
  const livingSpecs = new Map()
  if (opts.living !== undefined) livingSpecs.set('x', parseLivingSpec(opts.living))
  return makeChange({
    deltaFiles: [{ path: 'specs/x/spec.md', capability: 'x', text }],
    livingSpecs,
  })
}

const ADD = `## ADDED Requirements

### Requirement: Brand New

The system SHALL do new.

#### Scenario: s

- **WHEN** a
- **THEN** b
`

describe('archiveRules', () => {
  test('ADDED against a nonexistent living spec is fine (new spec)', () => {
    expect(archiveRules(change(ADD))).toHaveLength(0)
  })

  test('archive/new-spec-non-added: MODIFIED against a nonexistent living spec', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Whatever\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text)))).toContain('archive/new-spec-non-added')
  })

  test('archive/no-ops: header present, zero operations', () => {
    expect(rules(archiveRules(change('## ADDED Requirements\n\n(nothing parseable)\n')))).toContain(
      'archive/no-ops',
    )
  })

  test('archive/target-missing: MODIFIED a requirement absent from the living spec', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Ghost\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain(
      'archive/target-missing',
    )
  })

  test('archive/added-exists: ADDED a requirement that already lives', () => {
    const text =
      '## ADDED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('archive/added-exists: RENAMED-TO collides with an existing requirement', () => {
    const text =
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Existing`\n'
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('archive/target-invalid: living spec missing ## Requirements', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const broken = '## Purpose\n\ntext only, no requirements section\n'
    expect(rules(archiveRules(change(text, { living: broken })))).toContain(
      'archive/target-invalid',
    )
  })

  test('a valid MODIFIED against an existing requirement passes', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist better.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    expect(archiveRules(change(text, { living: LIVING }))).toHaveLength(0)
  })
})

const TWO_SCENARIO_LIVING = `# X Specification

## Purpose

Real purpose.

## Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s1

- **WHEN** a
- **THEN** b

#### Scenario: s2

- **WHEN** c
- **THEN** d
`

describe('archiveRules: archive/scenario-preservation (advisory mirror)', () => {
  test('fires as WARNING by default when a MODIFIED delta drops a scenario', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }))
    const issue = issues.find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('WARNING')
  })

  test('is ERROR under --strict', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), { strict: true })
    expect(issues.find((i) => i.rule === 'archive/scenario-preservation')?.level).toBe('ERROR')
  })

  test('a `Scenario removed:` note suppresses the mirror rule', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n- Scenario removed: s2 was redundant.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    expect(rules(archiveRules(change(text, { living: TWO_SCENARIO_LIVING })))).not.toContain(
      'archive/scenario-preservation',
    )
  })

  test('an unchanged scenario count never fires', () => {
    expect(rules(archiveRules(change(ADD), { strict: true }))).not.toContain(
      'archive/scenario-preservation',
    )
  })
})
