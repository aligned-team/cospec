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

  test('archive/added-exists: ADDED a requirement that already lives with a different body', () => {
    // LIVING's block ends `- **WHEN** a` / `- **THEN** b`; this one omits the
    // THEN, so the bodies genuinely differ — a real collision, not an early sync.
    const text =
      '## ADDED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: LIVING }))
    expect(rules(issues)).toContain('archive/added-exists')
    expect(issues.find((i) => i.rule === 'archive/added-exists')?.message).toContain(
      'already exists with different content',
    )
  })

  // openspec's ADDED arm (`specs-apply.ts`) skips an ADDED block whose
  // normalized raw text matches the living requirement: the spec was already
  // synced to the baseline, so the archive is a clean no-op.
  test('an ADDED block identical to the living requirement is an early-sync no-op', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
  })

  test('the early-sync no-op survives CRLF and trailing-blank-line differences', () => {
    const text =
      '## ADDED Requirements\r\n\r\n### Requirement: Existing\r\n\r\nThe system SHALL exist.\r\n\r\n#### Scenario: s\r\n\r\n- **WHEN** a\r\n- **THEN** b\r\n\r\n\r\n'
    expect(archiveRules(change(text, { living: LIVING }), { strict: true })).toHaveLength(0)
  })

  test('an ADDED block differing only in one scenario line is still a collision', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** c
`
    expect(rules(archiveRules(change(text, { living: LIVING })))).toContain('archive/added-exists')
  })

  test('an ADDED block differing only in interior whitespace is still a collision', () => {
    const text = `## ADDED Requirements

### Requirement: Existing

The system  SHALL exist.

#### Scenario: s

- **WHEN** a
- **THEN** b
`
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

  // openspec 1.8.0's own scenario-loss check refuses a MODIFIED block that omits
  // a living scenario, and its archive aborts on one, with no notion of cospec's
  // note — so the note is no longer an escape hatch. It only changes the hint.
  test('a `Scenario removed:` note no longer suppresses the mirror rule', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n- Scenario removed: s2 was redundant.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issues = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }))
    const issue = issues.find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('WARNING')
    expect(issue?.hint).toContain('no longer excuses the drop')
  })

  test('without a note the hint names the remedies but not the retired note', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING })).find(
      (i) => i.rule === 'archive/scenario-preservation',
    )
    expect(issue?.hint).not.toContain('no longer excuses the drop')
    expect(issue?.hint).toContain('copy the missing scenario back into the MODIFIED block')
  })

  test('an unchanged scenario count never fires', () => {
    expect(rules(archiveRules(change(ADD), { strict: true }))).not.toContain(
      'archive/scenario-preservation',
    )
  })

  test('the message names the dropped scenario and both counts', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING })).find(
      (i) => i.rule === 'archive/scenario-preservation',
    )
    expect(issue?.message).toBe('MODIFIED "Existing" drops scenario(s) "s2" (living 2 -> delta 1)')
  })

  // The shape the count-only gate waved through entirely.
  test('a same-count scenario NAME swap fires, naming the lost scenario', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s1\n\n- **WHEN** a\n\n#### Scenario: s3\n\n- **WHEN** c\n'
    const issue = archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), {
      strict: true,
    }).find((i) => i.rule === 'archive/scenario-preservation')
    expect(issue?.level).toBe('ERROR')
    expect(issue?.message).toBe('MODIFIED "Existing" drops scenario(s) "s2" (living 2 -> delta 2)')
  })

  test('reordering the living scenarios never fires', () => {
    const text =
      '## MODIFIED Requirements\n\n### Requirement: Existing\n\nThe system SHALL exist.\n\n#### Scenario: s2\n\n- **WHEN** c\n\n#### Scenario: s1\n\n- **WHEN** a\n'
    expect(
      rules(archiveRules(change(text, { living: TWO_SCENARIO_LIVING }), { strict: true })),
    ).not.toContain('archive/scenario-preservation')
  })
})
