import { describe, expect, test } from 'bun:test'

import { verificationRules } from '../../../src/core/rules/verification.ts'
import { cospecSchema, makeChange, rules } from './helpers.ts'

const strict = { strict: true }
const lax = { strict: false }

/** A proposal.md whose ## Surfaces block checks the given flags. */
function proposalWithSurfaces(...flags: string[]): string {
  const lines = [
    '## Why',
    'because',
    '',
    '## Surfaces',
    '',
    ...['interactive', 'deploy', 'integration', 'agent-behavior'].map(
      (f) => `- [${flags.includes(f) ? 'x' : ' '}] ${f} — desc`,
    ),
  ]
  return lines.join('\n')
}

describe('verification/missing', () => {
  test('fires when the file is absent for a type that gates on it', () => {
    const issues = verificationRules(makeChange(), cospecSchema('feat'), strict)
    expect(rules(issues)).toContain('verification/missing')
  })

  test('does not fire for an optional (soft-promotable) type with no file', () => {
    const issues = verificationRules(makeChange(), cospecSchema('build'), strict)
    expect(rules(issues)).not.toContain('verification/missing')
  })
})

describe('verification/structure', () => {
  test('fires when there are no groups', () => {
    const issues = verificationRules(
      makeChange({ verificationText: 'no groups here' }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/structure')
  })

  test('fires when a group has no rows', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. Behavior\n\n## 2. Other\n- [ ] 2.1 @e2e go -> ok' }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/structure')
  })
})

describe('grammar and vocabulary rules', () => {
  const feat = cospecSchema('feat')

  test('verification/row-grammar for a malformed row', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G\n- [ ] 1.1 @e2e no arrow here' }),
      feat,
      lax,
    )
    expect(rules(issues)).toContain('verification/row-grammar')
  })

  test('verification/layer-unknown for an out-of-vocabulary layer', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G [critical]\n- [ ] 1.1 @smoke run -> pass' }),
      feat,
      lax,
    )
    expect(rules(issues)).toContain('verification/layer-unknown')
  })

  test('a project-extended layer is accepted', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G [critical]\n- [ ] 1.1 @smoke run -> pass' }),
      feat,
      { strict: false, extraLayers: ['smoke'] },
    )
    expect(rules(issues)).not.toContain('verification/layer-unknown')
  })

  test('verification/owner-unknown for a bad owner token', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G [critical]\n- [ ] 1.1 @e2e (bot) run -> pass' }),
      feat,
      lax,
    )
    expect(rules(issues)).toContain('verification/owner-unknown')
  })

  test('verification/evidence-required for a checked row with an empty result', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G [critical]\n- [x] 1.1 @e2e run -> ' }),
      feat,
      lax,
    )
    expect(rules(issues)).toContain('verification/evidence-required')
  })

  test('verification/deferred-reason for a deferred row with no reason', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G [critical]\n- [~] 1.1 @e2e run -> ok but no defer' }),
      feat,
      lax,
    )
    expect(rules(issues)).toContain('verification/deferred-reason')
  })

  test('a deferred row with a reason passes', () => {
    const issues = verificationRules(
      makeChange({
        verificationText:
          '## 1. G [critical]\n- [~] 1.1 @e2e run -> defer: superseded by upstream fix',
      }),
      feat,
      lax,
    )
    expect(rules(issues)).not.toContain('verification/deferred-reason')
  })
})

describe('per-type required-row facts', () => {
  test('feat: a [critical] group with only @unit fires critical-real-layer', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. Core [critical]\n- [ ] 1.1 @unit run -> pass' }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/critical-real-layer')
  })

  test('feat: a [critical] group with an @e2e row passes', () => {
    const issues = verificationRules(
      makeChange({
        verificationText:
          '## 1. Core [critical]\n- [ ] 1.1 @unit run -> pass\n- [ ] 1.2 @e2e drive -> ok',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).not.toContain('verification/critical-real-layer')
  })

  test('fix: no @regression row fires reproduces-bug', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G\n- [ ] 1.1 @unit run -> pass' }),
      cospecSchema('fix'),
      lax,
    )
    expect(rules(issues)).toContain('verification/reproduces-bug')
  })

  test('fix: a @regression row satisfies reproduces-bug', () => {
    const issues = verificationRules(
      makeChange({
        verificationText: '## 1. G\n- [ ] 1.1 @regression fails before, passes after -> green',
      }),
      cospecSchema('fix'),
      lax,
    )
    expect(rules(issues)).not.toContain('verification/reproduces-bug')
  })

  test('perf: missing @benchmark or @equivalence fires equivalence', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G\n- [ ] 1.1 @benchmark measure -> 2x faster' }),
      cospecSchema('perf'),
      lax,
    )
    expect(rules(issues)).toContain('verification/equivalence')
  })

  test('perf: both @benchmark and @equivalence satisfy the rule', () => {
    const issues = verificationRules(
      makeChange({
        verificationText:
          '## 1. G\n- [ ] 1.1 @benchmark measure -> 2x\n- [ ] 1.2 @equivalence suite -> unchanged',
      }),
      cospecSchema('perf'),
      lax,
    )
    expect(rules(issues)).not.toContain('verification/equivalence')
  })

  test('refactor: no @equivalence row fires invariant', () => {
    const issues = verificationRules(
      makeChange({ verificationText: '## 1. G\n- [ ] 1.1 @unit run -> pass' }),
      cospecSchema('refactor'),
      lax,
    )
    expect(rules(issues)).toContain('verification/invariant')
  })
})

describe('surface-driven rules', () => {
  test('interactive flag without a @manual/@e2e row fires interactive-required', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('interactive'),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @integration run -> ok',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/interactive-required')
  })

  test('interactive flag with an @manual row passes', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('interactive'),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @manual click -> toggles',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).not.toContain('verification/interactive-required')
  })

  test('agent-behavior flag without an @eval row fires eval-check', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('agent-behavior'),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @e2e run -> ok',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/eval-check')
  })

  test('integration flag without an @integration row fires integration-check', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('integration'),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @e2e run -> ok',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('verification/integration-check')
  })

  test('no surface flags demand no surface rows', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces(),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @e2e run -> ok',
      }),
      cospecSchema('feat'),
      lax,
    )
    const fired = rules(issues)
    expect(fired).not.toContain('verification/interactive-required')
    expect(fired).not.toContain('verification/eval-check')
    expect(fired).not.toContain('verification/integration-check')
  })

  test('build: deploy flag without a @runtime row fires deploy-real-layer', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('deploy'),
        verificationText: '## 1. G\n- [ ] 1.1 @unit run -> pass',
      }),
      cospecSchema('build'),
      lax,
    )
    expect(rules(issues)).toContain('verification/deploy-real-layer')
  })

  test('build: deploy flag with a @runtime row passes', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('deploy'),
        verificationText: '## 1. G\n- [ ] 1.1 @runtime deploy and hit it -> serves 200',
      }),
      cospecSchema('build'),
      lax,
    )
    expect(rules(issues)).not.toContain('verification/deploy-real-layer')
  })

  test('surface rules escalate to ERROR under --strict', () => {
    const issues = verificationRules(
      makeChange({
        proposalText: proposalWithSurfaces('interactive'),
        verificationText: '## 1. G [critical]\n- [ ] 1.1 @integration run -> ok',
      }),
      cospecSchema('feat'),
      strict,
    )
    const interactive = issues.find((i) => i.rule === 'verification/interactive-required')
    expect(interactive?.level).toBe('ERROR')
  })
})
