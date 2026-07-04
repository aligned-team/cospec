import { describe, expect, test } from 'bun:test'

import { parseDeltaSpec, parseLivingSpec } from '../../../src/core/deltas.ts'

describe('parseDeltaSpec', () => {
  test('parses an ADDED requirement with SHALL and a scenario', () => {
    const text = `## ADDED Requirements

### Requirement: Widget display

The system SHALL display widgets.

#### Scenario: Show widget

- **WHEN** open
- **THEN** shown
`
    const p = parseDeltaSpec(text, 'specs/widgets/spec.md', 'widgets')
    expect(p.headerPresent).toBe(true)
    expect(p.ops).toHaveLength(1)
    const op = p.ops[0]!
    expect(op.operation).toBe('ADDED')
    expect(op.name).toBe('Widget display')
    expect(op.hasShallMust).toBe(true)
    expect(op.scenarioCount).toBe(1)
  })

  test('flags a 3-hashtag scenario heading as a depth issue', () => {
    const text = `## ADDED Requirements

### Requirement: X

The system MUST x.

### Scenario: bogus
`
    const p = parseDeltaSpec(text, 'specs/x/spec.md', 'x')
    expect(p.scenarioDepthIssues).toHaveLength(1)
    expect(p.scenarioDepthIssues[0]!.line).toBe(7)
  })

  test('parses REMOVED (bullet and plain), and RENAMED FROM/TO pairs', () => {
    const text = `## REMOVED Requirements

- \`### Requirement: Old thing\`

## RENAMED Requirements

- FROM: \`### Requirement: A\`
- TO: \`### Requirement: B\`
`
    const p = parseDeltaSpec(text, 'specs/x/spec.md', 'x')
    const removed = p.ops.find((o) => o.operation === 'REMOVED')
    expect(removed?.name).toBe('Old thing')
    const renamed = p.ops.find((o) => o.operation === 'RENAMED')
    expect(renamed?.fromName).toBe('A')
    expect(renamed?.toName).toBe('B')
  })

  test('reports a header present but with zero entries as an empty section', () => {
    const p = parseDeltaSpec('## ADDED Requirements\n\n(nothing)\n', 'specs/x/spec.md', 'x')
    expect(p.headerPresent).toBe(true)
    expect(p.ops).toHaveLength(0)
    expect(p.emptySections).toContain('ADDED')
  })

  test('no recognized header → headerPresent false', () => {
    const p = parseDeltaSpec('# just prose\n\nnothing here\n', 'specs/x/spec.md', 'x')
    expect(p.headerPresent).toBe(false)
    expect(p.ops).toHaveLength(0)
  })
})

describe('parseLivingSpec', () => {
  test('extracts requirement names, purpose text, and structural flags', () => {
    const text = `# Widgets Specification

## Purpose

Real purpose text.

## Requirements

### Requirement: Widget display

The system SHALL display widgets.
`
    const s = parseLivingSpec(text)
    expect(s.hasPurpose).toBe(true)
    expect(s.hasRequirements).toBe(true)
    expect(s.hasDeltaHeaders).toBe(false)
    expect(s.requirementNames.has('Widget display')).toBe(true)
    expect(s.purposeText).toBe('Real purpose text.')
  })

  test('flags delta headers appearing in a living spec', () => {
    const s = parseLivingSpec('## Purpose\n\nx\n\n## ADDED Requirements\n')
    expect(s.hasDeltaHeaders).toBe(true)
  })

  test('missing sections are reflected in the flags', () => {
    const s = parseLivingSpec('# Title\n\njust text\n')
    expect(s.hasPurpose).toBe(false)
    expect(s.hasRequirements).toBe(false)
  })
})
