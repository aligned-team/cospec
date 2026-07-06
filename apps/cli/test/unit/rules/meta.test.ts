import { describe, expect, test } from 'bun:test'

import {
  metaRules,
  schemaOutdatedIssues,
  surfaceUnmetConsequences,
} from '../../../src/core/rules/meta.ts'
import { cospecSchema, legacySchema, makeChange, rules } from './helpers.ts'

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

const full = {
  proposalText: '## Why\n\nx',
  blockersText: '# Dependencies\n\n## Blocked by\n\nNone.\n\n## Soft-blocked by\n\nNone.\n',
  tasksText: '## 1. G\n\n- [ ] 1.1 t',
  deltaFiles: [{ path: 'specs/w/spec.md', capability: 'w', text: '## ADDED Requirements\n' }],
}

describe('metaRules', () => {
  test('a complete feat change has no meta ERROR/WARNING', () => {
    const change = makeChange({ ...full, designExists: true })
    const issues = metaRules(change, cospecSchema('feat'), { strict: false })
    expect(issues.filter((i) => i.level !== 'INFO')).toHaveLength(0)
  })

  test('meta/openspec-yaml fires when the file is missing', () => {
    const change = makeChange({ openspecYaml: { present: false, parseable: false } })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/openspec-yaml',
    )
  })

  test('meta/openspec-yaml fires on a malformed created date', () => {
    const change = makeChange({
      ...full,
      openspecYaml: { present: true, parseable: true, schema: 'feat', created: '07-2026' },
    })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/openspec-yaml',
    )
  })

  test('meta/openspec-yaml rejects a non-integer schemaVersion', () => {
    const change = makeChange({
      ...full,
      openspecYaml: { present: true, parseable: true, schema: 'feat', schemaVersionInvalid: true },
    })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/openspec-yaml',
    )
  })

  test('meta/name-kebab rejects a date-prefixed name', () => {
    const change = makeChange({ ...full, id: '2026-01-01-thing' })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/name-kebab',
    )
  })

  test('meta/forbidden-artifact fires for specs/ under ci', () => {
    const change = makeChange({
      ...full,
      deltaFiles: [{ path: 'specs/p/spec.md', capability: 'p', text: '## ADDED Requirements\n' }],
    })
    const issues = metaRules(change, cospecSchema('ci'), { strict: false })
    expect(rules(issues)).toContain('meta/forbidden-artifact')
  })

  test('meta/unexpected-file excludes README.md and .refine/', () => {
    const change = makeChange({
      ...full,
      files: ['README.md', '.refine/notes.md', 'weird.txt', 'proposal.md'],
    })
    const unexpected = metaRules(change, cospecSchema('feat'), { strict: false }).filter(
      (i) => i.rule === 'meta/unexpected-file',
    )
    expect(unexpected.map((i) => i.path)).toEqual(['weird.txt'])
  })

  test('meta/empty-change on an artifact-less change', () => {
    const change = makeChange({ openspecYaml: { present: true, parseable: true, schema: 'feat' } })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/empty-change',
    )
  })

  test('change/artifact-missing is INFO by default and ERROR under --strict', () => {
    const change = makeChange({ proposalText: '## Why\n\nx' }) // feat missing specs/tasks/blocking
    const lax = metaRules(change, cospecSchema('feat'), { strict: false })
    const strict = metaRules(change, cospecSchema('feat'), { strict: true })
    expect(lax.find((i) => i.rule === 'change/artifact-missing')!.level).toBe('INFO')
    expect(strict.find((i) => i.rule === 'change/artifact-missing')!.level).toBe('ERROR')
  })
})

describe('surfaceUnmetConsequences (pure computation)', () => {
  test('an O(trig) type with a checked deploy flag and no verification.md is unmet', () => {
    expect(surfaceUnmetConsequences('build', proposalWithSurfaces('deploy'), false)).toEqual([
      { flag: 'deploy' },
    ])
  })

  test('an existing verification.md satisfies the consequence regardless of content', () => {
    expect(surfaceUnmetConsequences('build', proposalWithSurfaces('deploy'), true)).toEqual([])
  })

  test('no checked flags means no consequence', () => {
    expect(surfaceUnmetConsequences('build', proposalWithSurfaces(), false)).toEqual([])
  })

  test('a type where verification is not soft-promotable never triggers (already enforced or forbidden)', () => {
    expect(surfaceUnmetConsequences('feat', proposalWithSurfaces('deploy'), false)).toEqual([])
    expect(surfaceUnmetConsequences('chore', proposalWithSurfaces('deploy'), false)).toEqual([])
  })

  test('a flag with no applicable consequence for the type is a no-op', () => {
    expect(surfaceUnmetConsequences('revert', proposalWithSurfaces('integration'), false)).toEqual(
      [],
    )
    expect(
      surfaceUnmetConsequences('build', proposalWithSurfaces('agent-behavior'), false),
    ).toEqual([])
  })
})

describe('meta/schema-outdated (DESIGN §5 migration nudge)', () => {
  test('fires INFO for a change with no schemaVersion (defaults to 1)', () => {
    const change = makeChange({
      ...full,
      openspecYaml: { present: true, parseable: true, schema: 'feat' },
    })
    const issues = schemaOutdatedIssues(change, cospecSchema('feat'))
    expect(issues).toHaveLength(1)
    expect(issues[0]!.level).toBe('INFO')
    expect(issues[0]!.hint).toContain('cospec migrate')
  })

  test('does not fire for a schemaVersion 2 change', () => {
    const change = makeChange({
      ...full,
      openspecYaml: { present: true, parseable: true, schema: 'feat', schemaVersion: 2 },
    })
    expect(schemaOutdatedIssues(change, cospecSchema('feat'))).toEqual([])
  })

  test('never fires for a non-cospec schema', () => {
    const change = makeChange({
      ...full,
      openspecYaml: { present: true, parseable: true, schema: 'my-fork' },
    })
    expect(schemaOutdatedIssues(change, legacySchema('my-fork'))).toEqual([])
  })

  test('is wired into metaRules and never blocks (INFO only)', () => {
    const change = makeChange({ ...full, designExists: true })
    expect(rules(metaRules(change, cospecSchema('feat'), { strict: false }))).toContain(
      'meta/schema-outdated',
    )
  })
})

describe('meta/surface-unmet (validate-time issue)', () => {
  test('fires for an O(trig) type with a checked flag and no verification.md', () => {
    const change = makeChange({ proposalText: proposalWithSurfaces('deploy') })
    expect(rules(metaRules(change, cospecSchema('build'), { strict: false }))).toContain(
      'meta/surface-unmet',
    )
  })

  test('is WARNING by default and ERROR under --strict', () => {
    const change = makeChange({ proposalText: proposalWithSurfaces('deploy') })
    const lax = metaRules(change, cospecSchema('build'), { strict: false })
    const strict = metaRules(change, cospecSchema('build'), { strict: true })
    expect(lax.find((i) => i.rule === 'meta/surface-unmet')!.level).toBe('WARNING')
    expect(strict.find((i) => i.rule === 'meta/surface-unmet')!.level).toBe('ERROR')
  })

  test('does not fire once verification.md exists', () => {
    const change = makeChange({
      proposalText: proposalWithSurfaces('deploy'),
      verificationText: '## 1. G\n- [ ] 1.1 @unit run -> pass',
    })
    expect(rules(metaRules(change, cospecSchema('build'), { strict: false }))).not.toContain(
      'meta/surface-unmet',
    )
  })

  test('a stray flag on a target the type does not soft-promote is a no-op', () => {
    const change = makeChange({ proposalText: proposalWithSurfaces('integration') })
    expect(rules(metaRules(change, cospecSchema('revert'), { strict: false }))).not.toContain(
      'meta/surface-unmet',
    )
  })
})
