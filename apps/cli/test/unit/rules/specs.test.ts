import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { parseLivingSpec } from '../../../src/core/deltas.ts'
import { openspecPackageDir } from '../../../src/core/openspec.ts'
import {
  opensWithPlaceholderMarker,
  SPECS_DELEGATED_TWINS,
  specsRules,
} from '../../../src/core/rules/specs.ts'

const DIST = join(openspecPackageDir(), 'dist')
const placeholder = (await import(join(DIST, 'core/validation/purpose-placeholder.js'))) as {
  findPurposePlaceholderIssue: (overview: string, content?: string) => unknown
}
const constants = (await import(join(DIST, 'core/validation/constants.js'))) as {
  VALIDATION_MESSAGES: { REQUIREMENT_TOO_LONG: string }
}

const purposeOf = (p: string) => parseLivingSpec(`## Purpose\n\n${p}\n\n## Requirements\n`)

const SCEN = '#### Scenario: s\n\n- **WHEN** a\n- **THEN** b\n'
const living = (statement: string): string =>
  `# X\n\n## Purpose\n\nA real purpose for the x capability.\n\n## Requirements\n\n### Requirement: Long one\n\n${statement}\n\n${SCEN}`

describe('specsRules', () => {
  test('specs/purpose-tbd on the archive-generated placeholder', () => {
    const spec = parseLivingSpec(
      '# X Specification\n\n## Purpose\n\nTBD - created by archiving change add-x. Update Purpose after archive.\n\n## Requirements\n',
    )
    const issues = specsRules(spec, 'specs/x/spec.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('specs/purpose-tbd')
    expect(issues[0]!.level).toBe('WARNING')
  })

  test('specs/purpose-tbd on a Purpose opening with a TBD marker', () => {
    const spec = parseLivingSpec('## Purpose\n\nTBD: decide what this is for.\n\n## Requirements\n')
    const issues = specsRules(spec, 'specs/x/spec.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.rule).toBe('specs/purpose-tbd')
    expect(issues[0]!.message).toMatch(/TBD\/TODO marker/)
  })

  test('specs/purpose-tbd on a Purpose opening with TODO', () => {
    const spec = parseLivingSpec('## Purpose\n\nTODO - write this.\n\n## Requirements\n')
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(1)
  })

  test('the generated placeholder keeps its own, more specific wording', () => {
    // It opens with `TBD` too, so both forms match; one rule emits one finding
    // and the sentence naming the exact text to replace wins.
    const spec = parseLivingSpec(
      '## Purpose\n\nTBD - created by archiving change add-x. Update Purpose after archive.\n\n## Requirements\n',
    )
    const issues = specsRules(spec, 'specs/x/spec.md')
    expect(issues).toHaveLength(1)
    expect(issues[0]!.message).toMatch(/archive-generated/)
  })

  test('a marker inside a sentence is left alone', () => {
    const spec = parseLivingSpec(
      '## Purpose\n\nThe retry budget is TBD pending benchmarks; this capability owns retries.\n\n## Requirements\n',
    )
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(0)
  })

  test('a longer word merely starting with the marker is not one', () => {
    const spec = parseLivingSpec('## Purpose\n\nTBDs are tracked elsewhere.\n\n## Requirements\n')
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(0)
  })

  test('an empty Purpose is not reported here', () => {
    const spec = parseLivingSpec('## Purpose\n\n## Requirements\n')
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(0)
  })

  test('a real purpose produces no issue', () => {
    const spec = parseLivingSpec('## Purpose\n\nA genuine purpose paragraph.\n\n## Requirements\n')
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(0)
  })

  // 1.14.x case rule: capitals always; any other casing only before the end,
  // a line break, or marker punctuation.
  test('the placeholder case rule answers as the pinned binary does', () => {
    const cases = [
      'TODO: describe this',
      'TODO write this later',
      'TBD',
      'todo - write this later',
      'tbd.',
      'Tbd',
      'todo\nlater',
      'Todo el flujo de pago se valida aquí.',
      'Todo o fluxo de pagamento.',
      'tbd pending',
      'TBDs are tracked elsewhere.',
      'TODO\u0663',
      'todo (later)',
      'todo\u2014later',
    ]
    for (const purpose of cases)
      expect({ purpose, marker: opensWithPlaceholderMarker(purpose) }).toEqual({
        purpose,
        marker: placeholder.findPurposePlaceholderIssue(purpose) !== null,
      })
  })

  test('"Todo el…" is not a marker; "todo -" and "tbd." still are', () => {
    expect(specsRules(purposeOf('Todo el flujo de pago…'), 'specs/x/spec.md')).toHaveLength(0)
    expect(specsRules(purposeOf('Todo o fluxo…'), 'specs/x/spec.md')).toHaveLength(0)
    expect(specsRules(purposeOf('todo - write this'), 'specs/x/spec.md')).toHaveLength(1)
    expect(specsRules(purposeOf('tbd.'), 'specs/x/spec.md')).toHaveLength(1)
  })

  test('specs/requirement-too-long on a living requirement over 500 characters', () => {
    const issues = specsRules(
      parseLivingSpec(living(`The system SHALL ${'x'.repeat(490)}.`)),
      'specs/x/spec.md',
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      level: 'WARNING',
      rule: 'specs/requirement-too-long',
      line: 9,
      message: '"Long one" requirement text is 508 characters, over the 500-character limit',
    })
    expect(issues[0]!.hint).toMatch(/split it into separate requirements/)
  })

  test('scenarios do not count toward the length; exactly 500 characters is fine', () => {
    const at500 = `The system SHALL ${'x'.repeat(482)}.`
    expect(at500).toHaveLength(500)
    expect(specsRules(parseLivingSpec(living(at500)), 'specs/x/spec.md')).toEqual([])
    const longScenario = living(
      `The system SHALL x.\n\n#### Scenario: big\n\n- **WHEN** ${'y'.repeat(900)}`,
    )
    expect(specsRules(parseLivingSpec(longScenario), 'specs/x/spec.md')).toEqual([])
  })

  test("the delegated twins match openspec's own REQUIREMENT_TOO_LONG messages", () => {
    const [livingTwin, addedTwin] = SPECS_DELEGATED_TWINS
    const message = constants.VALIDATION_MESSAGES.REQUIREMENT_TOO_LONG
    expect(livingTwin.delegated.test(message)).toBe(true)
    expect(addedTwin.delegated.exec(`ADDED "Long one": ${message}`)?.[1]).toBe('Long one')
    expect(
      addedTwin.nativeKey.exec(
        'ADDED "Long one" requirement text is 620 characters, over the 500-character limit',
      )?.[1],
    ).toBe('Long one')
  })
})
