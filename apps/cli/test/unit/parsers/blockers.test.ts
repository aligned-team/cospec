import { describe, expect, test } from 'bun:test'

import {
  parseBlockers,
  serializeEntry,
  syncBlockers,
  type BlockerEntry,
} from '../../../src/core/blockers.ts'

const TEMPLATE = `# Dependencies

## Blocked by

<!-- comment -->

- [ ] \`add-auth\` — provides the auth module
- [x] \`base-schema\` — the schema *(archived 2026-05-01)*

## Soft-blocked by

None.
`

describe('parseBlockers grammar', () => {
  test('parses gated sections, entries, checkbox state, date, description', () => {
    const p = parseBlockers(TEMPLATE)
    expect(p.blocked.present).toBe(true)
    expect(p.soft.present).toBe(true)
    expect(p.blocked.entries).toHaveLength(2)
    const [a, b] = p.blocked.entries
    expect(a!.slug).toBe('add-auth')
    expect(a!.checked).toBe(false)
    expect(a!.description).toBe('provides the auth module')
    expect(b!.checked).toBe(true)
    expect(b!.archivedDate).toBe('2026-05-01')
    expect(p.soft.hasNone).toBe(true)
  })

  test('accepts hyphen, en-dash and em-dash separators', () => {
    for (const sep of ['-', '–', '—']) {
      const p = parseBlockers(`## Blocked by\n\n- [ ] \`x\` ${sep} desc\n`)
      expect(p.blocked.entries).toHaveLength(1)
      expect(p.blocked.entries[0]!.description).toBe('desc')
    }
  })

  test('detects near-miss headings with the corrected form', () => {
    const p = parseBlockers('## Blocked By\n\nNone.\n\n## Soft-blocked by\n\nNone.\n')
    expect(p.blocked.present).toBe(false)
    const nm = p.nearMisses.find((n) => n.key === 'blocked')
    expect(nm?.expected).toBe('## Blocked by')
  })

  test('treats indented lines after an entry as continuations (ignored)', () => {
    const p = parseBlockers('## Blocked by\n\n- [ ] `x` — desc\n  more detail here\n')
    expect(p.blocked.entries).toHaveLength(1)
    expect(p.blocked.malformed).toHaveLength(0)
  })

  test('allows free prose after None./entries', () => {
    const p = parseBlockers('## Blocked by\n\nNone.\n\nSome narrative appendix text.\n')
    expect(p.blocked.malformed).toHaveLength(0)
    expect(p.blocked.hasNone).toBe(true)
  })

  test('flags a malformed checkbox-like line', () => {
    const p = parseBlockers('## Blocked by\n\n-[ ] `x` — desc\n')
    expect(p.blocked.malformed).toHaveLength(1)
    expect(p.blocked.malformed[0]!.corrected).toBe('- [ ] `x` — desc')
  })

  test('lints loose slug bullets outside gated sections', () => {
    const p = parseBlockers('## Notes\n\n- `some-change` matters\n')
    expect(p.looseSlugBullets).toHaveLength(1)
  })
})

describe('serializeEntry', () => {
  test('always emits the canonical em-dash form', () => {
    const e: BlockerEntry = {
      raw: '',
      line: 1,
      checked: false,
      slug: 'x',
      description: 'y',
      separator: '-',
    }
    expect(serializeEntry(e)).toBe('- [ ] `x` — y')
  })

  test('appends the archived suffix when a date is present', () => {
    const e: BlockerEntry = {
      raw: '',
      line: 1,
      checked: true,
      slug: 'x',
      separator: '—',
      archivedDate: '2026-01-02',
    }
    expect(serializeEntry(e)).toBe('- [x] `x` *(archived 2026-01-02)*')
  })
})

describe('syncBlockers', () => {
  const archived = new Map([['dep', '2026-04-01']])
  const active = new Set(['dep', 'sib'])

  test('STALE: fix checks the box, stamps the date, normalizes the separator', () => {
    const text = '## Blocked by\n\n- [ ] `dep` - provides x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, active, { fix: true })
    expect(r.findings.some((f) => f.class === 'STALE')).toBe(true)
    expect(r.synced).toEqual(['dep'])
    expect(r.output).toContain('- [x] `dep` — provides x *(archived 2026-04-01)*')
    expect(r.changed).toBe(true)
  })

  test('DANGLING: never auto-fixed', () => {
    const text = '## Blocked by\n\n- [ ] `ghost` — x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, new Set(), { fix: true })
    expect(r.findings.some((f) => f.class === 'DANGLING')).toBe(true)
    expect(r.output).toBe(text)
    expect(r.changed).toBe(false)
  })

  test('MANUAL-CHECK: checked but not archived is a warning-class finding', () => {
    const text = '## Blocked by\n\n- [x] `sib` — x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, active, { fix: true })
    expect(r.findings.some((f) => f.class === 'MANUAL-CHECK')).toBe(true)
  })

  test('FORMAT: malformed entry is reported and never rewritten', () => {
    const text = '## Blocked by\n\n-[ ] `dep` — x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, active, { fix: true })
    expect(r.findings.some((f) => f.class === 'FORMAT')).toBe(true)
  })

  test('fix is idempotent: fix(fix(x)) === fix(x)', () => {
    const text =
      '## Blocked by\n\n- [ ] `dep` - x\n- [ ] `sib` – y\n\n## Soft-blocked by\n\nNone.\n'
    const first = syncBlockers(text, archived, active, { fix: true }).output
    const second = syncBlockers(first, archived, active, { fix: true }).output
    expect(second).toBe(first)
  })

  test('reports fully unblocked when every Blocked-by entry is checked', () => {
    const text = '## Blocked by\n\n- [ ] `dep` — x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, active, { fix: true })
    expect(r.fullyUnblocked).toBe(true)
  })

  test('check mode never writes', () => {
    const text = '## Blocked by\n\n- [ ] `dep` - x\n\n## Soft-blocked by\n\nNone.\n'
    const r = syncBlockers(text, archived, active, { fix: false })
    expect(r.output).toBe(text)
    expect(r.changed).toBe(false)
    expect(r.findings.some((f) => f.class === 'STALE')).toBe(true)
  })
})
