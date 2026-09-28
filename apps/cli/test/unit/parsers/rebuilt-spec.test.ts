import { describe, expect, test } from 'bun:test'

import { parseDeltaSpec } from '../../../src/core/deltas.ts'
import {
  describeUnaccountedContent,
  rebuildSpec,
  validateRebuiltSpec,
} from '../../../src/core/rebuilt-spec.ts'

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

const rebuiltAgainst = (delta: string, living: string | undefined) =>
  rebuildSpec({
    capability: 'x',
    changeName: 'c',
    living,
    deltaText: delta,
    delta: parseDeltaSpec(delta, 'specs/x/spec.md', 'x', 'verbatim'),
  })
const rebuildAgainst = (delta: string, living: string | undefined) =>
  rebuiltAgainst(delta, living)?.lines
const rebuild = (delta: string) => rebuildAgainst(delta, LIVING)

const ADD =
  '## ADDED Requirements\n\n### Requirement: New\n\nThe system SHALL be new.\n\n#### Scenario: n\n\n- **WHEN** c\n- **THEN** d\n'

describe('rebuildSpec', () => {
  test('appends an ADDED block after the living ones, each line tagged with its source', () => {
    const lines = rebuild(ADD)!
    expect(lines.map((l) => l.text).join('\n')).toBe(
      `${LIVING.trimEnd()}\n\n${ADD.slice(23).trimEnd()}`,
    )
    const header = lines.find((l) => l.text === '### Requirement: New')
    expect(header?.origin).toEqual({ source: 'delta', line: 3 })
    expect(lines.find((l) => l.text === '### Requirement: Existing')?.origin).toEqual({
      source: 'living',
      line: 9,
    })
  })

  test('a RENAMED rewrites the header in place and keeps the living line', () => {
    const lines = rebuild(
      '## RENAMED Requirements\n\n- FROM: `### Requirement: Existing`\n- TO: `### Requirement: Renamed`\n',
    )!
    expect(lines.find((l) => l.text === '### Requirement: Renamed')?.origin).toEqual({
      source: 'living',
      line: 9,
    })
  })

  test('every refusal before the rebuild answers undefined', () => {
    const modMissing = ADD.replace('ADDED', 'MODIFIED').replace('New', 'Missing')
    expect(rebuild(modMissing)).toBeUndefined()
    expect(rebuildAgainst(modMissing, undefined)).toBeUndefined()
    expect(rebuild(`${ADD}\n${ADD.slice(23)}`)).toBeUndefined()
    expect(rebuild(ADD.replace('New', 'Existing'))).toBeUndefined()
    expect(rebuild('## ADDED Requirements\n')).toBeUndefined()
    expect(rebuildAgainst(ADD, `${LIVING}\n## ADDED Requirements\n`)).toBeUndefined()
  })

  test('a new capability starts from the skeleton, carrying a readable delta Purpose', () => {
    const lines = rebuildAgainst(`## Purpose\n\nGadgets do things.\n\n${ADD}`, undefined)!
    expect(lines.slice(0, 5).map((l) => l.text)).toEqual([
      '# x Specification',
      '',
      '## Purpose',
      'Gadgets do things.',
      '',
    ])
    expect(lines[3]?.origin).toEqual({ source: 'delta', line: 3 })
    const placeholder = rebuildAgainst(ADD, undefined)!
    expect(placeholder[3]?.text).toBe(
      'TBD - created by archiving change c. Update Purpose after archive.',
    )
  })
})

const REMOVE_EXISTING = '## REMOVED Requirements\n\n### Requirement: Existing\n'

describe('rebuildSpec: what the retirement decision reads', () => {
  test('counts only the REMOVED ops that deleted a block', () => {
    const removed = rebuiltAgainst(REMOVE_EXISTING, LIVING)!
    expect(removed.removed).toBe(1)
    expect(removed.noRequirementBlocks).toBe(true)
    expect(removed.unaccountedContent).toEqual([])
    const absent = rebuiltAgainst(REMOVE_EXISTING.replace('Existing', 'Absent'), LIVING)!
    expect(absent.removed).toBe(0)
    expect(absent.noRequirementBlocks).toBe(false)
  })

  test("the audit names what sits outside the title, Purpose and each block's own parts", () => {
    const living = LIVING.replace(
      '## Requirements\n',
      '## Glossary\n\nTerms.\n\n## Requirements\n\nIntro.\n',
    ).concat('\nA note below the scenarios.\n\n<!-- aside -->\n\n## Notes\n\nTrailing.\n')
    expect(rebuiltAgainst(REMOVE_EXISTING, living)!.unaccountedContent).toEqual([
      '## Glossary',
      'Terms.',
      'Intro.',
      '## Notes',
      'Trailing.',
      'A note below the scenarios.',
      '<!-- aside -->',
    ])
  })

  test("a wrapped scenario bullet, a + bullet and a fenced example are the block's own", () => {
    const living = LIVING.replace(
      '- **WHEN** a\n',
      '+ **WHEN** a caller asks for something that\n  wraps\n',
    ).replace(
      'The system SHALL exist.\n',
      'The system SHALL exist.\n\n```md\n### Requirement: Fenced\n```\n',
    )
    expect(rebuiltAgainst(REMOVE_EXISTING, living)!.unaccountedContent).toEqual([])
  })

  test('a heading inside a block, and a setext Purpose sibling, are named', () => {
    const living = LIVING.replace('Real purpose.\n', 'Real purpose.\n\nScope\n-----\n').concat(
      '\n###   \n\ntext\n',
    )
    expect(rebuiltAgainst(REMOVE_EXISTING, living)!.unaccountedContent).toEqual([
      'Scope',
      '###',
      'text',
    ])
  })

  test('with no ## Requirements the whole spec is read as the part above it', () => {
    const living = '# X Specification\n\n## Purpose\n\nReal purpose.\n\n## Notes\n\nMore.\n'
    const result = rebuiltAgainst(REMOVE_EXISTING, living)!
    expect(result.removed).toBe(0)
    expect(result.unaccountedContent).toEqual(['## Notes', 'More.'])
  })
})

describe('describeUnaccountedContent', () => {
  test('quotes three lines, counts the rest, and makes control characters safe', () => {
    expect(describeUnaccountedContent(['a', 'b\u001b', 'c', 'd', 'e'])).toBe(
      '"a", "b?", "c", and 2 more line(s)',
    )
    expect(describeUnaccountedContent(['x'.repeat(201)])).toBe(`"${'x'.repeat(200)}\u2026"`)
  })
})

describe('validateRebuiltSpec', () => {
  const kinds = (text: string) => validateRebuiltSpec(text.split('\n')).map((i) => i.kind)

  test('a well-formed spec has no ERROR', () => {
    expect(kinds(LIVING)).toEqual([])
  })

  test('the Purpose is checked first, and alone', () => {
    expect(kinds(LIVING.replace('Real purpose.\n\n', ''))).toEqual(['no-purpose'])
  })

  test('every header under Requirements is a requirement that needs a scenario', () => {
    const found = validateRebuiltSpec(
      LIVING.replace('## Requirements\n\n', '## Requirements\n\n### Notes\n\n').split('\n'),
    )
    expect(found).toEqual([
      { kind: 'requirement', line: 8, header: '### Notes', noText: false, noScenario: true },
    ])
  })

  test('a fenced scenario is no scenario; a bodyless one is none either', () => {
    expect(kinds(LIVING.replace('#### Scenario: s', '```\n#### Scenario: s\n```'))).toEqual([
      'requirement',
    ])
    expect(kinds(LIVING.replace('- **WHEN** a\n- **THEN** b\n', ''))).toEqual(['requirement'])
  })

  test('a canonical requirement with no statement is its own ERROR', () => {
    expect(kinds(LIVING.replace('The system SHALL exist.\n\n', ''))).toEqual(['no-body'])
  })

  test('a blank-titled header with no statement is a requirement with no text', () => {
    const found = validateRebuiltSpec(
      LIVING.replace(
        '- **THEN** b\n',
        '- **THEN** b\n\n###   \n\n#### Scenario: t\n\n- **WHEN** c\n',
      ).split('\n'),
    )
    expect(found).toEqual([
      { kind: 'requirement', line: 17, header: '###', noText: true, noScenario: false },
    ])
  })

  test('the structure the archive refuses is reported too', () => {
    expect(
      kinds(
        `${LIVING}\n### Requirement: Existing\n\nThe system SHALL.\n\n#### Scenario: t\n\n- x\n`,
      ),
    ).toEqual(['structure'])
  })
})
