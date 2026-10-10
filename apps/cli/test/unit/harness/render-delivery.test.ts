// The workflow set and delivery render options (workflow-profiles task 3.4, design D5/D6):
// the emitted workflows are filtered, conditionals resolve on the raw canon body against the
// set, and each row's skills and commands follow its delivery predicates. With neither option
// set the render is unchanged (`full-set-golden.test.ts`).

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TYPE_TABLE } from '../../../src/core/schema-compose.ts'
import {
  type HarnessName,
  type RenderOptions,
  renderHarnessFiles,
} from '../../../src/harness/render.ts'

const CANON = join(import.meta.dir, '../../../src/canon/workflows')
const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/**
 * A copy of the canon workflows with `apply.md` replaced by `body`, behind the one fragment token
 * every body must carry. The fragment is stubbed to `GUARD`, so a rendered body starts with it.
 */
function canonWithApply(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-render-delivery-'))
  dirs.push(dir)
  cpSync(CANON, dir, { recursive: true })
  writeFileSync(join(dir, '_shared/root-guard.md'), 'GUARD\n')
  writeFileSync(join(dir, 'apply.md'), `{{ROOT_GUARD}}\n\n${body}`)
  return dir
}

const render = (harnesses: HarnessName[], extra: Partial<RenderOptions> = {}) =>
  renderHarnessFiles({ harnesses, typeTable: TYPE_TABLE, version: 'cospec@test', ...extra })

const kinds = (files: ReturnType<typeof render>) =>
  [...new Set(files.map((f) => `${f.harness}:${f.kind}`))].toSorted()

describe('workflow set', () => {
  test('only the named workflows are emitted', () => {
    const files = render(['claude'], { workflows: new Set(['apply', 'archive']) })
    expect([...new Set(files.map((f) => f.workflow))].toSorted()).toEqual(['apply', 'archive'])
  })

  test('a conditional resolves against the set before references are spelled', () => {
    const canonDir = canonWithApply(
      '# Apply\n\n[[opsx:if-workflow verify]]Then run /cospec:verify.[[opsx:else]][[opsx:end]]\nDone.\n',
    )
    const withVerify = render(['opencode'], {
      canonDir,
      workflows: new Set(['apply', 'verify']),
    }).find((f) => f.workflow === 'apply' && f.kind === 'skill')
    const without = render(['opencode'], {
      canonDir,
      workflows: new Set(['apply']),
    }).find((f) => f.workflow === 'apply' && f.kind === 'skill')
    expect(withVerify?.body).toBe('GUARD\n\n# Apply\n\nThen run /cospec-verify.\nDone.\n')
    expect(without?.body).toBe('GUARD\n\n# Apply\n\nDone.\n')
  })

  test('with no set, every workflow counts as installed', () => {
    const canonDir = canonWithApply('[[opsx:if-workflow verify]]yes[[opsx:else]]no[[opsx:end]]\n')
    const apply = render(['claude'], { canonDir }).find((f) => f.workflow === 'apply')
    expect(apply?.body).toBe('GUARD\n\nyes\n')
  })

  test('a malformed canon body fails before anything is emitted', () => {
    const canonDir = canonWithApply('[[opsx:if-workflow verify]]half\n')
    expect(() => render(['claude'], { canonDir })).toThrow(
      'Malformed optional-workflow conditional: markers are out of order or a block is incomplete.',
    )
  })
})

describe('delivery', () => {
  test('skills: no command files, and skill bodies name skills', () => {
    const files = render(['claude'], { delivery: 'skills' })
    expect(kinds(files)).toEqual(['claude:skill'])
    const propose = files.find((f) => f.workflow === 'propose')
    expect(propose?.body).not.toContain('/cospec:')
    expect(propose?.body).toContain('/cospec-')
  })

  test('skills: a natural-language tool with commands names skills in prose', () => {
    const files = render(['codeassistant'], { delivery: 'skills' })
    expect(kinds(files)).toEqual(['codeassistant:skill'])
    const propose = files.find((f) => f.workflow === 'propose')
    expect(propose?.body).not.toMatch(/\/cospec[:-]/)
  })

  test('both: skill bodies keep the row dialect', () => {
    const both = render(['claude'], { delivery: 'both' })
    const unset = render(['claude'])
    expect(both.map((f) => f.content)).toEqual(unset.map((f) => f.content))
  })

  test('commands: no skill files for an adapter-backed row', () => {
    expect(kinds(render(['claude'], { delivery: 'commands' }))).toEqual(['claude:command'])
  })

  test('commands: a skills-only row writes nothing', () => {
    expect(render(['kimi'], { delivery: 'commands' })).toEqual([])
  })

  test('commands: codex keeps its skills and its rules file', () => {
    expect(kinds(render(['codex'], { delivery: 'commands' }))).toEqual([
      'codex:rules',
      'codex:skill',
    ])
  })

  test('commands: a shared root is written when any row sharing it generates skills', () => {
    const files = render(['codex', 'agents'], {
      delivery: 'commands',
      skillWriters: new Set(['agents']),
    })
    expect(files.filter((f) => f.kind === 'skill')).toHaveLength(12)
  })

  test('commands: a shared root no row generates is not written', () => {
    expect(render(['agents', 'zed'], { delivery: 'commands' })).toEqual([])
  })
})

describe('write-point assertion', () => {
  test('no emitted body carries a marker', () => {
    for (const f of render(['claude', 'codex', 'opencode'])) {
      expect(f.body).not.toContain('[[opsx:')
    }
  })
})
