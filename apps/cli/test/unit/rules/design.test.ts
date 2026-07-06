import { describe, expect, test } from 'bun:test'

import { designRules } from '../../../src/core/rules/design.ts'
import { cospecSchema, makeChange, rules } from './helpers.ts'

/** A proposal.md whose `## Surfaces` block checks the given flags. */
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

const strict = { strict: true }
const lax = { strict: false }

describe('design/operational-surface', () => {
  test('deploy flag without the section fires operational-surface (feat)', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces('deploy') }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).toContain('design/operational-surface')
  })

  test('interactive flag without the section fires operational-surface (fix)', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces('interactive') }),
      cospecSchema('fix'),
      lax,
    )
    expect(rules(issues)).toContain('design/operational-surface')
  })

  test('the section present satisfies the deploy flag', () => {
    const issues = designRules(
      makeChange({
        proposalText: proposalWithSurfaces('deploy'),
        designText: '## Operational surface\n\nbind address, secrets, arches.',
      }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).not.toContain('design/operational-surface')
  })

  test('no flags demand no operational-surface section', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces() }),
      cospecSchema('feat'),
      lax,
    )
    expect(rules(issues)).not.toContain('design/operational-surface')
  })

  test('escalates to ERROR under --strict', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces('deploy') }),
      cospecSchema('feat'),
      strict,
    )
    expect(issues.find((i) => i.rule === 'design/operational-surface')?.level).toBe('ERROR')
  })

  test('perf is excluded — the deploy flag never demands it', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces('deploy') }),
      cospecSchema('perf'),
      lax,
    )
    expect(rules(issues)).not.toContain('design/operational-surface')
  })
})

describe('design/integration-contract', () => {
  test('integration flag without the section fires integration-contract', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces('integration') }),
      cospecSchema('refactor'),
      lax,
    )
    expect(rules(issues)).toContain('design/integration-contract')
  })

  test('the section present satisfies the integration flag', () => {
    const issues = designRules(
      makeChange({
        proposalText: proposalWithSurfaces('integration'),
        designText: '## Integration contract\n\nmount ownership, SDK shape.',
      }),
      cospecSchema('refactor'),
      lax,
    )
    expect(rules(issues)).not.toContain('design/integration-contract')
  })
})

describe('design/seam-ownership', () => {
  test('always fires for refactor when the section is absent', () => {
    const issues = designRules(
      makeChange({ proposalText: proposalWithSurfaces() }),
      cospecSchema('refactor'),
      lax,
    )
    expect(rules(issues)).toContain('design/seam-ownership')
  })

  test('satisfied once the section is present', () => {
    const issues = designRules(
      makeChange({ designText: '## Seam ownership\n\nlane X owns the shared cache.' }),
      cospecSchema('refactor'),
      lax,
    )
    expect(rules(issues)).not.toContain('design/seam-ownership')
  })

  test('does not fire for feat (only refactor carries the always-on check)', () => {
    const issues = designRules(makeChange(), cospecSchema('feat'), lax)
    expect(rules(issues)).not.toContain('design/seam-ownership')
  })
})
