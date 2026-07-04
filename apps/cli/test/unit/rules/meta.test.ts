import { describe, expect, test } from 'bun:test'

import { metaRules } from '../../../src/core/rules/meta.ts'
import { cospecSchema, makeChange, rules } from './helpers.ts'

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
