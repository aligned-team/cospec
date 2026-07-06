import { describe, expect, test } from 'bun:test'

import { proposalRules } from '../../../src/core/rules/proposal.ts'
import { cospecSchema, ctx, makeChange, rules } from './helpers.ts'

const WHY = 'We need this because the current behavior is broken in a way that blocks users daily.'

describe('proposalRules', () => {
  test('proposal/missing when proposal.md is absent', () => {
    const issues = proposalRules(makeChange(), cospecSchema('feat'), ctx(), { strict: false })
    expect(rules(issues)).toContain('proposal/missing')
  })

  test('proposal/missing is ERROR under strict when other artifacts exist', () => {
    const change = makeChange({ tasksText: '## 1. G\n\n- [ ] 1.1 t' })
    const issues = proposalRules(change, cospecSchema('feat'), ctx(), { strict: true })
    expect(issues.find((i) => i.rule === 'proposal/missing')!.level).toBe('ERROR')
  })

  test('proposal/sections requires ## Capabilities for feat', () => {
    const change = makeChange({
      proposalText: `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Impact\n\n- y`,
    })
    const issues = proposalRules(change, cospecSchema('feat'), ctx(), { strict: false })
    const sec = issues.find((i) => i.rule === 'proposal/sections')
    expect(sec?.message).toContain('## Capabilities')
  })

  test('lite type does not require ## Capabilities', () => {
    const change = makeChange({
      proposalText: `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Impact\n\n- y`,
    })
    const issues = proposalRules(change, cospecSchema('ci'), ctx(), { strict: false })
    expect(rules(issues)).not.toContain('proposal/sections')
  })

  test('proposal/why-substantive warns on a short Why for full types', () => {
    const change = makeChange({
      proposalText:
        '## Why\n\nshort\n\n## What Changes\n\n- x\n\n## Capabilities\n\n- c\n\n## Impact\n\n- y',
    })
    expect(rules(proposalRules(change, cospecSchema('feat'), ctx(), { strict: false }))).toContain(
      'proposal/why-substantive',
    )
  })

  test('proposal/benchmarks required for perf', () => {
    const change = makeChange({
      proposalText: `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Impact\n\n- y`,
    })
    expect(rules(proposalRules(change, cospecSchema('perf'), ctx(), { strict: false }))).toContain(
      'proposal/benchmarks',
    )
  })

  test('perf passes with a Benchmarks table row', () => {
    const change = makeChange({
      proposalText: `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Impact\n\n- y\n\n## Benchmarks\n\n| metric | before | after |\n| --- | --- | --- |\n| p50 | 100 | 50 |`,
    })
    expect(
      rules(proposalRules(change, cospecSchema('perf'), ctx(), { strict: false })),
    ).not.toContain('proposal/benchmarks')
  })

  test('proposal/revert-citation requires an archived slug or sha', () => {
    const base = `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Impact\n\n- y`
    const missing = makeChange({ proposalText: base })
    expect(
      rules(proposalRules(missing, cospecSchema('revert'), ctx(), { strict: false })),
    ).toContain('proposal/revert-citation')
    const cited = makeChange({ proposalText: `${base}\n\n## Reverts\n\nReverts \`old-change\`.` })
    expect(
      rules(
        proposalRules(
          cited,
          cospecSchema('revert'),
          ctx({ archiveSlugs: new Set(['old-change']) }),
          {
            strict: false,
          },
        ),
      ),
    ).not.toContain('proposal/revert-citation')
  })
})

describe('proposal/surfaces-vocab', () => {
  const base = `## Why\n\n${WHY}\n\n## What Changes\n\n- x\n\n## Capabilities\n\n- c\n\n## Impact\n\n- y`

  test('valid surface flags from the closed vocabulary parse cleanly', () => {
    const change = makeChange({
      proposalText: `${base}\n\n## Surfaces\n\n- [x] interactive — ui\n- [x] deploy — infra\n- [ ] integration — sdk\n- [ ] agent-behavior — prompts`,
    })
    expect(
      rules(proposalRules(change, cospecSchema('feat'), ctx(), { strict: false })),
    ).not.toContain('proposal/surfaces-vocab')
  })

  test('an unknown surface token is rejected (fail-closed)', () => {
    const change = makeChange({
      proposalText: `${base}\n\n## Surfaces\n\n- [ ] telemetry — not a real flag`,
    })
    expect(rules(proposalRules(change, cospecSchema('feat'), ctx(), { strict: false }))).toContain(
      'proposal/surfaces-vocab',
    )
  })

  test('an unknown token is an ERROR even outside --strict (fail-closed)', () => {
    const change = makeChange({
      proposalText: `${base}\n\n## Surfaces\n\n- [ ] telemetry — not a real flag`,
    })
    const issues = proposalRules(change, cospecSchema('feat'), ctx(), { strict: false })
    expect(issues.find((i) => i.rule === 'proposal/surfaces-vocab')!.level).toBe('ERROR')
  })

  test('light types omit the block — an unknown token is not checked', () => {
    const liteBase = `## Why\n\nshort but present\n\n## What Changes\n\n- x\n\n## Impact\n\n- y`
    const change = makeChange({
      proposalText: `${liteBase}\n\n## Surfaces\n\n- [ ] telemetry — not a real flag`,
    })
    expect(
      rules(proposalRules(change, cospecSchema('chore'), ctx(), { strict: false })),
    ).not.toContain('proposal/surfaces-vocab')
  })
})
