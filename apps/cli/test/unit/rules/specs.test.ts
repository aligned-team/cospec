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

  test('a real purpose produces no issue', () => {
    const spec = parseLivingSpec('## Purpose\n\nA genuine purpose paragraph.\n\n## Requirements\n')
    expect(specsRules(spec, 'specs/x/spec.md')).toHaveLength(0)
  })
})
