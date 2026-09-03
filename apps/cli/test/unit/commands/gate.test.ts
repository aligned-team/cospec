import { afterAll, describe, expect, test } from 'bun:test'
import { rmSync } from 'node:fs'

import {
  archiveMap,
  artifactDone,
  closest,
  computeGate,
  hasSpecFiles,
  missingArtifacts,
} from '../../../src/commands/apply.ts'
import { parseBlockers } from '../../../src/core/blockers.ts'
import { makeRepo, writeArchived, writeChange } from './helpers.ts'

const roots: string[] = []
function repo(schema?: string): string {
  const dir = makeRepo(schema)
  roots.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

function blockers(blocked: string, soft = 'None.'): ReturnType<typeof parseBlockers> {
  return parseBlockers(`## Blocked by\n\n${blocked}\n\n## Soft-blocked by\n\n${soft}\n`)
}

describe('computeGate', () => {
  test('clear when both sections are None.', () => {
    const gate = computeGate(blockers('None.'), new Map(), new Set())
    expect(gate.state).toBe('clear')
    expect(gate.hard).toHaveLength(0)
  })

  test('blocked on an unchecked hard entry not yet archived', () => {
    const gate = computeGate(blockers('- [ ] `dep` — needs it'), new Map(), new Set(['dep']))
    expect(gate.state).toBe('blocked')
    expect(gate.hard[0]).toEqual({ slug: 'dep', description: 'needs it', active: true })
  })

  test('archived hard entry is treated as satisfied (self-heal handles the box)', () => {
    const gate = computeGate(
      blockers('- [ ] `dep` — needs it'),
      new Map([['dep', '2026-07-01']]),
      new Set(),
    )
    expect(gate.state).toBe('clear')
  })

  test('soft-blocked only when no hard blockers remain', () => {
    const gate = computeGate(blockers('None.', '- [ ] `nice` — degrades'), new Map(), new Set())
    expect(gate.state).toBe('soft-blocked')
    expect(gate.soft).toHaveLength(1)
  })

  test('hard blockers take precedence over soft', () => {
    const gate = computeGate(
      blockers('- [ ] `hard` — must', '- [ ] `soft` — nice'),
      new Map(),
      new Set(),
    )
    expect(gate.state).toBe('blocked')
  })

  test('checked entries never block', () => {
    const gate = computeGate(blockers('- [x] `dep` — done'), new Map(), new Set())
    expect(gate.state).toBe('clear')
  })
})

describe('artifact presence', () => {
  test('artifactDone reflects file existence; specs is glob-based', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'feat', {
      'proposal.md': 'x',
      'specs/widgets/spec.md': 'y',
    })
    expect(artifactDone(dir, 'proposal')).toBe(true)
    expect(artifactDone(dir, 'blocking-changes')).toBe(false)
    expect(artifactDone(dir, 'specs')).toBe(true)
    expect(hasSpecFiles(dir)).toBe(true)
  })

  test('missingArtifacts lists only the absent required ids', () => {
    const cwd = repo()
    const dir = writeChange(cwd, 'c', 'ci', { 'proposal.md': 'x', 'tasks.md': 'y' })
    expect(missingArtifacts(dir, ['proposal', 'blocking-changes', 'tasks'])).toEqual([
      'blocking-changes',
    ])
  })

  describe('missingArtifacts skipSpecs precedence (DESIGN §5, OpenSpec 1.7 parity)', () => {
    test('specs missing and skipSpecs false (structural default): specs is missing', () => {
      const cwd = repo()
      const dir = writeChange(cwd, 'c', 'feat', { 'proposal.md': 'x' })
      expect(missingArtifacts(dir, ['proposal', 'specs'], false)).toEqual(['specs'])
    })

    test('specs missing and skipSpecs true: specs is satisfied regardless of file presence', () => {
      const cwd = repo()
      const dir = writeChange(cwd, 'c', 'feat', { 'proposal.md': 'x' })
      expect(missingArtifacts(dir, ['proposal', 'specs'], true)).toEqual([])
    })

    test('skipSpecs never affects any other artifact id', () => {
      const cwd = repo()
      const dir = writeChange(cwd, 'c', 'feat', { 'specs/widgets/spec.md': 'y' })
      expect(missingArtifacts(dir, ['proposal', 'specs'], true)).toEqual(['proposal'])
    })

    test('specs already present: skipSpecs is a no-op (specs is done either way)', () => {
      const cwd = repo()
      const dir = writeChange(cwd, 'c', 'feat', { 'specs/widgets/spec.md': 'y' })
      expect(missingArtifacts(dir, ['specs'], true)).toEqual([])
      expect(missingArtifacts(dir, ['specs'], false)).toEqual([])
    })
  })
})

describe('archiveMap', () => {
  test('maps slug → latest archived date', () => {
    const cwd = repo()
    writeArchived(cwd, '2026-06-01-old')
    writeArchived(cwd, '2026-07-02-newer')
    const map = archiveMap(cwd)
    expect(map.get('old')).toBe('2026-06-01')
    expect(map.get('newer')).toBe('2026-07-02')
  })
})

describe('closest', () => {
  test('suggests within edit distance 3', () => {
    expect(closest('appply', ['apply', 'archive', 'status'])).toBe('apply')
    expect(closest('zzzzzzzz', ['apply', 'archive'])).toBeUndefined()
  })
})
