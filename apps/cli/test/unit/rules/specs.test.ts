import { describe, expect, test } from 'bun:test'

import { parseLivingSpec } from '../../../src/core/deltas.ts'
import { specsRules } from '../../../src/core/rules/specs.ts'

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
})
