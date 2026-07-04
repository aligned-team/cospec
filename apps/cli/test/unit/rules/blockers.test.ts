import { describe, expect, test } from 'bun:test'

import { blockersRules } from '../../../src/core/rules/blockers.ts'
import { ctx, makeChange, rules } from './helpers.ts'

function withBlockers(text: string) {
  return makeChange({ blockersText: text })
}

describe('blockersRules', () => {
  test('a well-formed None./None. file is clean', () => {
    const change = withBlockers('## Blocked by\n\nNone.\n\n## Soft-blocked by\n\nNone.\n')
    expect(blockersRules(change, ctx())).toHaveLength(0)
  })

  test('blockers/sections fires on a missing heading, with near-miss hint', () => {
    const change = withBlockers('## Blocked By\n\nNone.\n\n## Soft-blocked by\n\nNone.\n')
    const issue = blockersRules(change, ctx()).find((i) => i.rule === 'blockers/sections')
    expect(issue).toBeDefined()
    expect(issue!.hint).toContain('## Blocked by')
  })

  test('blockers/none-conflict when None. coexists with an entry', () => {
    const change = withBlockers(
      '## Blocked by\n\nNone.\n- [ ] `dep` — x\n\n## Soft-blocked by\n\nNone.\n',
    )
    expect(rules(blockersRules(change, ctx({ activeSlugs: new Set(['dep']) })))).toContain(
      'blockers/none-conflict',
    )
  })

  test('blockers/entry-grammar on a malformed entry', () => {
    const change = withBlockers('## Blocked by\n\n-[ ] `dep` — x\n\n## Soft-blocked by\n\nNone.\n')
    expect(rules(blockersRules(change, ctx()))).toContain('blockers/entry-grammar')
  })

  test('blockers/dangling-ref for an unknown slug', () => {
    const change = withBlockers(
      '## Blocked by\n\n- [ ] `ghost` — x\n\n## Soft-blocked by\n\nNone.\n',
    )
    expect(rules(blockersRules(change, ctx()))).toContain('blockers/dangling-ref')
  })

  test('blockers/stale-unchecked (fixable) when target is archived', () => {
    const change = withBlockers('## Blocked by\n\n- [ ] `dep` — x\n\n## Soft-blocked by\n\nNone.\n')
    const issue = blockersRules(change, ctx({ archiveSlugs: new Set(['dep']) })).find(
      (i) => i.rule === 'blockers/stale-unchecked',
    )
    expect(issue?.fixable).toBe(true)
  })

  test('blockers/premature-checked when a checked entry is not archived', () => {
    const change = withBlockers('## Blocked by\n\n- [x] `dep` — x\n\n## Soft-blocked by\n\nNone.\n')
    expect(rules(blockersRules(change, ctx({ activeSlugs: new Set(['dep']) })))).toContain(
      'blockers/premature-checked',
    )
  })
})
