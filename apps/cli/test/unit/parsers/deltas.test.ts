import { describe, expect, test } from 'bun:test'

import {
  findScenarioDrops,
  type LivingSpec,
  normalizeBlockRaw,
  parseDeltaSpec,
  parseLivingSpec,
  scenarioDropMessage,
  scenarioNameFromHeader,
} from '../../../src/core/deltas.ts'

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

  test('counts scenarios per requirement', () => {
    const s = parseLivingSpec(`## Purpose

x

## Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: b

- **WHEN** x
- **THEN** y

### Requirement: Other

The system SHALL other.

#### Scenario: c

- **WHEN** x
- **THEN** y
`)
    expect(s.requirementScenarioCounts.get('Widget rendering')).toBe(2)
    expect(s.requirementScenarioCounts.get('Other')).toBe(1)
  })
})

describe('parseDeltaSpec: scenario removal notes', () => {
  test('captures a `Scenario removed:` bullet under a MODIFIED requirement', () => {
    const text = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget.

- Scenario removed: the empty-state path merged into the primary scenario.

#### Scenario: Render a widget

- **WHEN** a
- **THEN** b
`
    const p = parseDeltaSpec(text, 'specs/x/spec.md', 'x')
    const op = p.ops[0]!
    expect(op.scenarioRemovalReasons).toEqual([
      'the empty-state path merged into the primary scenario.',
    ])
  })

  test('a requirement with no note has an empty reasons list', () => {
    const text = `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render a widget.

#### Scenario: Render a widget

- **WHEN** a
- **THEN** b
`
    const p = parseDeltaSpec(text, 'specs/x/spec.md', 'x')
    expect(p.ops[0]!.scenarioRemovalReasons).toEqual([])
  })
})

describe('findScenarioDrops', () => {
  const LIVING = parseLivingSpec(`## Purpose

x

## Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: b

- **WHEN** x
- **THEN** y
`)

  test('flags a MODIFIED requirement whose scenario count drops with no note', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    const drops = findScenarioDrops(
      [{ capability: 'widgets', ops: p.ops }],
      new Map([['widgets', LIVING]]),
    )
    expect(drops).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 1,
        livingCount: 2,
        missingNames: ['b'],
        noted: false,
      },
    ])
  })

  // The escape hatch is retired: openspec 1.8.0 reports any MODIFIED block that
  // omits a living scenario as an ERROR and its archive aborts on one, so a note
  // could only delay the refusal — and below 1.8.0 honouring it silently drops
  // the scenario, which is what this gate exists to stop.
  test('a `Scenario removed:` note no longer excuses the drop, only flags it as noted', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

- Scenario removed: b was redundant with a.

#### Scenario: a

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    const drops = findScenarioDrops(
      [{ capability: 'widgets', ops: p.ops }],
      new Map([['widgets', LIVING]]),
    )
    expect(drops).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 1,
        livingCount: 2,
        missingNames: ['b'],
        noted: true,
      },
    ])
  })

  test('no drop when the scenario count is unchanged or grows', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: b

- **WHEN** x
- **THEN** y

#### Scenario: c

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([])
  })

  test('a capability with no living spec (new capability) is never flagged', () => {
    const p = parseDeltaSpec(
      `## ADDED Requirements

### Requirement: Brand new

The system SHALL do new.
`,
      'specs/fresh/spec.md',
      'fresh',
    )
    expect(findScenarioDrops([{ capability: 'fresh', ops: p.ops }], new Map())).toEqual([])
  })

  test('a MODIFIED requirement absent from the living spec is not a drop', () => {
    // Nothing to shrink against — the missing target is `archive/target-missing`'s
    // finding, not this gate's.
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Never existed

The system SHALL do something.

#### Scenario: a

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([])
  })

  // The gap this arm closes: on the count arm alone a same-count name swap is a
  // silent scenario deletion, and openspec 1.0.0–1.7.x merges it at exit 0.
  test('a same-count scenario NAME swap is a drop, naming the lost scenario', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: c

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 2,
        livingCount: 2,
        missingNames: ['b'],
        noted: false,
      },
    ])
  })

  test('a GROWING block that still drops one living name is a drop', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: c

- **WHEN** x
- **THEN** y

#### Scenario: d

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 3,
        livingCount: 2,
        missingNames: ['b'],
        noted: false,
      },
    ])
  })

  test('a case-only scenario rename is a drop — names compare case-sensitively', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: B

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 2,
        livingCount: 2,
        missingNames: ['b'],
        noted: false,
      },
    ])
  })

  test('duplicate scenario names are counted with multiplicity, not deduped', () => {
    const living = parseLivingSpec(`## Purpose

x

## Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: a

- **WHEN** x
- **THEN** z

#### Scenario: b

- **WHEN** x
- **THEN** y
`)
    // Same count (3), and every delta name appears in the living spec — but the
    // living spec carries `a` twice and the delta only once, so one is lost.
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y

#### Scenario: b

- **WHEN** x
- **THEN** y

#### Scenario: c

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', living]])),
    ).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 3,
        livingCount: 3,
        missingNames: ['a'],
        noted: false,
      },
    ])
  })

  test('reordering the living scenarios and editing their bodies is not a drop', () => {
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render, quickly.

#### Scenario: b

- **WHEN** x
- **THEN** y promptly

#### Scenario: a

- **WHEN** x
- **THEN** y promptly
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    expect(
      findScenarioDrops([{ capability: 'widgets', ops: p.ops }], new Map([['widgets', LIVING]])),
    ).toEqual([])
  })

  // Belt and braces: the count arm is the contract this gate shipped with, and
  // it must still fire if the two parsers ever disagree about scenario names.
  // Hand-built because a real parse can never produce counts and names that
  // disagree.
  test('the count arm still fires when name extraction sees fewer living scenarios', () => {
    const skewed: LivingSpec = {
      requirementNames: new Set(['Widget rendering']),
      requirementScenarioCounts: new Map([['Widget rendering', 2]]),
      requirementScenarioNames: new Map([['Widget rendering', ['a']]]),
      requirementBlocks: new Map(),
      hasPurpose: true,
      hasRequirements: true,
      hasDeltaHeaders: false,
      purposeText: 'x',
    }
    const p = parseDeltaSpec(
      `## MODIFIED Requirements

### Requirement: Widget rendering

The system SHALL render.

#### Scenario: a

- **WHEN** x
- **THEN** y
`,
      'specs/widgets/spec.md',
      'widgets',
    )
    const drops = findScenarioDrops(
      [{ capability: 'widgets', ops: p.ops }],
      new Map([['widgets', skewed]]),
    )
    expect(drops).toEqual([
      {
        capability: 'widgets',
        name: 'Widget rendering',
        deltaCount: 1,
        livingCount: 2,
        missingNames: [],
        noted: false,
      },
    ])
    // With no names to print, the message keeps its original count wording.
    expect(scenarioDropMessage(drops[0]!)).toBe(
      'MODIFIED "Widget rendering" drops scenario count from 2 to 1',
    )
  })
})

describe('scenarioDropMessage', () => {
  const base = { capability: 'widgets', name: 'Widget rendering', noted: false }

  test('names every dropped scenario and keeps the living/delta counts', () => {
    expect(
      scenarioDropMessage({ ...base, deltaCount: 2, livingCount: 3, missingNames: ['a', 'b'] }),
    ).toBe('MODIFIED "Widget rendering" drops scenario(s) "a", "b" (living 3 -> delta 2)')
  })

  // The prefix `validate.ts` keys its delegated-duplicate suppressor on.
  test('both shapes start with the prefix the delegated-duplicate suppressor keys on', () => {
    const withNames = scenarioDropMessage({
      ...base,
      deltaCount: 2,
      livingCount: 2,
      missingNames: ['b'],
    })
    const countOnly = scenarioDropMessage({
      ...base,
      deltaCount: 1,
      livingCount: 2,
      missingNames: [],
    })
    for (const m of [withNames, countOnly])
      expect(/^MODIFIED "(.*)" drops scenario/.exec(m)?.[1]).toBe('Widget rendering')
  })
})

// W4 — parser tolerances ported from openspec (`buildCodeFenceMask`,
// `maskHtmlComments`, BOM/CRLF normalisation). Both hard archive gates read
// requirement and scenario counts out of these parsers, so a mis-read fence or
// a commented-out header turns a gate into a no-op or invents a phantom drop.
const BOM = '﻿'

describe('parser tolerances: BOM, CRLF, HTML comments, fences', () => {
  test('a UTF-8 BOM does not hide the first section header', () => {
    const p = parseDeltaSpec(
      `${BOM}## ADDED Requirements\n\n### Requirement: X\n\nThe system SHALL x.\n\n#### Scenario: s\n\n- **WHEN** a\n`,
      'specs/x/spec.md',
      'x',
    )
    expect(p.headerPresent).toBe(true)
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0]!.name).toBe('X')
  })

  test("a BOM does not hide a living spec's Purpose or Requirements", () => {
    const living = parseLivingSpec(
      `${BOM}# Spec\n\n## Purpose\n\nWhy this exists.\n\n## Requirements\n\n### Requirement: X\n\n#### Scenario: s\n`,
    )
    expect(living.hasPurpose).toBe(true)
    expect(living.hasRequirements).toBe(true)
    expect(living.requirementNames.has('X')).toBe(true)
  })

  test('CRLF line endings do not leak a carriage return into captured names', () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\r\n\r\n### Requirement: Widget display\r\n\r\nThe system SHALL x.\r\n\r\n#### Scenario: s\r\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops[0]!.name).toBe('Widget display')
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('CRLF does not leak into a `Scenario removed:` reason', () => {
    const p = parseDeltaSpec(
      '## MODIFIED Requirements\r\n\r\n### Requirement: X\r\n\r\nThe system SHALL x.\r\n\r\n- Scenario removed: it merged into s1.\r\n\r\n#### Scenario: s1\r\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops[0]!.scenarioRemovalReasons).toEqual(['it merged into s1.'])
  })

  test('a commented-out requirement is not counted, and line numbers do not shift', () => {
    const p = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '',
        '<!--',
        '### Requirement: Draft idea',
        '',
        '#### Scenario: never',
        '-->',
        '',
        '### Requirement: Real',
        '',
        'The system SHALL x.',
        '',
        '#### Scenario: s',
      ].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0]!.name).toBe('Real')
    // 1-indexed line of `### Requirement: Real` in the ORIGINAL text.
    expect(p.ops[0]!.line).toBe(9)
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('a commented-out scenario does not inflate the living scenario count', () => {
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: X',
        '',
        '#### Scenario: real',
        '',
        '<!-- #### Scenario: dead -->',
      ].join('\n'),
    )
    expect(living.requirementScenarioCounts.get('X')).toBe(1)
  })

  test('an unterminated HTML comment masks the rest of the file', () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\n\n### Requirement: Real\n\nThe system SHALL x.\n\n#### Scenario: s\n\n<!--\n\n### Requirement: Dead\n\n#### Scenario: dead\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops.map((o) => o.name)).toEqual(['Real'])
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('a `--!>` terminator closes a comment', () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\n\n<!-- ### Requirement: Dead --!>\n\n### Requirement: Real\n\nThe system SHALL x.\n\n#### Scenario: s\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops.map((o) => o.name)).toEqual(['Real'])
  })

  test('an inner ``` does not close a four-backtick fence', () => {
    const p = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '',
        '### Requirement: Real',
        '',
        'The system SHALL x.',
        '',
        '````markdown',
        '```',
        '### Requirement: Documented example',
        '```',
        '````',
        '',
        '#### Scenario: s',
        '',
        '- **WHEN** a',
      ].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    // The inner ``` must not close the ```` block, so the example requirement
    // stays invisible and the real requirement keeps its scenario.
    expect(p.ops.map((o) => o.name)).toEqual(['Real'])
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('a ~~~ fence hides markdown structure too', () => {
    const p = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '',
        '### Requirement: Real',
        '',
        'The system SHALL x.',
        '',
        '~~~',
        '### Requirement: Example',
        '#### Scenario: example',
        '~~~',
        '',
        '#### Scenario: s',
      ].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops.map((o) => o.name)).toEqual(['Real'])
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('a ``` line does not close a ~~~ fence', () => {
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: X',
        '',
        '#### Scenario: real',
        '',
        '~~~',
        '```',
        '#### Scenario: fenced',
        '```',
        '~~~',
      ].join('\n'),
    )
    expect(living.requirementScenarioCounts.get('X')).toBe(1)
  })

  test("SHALL inside a requirement's example fence still counts (unchanged)", () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\n\n### Requirement: X\n\n```\nThe system SHALL x.\n```\n\n#### Scenario: s\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops[0]!.hasShallMust).toBe(true)
  })
})

describe('requirement-block retention', () => {
  const DELTA = [
    '## ADDED Requirements',
    '',
    '### Requirement: Alpha',
    '',
    'The system SHALL alpha.',
    '',
    '#### Scenario: one',
    '',
    '- **WHEN** x',
    '- **THEN** y',
    '',
    '### Requirement: Beta',
    '',
    'The system SHALL beta.',
    '',
    '## Notes',
    '',
    'Trailing prose that belongs to no requirement.',
    '',
  ].join('\n')

  test('a delta block runs from its header to the line before the next requirement', () => {
    const p = parseDeltaSpec(DELTA, 'specs/x/spec.md', 'x')
    expect(p.ops[0]!.raw).toBe(
      [
        '### Requirement: Alpha',
        '',
        'The system SHALL alpha.',
        '',
        '#### Scenario: one',
        '',
        '- **WHEN** x',
        '- **THEN** y',
      ].join('\n'),
    )
  })

  test('a delta block ends before the next level-2 section', () => {
    const p = parseDeltaSpec(DELTA, 'specs/x/spec.md', 'x')
    expect(p.ops[1]!.raw).toBe(['### Requirement: Beta', '', 'The system SHALL beta.'].join('\n'))
    expect(p.ops[1]!.raw).not.toContain('Notes')
  })

  test('retaining raw does not shift reported line numbers', () => {
    const p = parseDeltaSpec(DELTA, 'specs/x/spec.md', 'x')
    expect(p.ops.map((o) => o.line)).toEqual([3, 12])
  })

  test('REMOVED and RENAMED ops carry no block', () => {
    const p = parseDeltaSpec(
      [
        '## REMOVED Requirements',
        '',
        '- `### Requirement: Gone`',
        '',
        '## RENAMED Requirements',
        '',
        '- FROM: `### Requirement: A`',
        '- TO: `### Requirement: B`',
        '',
      ].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops.map((o) => o.raw)).toEqual(['', ''])
  })

  test('a living requirement block is retained with the same window', () => {
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: Alpha',
        '',
        'The system SHALL alpha.',
        '',
        '#### Scenario: one',
        '',
        '- **WHEN** x',
        '- **THEN** y',
        '',
        '## Notes',
        '',
        'Not part of Alpha.',
        '',
      ].join('\n'),
    )
    expect(living.requirementBlocks.get('Alpha')).toBe(
      [
        '### Requirement: Alpha',
        '',
        'The system SHALL alpha.',
        '',
        '#### Scenario: one',
        '',
        '- **WHEN** x',
        '- **THEN** y',
      ].join('\n'),
    )
  })

  test('a later section ends a requirement scope, so its scenarios count for nobody', () => {
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: Alpha',
        '',
        '#### Scenario: one',
        '',
        '## Notes',
        '',
        '#### Scenario: stray',
        '',
      ].join('\n'),
    )
    expect(living.requirementScenarioCounts.get('Alpha')).toBe(1)
    expect(living.requirementScenarioNames.get('Alpha')).toEqual(['one'])
  })

  test('fenced content is retained verbatim but yields no scenario', () => {
    const p = parseDeltaSpec(
      [
        '## ADDED Requirements',
        '',
        '### Requirement: X',
        '',
        'The system SHALL x.',
        '',
        '```md',
        '#### Scenario: fenced',
        '```',
        '',
        '#### Scenario: real',
        '',
      ].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops[0]!.raw).toContain('#### Scenario: fenced')
    expect(p.ops[0]!.scenarioNames).toEqual(['real'])
    expect(p.ops[0]!.scenarioCount).toBe(1)
  })

  test('an HTML comment is retained verbatim in raw, not blanked', () => {
    const p = parseDeltaSpec(
      '## ADDED Requirements\n\n### Requirement: X\n\n<!-- an author note -->\n\nThe system SHALL x.\n',
      'specs/x/spec.md',
      'x',
    )
    expect(p.ops[0]!.raw).toContain('<!-- an author note -->')
  })
})

describe('normalizeBlockRaw', () => {
  const BODY = [
    '### Requirement: X',
    '',
    'The system SHALL x.',
    '',
    '#### Scenario: a',
    '#### Scenario: b',
  ]

  test('folds CRLF and outer blank lines but nothing else', () => {
    const lf = BODY.join('\n')
    const crlf = BODY.join('\r\n') + '\r\n\r\n'
    expect(normalizeBlockRaw(crlf)).toBe(normalizeBlockRaw(lf))
  })

  test('folds a lone CR to LF', () => {
    expect(normalizeBlockRaw(BODY.join('\r'))).toBe(normalizeBlockRaw(BODY.join('\n')))
  })

  test('trailing whitespace on an interior line is not folded away', () => {
    const padded = [
      '### Requirement: X',
      '',
      'The system SHALL x.   ',
      '',
      '#### Scenario: a',
      '#### Scenario: b',
    ]
    expect(normalizeBlockRaw(padded.join('\n'))).not.toBe(normalizeBlockRaw(BODY.join('\n')))
  })

  test('interior whitespace differences are not folded away', () => {
    const spaced = [
      '### Requirement: X',
      '',
      'The system  SHALL x.',
      '',
      '#### Scenario: a',
      '#### Scenario: b',
    ]
    expect(normalizeBlockRaw(spaced.join('\n'))).not.toBe(normalizeBlockRaw(BODY.join('\n')))
  })

  test('scenario order is not folded away', () => {
    const reordered = [
      '### Requirement: X',
      '',
      'The system SHALL x.',
      '',
      '#### Scenario: b',
      '#### Scenario: a',
    ]
    expect(normalizeBlockRaw(reordered.join('\n'))).not.toBe(normalizeBlockRaw(BODY.join('\n')))
  })

  test('a CRLF-only difference between two parsed blocks compares equal', () => {
    const text = [
      '## ADDED Requirements',
      '',
      '### Requirement: X',
      '',
      'The system SHALL x.',
      '',
    ].join('\n')
    const lf = parseDeltaSpec(text, 'specs/x/spec.md', 'x').ops[0]!.raw
    const crlf = parseDeltaSpec(text.replace(/\n/g, '\r\n'), 'specs/x/spec.md', 'x').ops[0]!.raw
    expect(normalizeBlockRaw(crlf)).toBe(normalizeBlockRaw(lf))
  })
})

describe('scenarioNameFromHeader', () => {
  test('strips the marker, an ATX close, and a Scenario: prefix', () => {
    expect(scenarioNameFromHeader('#### Scenario: Foo')).toBe('Foo')
    expect(scenarioNameFromHeader('#### Foo')).toBe('Foo')
    expect(scenarioNameFromHeader('#### Foo ####')).toBe('Foo')
    expect(scenarioNameFromHeader('#### Scenario: Foo ###')).toBe('Foo')
    expect(scenarioNameFromHeader('#### scenario:  Foo')).toBe('Foo')
  })

  test('names are case-sensitive', () => {
    expect(scenarioNameFromHeader('#### Scenario: Foo')).not.toBe(
      scenarioNameFromHeader('#### Scenario: foo'),
    )
  })

  test('a `#` run not preceded by a space or tab is kept', () => {
    expect(scenarioNameFromHeader('#### Foo#')).toBe('Foo#')
  })

  test('a `#` run after a non-breaking space is kept, as CommonMark renders it', () => {
    expect(scenarioNameFromHeader('#### Foo\u00a0####')).toBe('Foo\u00a0####')
  })

  test('parsers extract the same names on both sides', () => {
    const block = ['#### Scenario: Foo', '#### Bar ####', '#### baz']
    const p = parseDeltaSpec(
      ['## MODIFIED Requirements', '', '### Requirement: X', '', ...block, ''].join('\n'),
      'specs/x/spec.md',
      'x',
    )
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: X',
        '',
        ...block,
        '',
      ].join('\n'),
    )
    expect(p.ops[0]!.scenarioNames).toEqual(['Foo', 'Bar', 'baz'])
    expect(living.requirementScenarioNames.get('X')).toEqual(['Foo', 'Bar', 'baz'])
  })

  test('duplicate scenario names are retained, not deduped', () => {
    const living = parseLivingSpec(
      [
        '## Purpose',
        '',
        'Why.',
        '',
        '## Requirements',
        '',
        '### Requirement: X',
        '',
        '#### Scenario: a',
        '#### Scenario: a',
        '',
      ].join('\n'),
    )
    expect(living.requirementScenarioNames.get('X')).toEqual(['a', 'a'])
  })
})
