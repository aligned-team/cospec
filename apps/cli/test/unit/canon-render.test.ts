// The canon's shared fragments (canon-workflow-parity task 2.1, design D3): `{{ROOT_GUARD}}`
// is replaced by `_shared/root-guard.md` in every workflow body, ahead of the optional-workflow
// resolver, and a body that misuses a token fails the render naming its workflow.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { canonFile } from '../../src/canon/embedded.ts'
import { TYPE_TABLE } from '../../src/core/schema-compose.ts'
import {
  type RenderOptions,
  readWorkflowManifest,
  renderHarnessFiles,
} from '../../src/harness/render.ts'

const CANON = join(import.meta.dir, '../../src/canon/workflows')
const FRAGMENT_PATH = 'workflows/_shared/root-guard.md'
const TOKEN = '{{ROOT_GUARD}}'
const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** A copy of the canon workflows with `edit` applied to the named files (and the fragment). */
function canonWith(edit: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-canon-render-'))
  dirs.push(dir)
  cpSync(CANON, dir, { recursive: true })
  for (const [name, text] of Object.entries(edit)) writeFileSync(join(dir, name), text)
  return dir
}

const render = (extra: Partial<RenderOptions> = {}) =>
  renderHarnessFiles({
    harnesses: ['claude'],
    typeTable: TYPE_TABLE,
    version: 'cospec@test',
    ...extra,
  })

const fragment = () => readFileSync(canonFile(FRAGMENT_PATH), 'utf8').trim()

describe('the root-guard fragment', () => {
  test('is registered in the embedded canon and readable', () => {
    expect(fragment().length).toBeGreaterThan(0)
  })

  test('names no bare openspec command, no /cospec:<id> and no optional-workflow marker', () => {
    const text = fragment()
    // A path such as `openspec/config.yaml` is fine; `openspec <word>` is a command.
    expect(text.match(/\bopenspec\s+[a-z-]+/g)).toBeNull()
    expect(text).not.toContain('/cospec:')
    expect(text).not.toContain('[[opsx:')
  })

  test('carries the lead-in check, the carve-out, both branches and the picker', () => {
    const text = fragment()
    for (const needle of [
      'cospec list --json',
      '"root": null',
      '`Declared in`',
      '`Invalid store declaration in`',
      '**Auto-selected**',
      '**Explicit cospec request**',
      '`cospec init`',
      '`--store <id>`',
      'When a step asks you to choose among changes',
      '`lastModified`',
      '(Recommended)',
      '--sort name',
    ]) {
      expect(text).toContain(needle)
    }
  })
})

describe('fragment interpolation', () => {
  test('replaces the token with the fragment, once, in every workflow body', () => {
    const files = render().filter((f) => f.kind === 'skill')
    expect(files).toHaveLength(readWorkflowManifest().workflows.length)
    for (const f of files) {
      expect(f.body).not.toContain(TOKEN)
      expect(f.body.split(fragment()).length - 1).toBe(1)
    }
  })

  test('every canon body carries exactly one token', () => {
    for (const w of readWorkflowManifest().workflows) {
      const text = readFileSync(join(CANON, `${w.id}.md`), 'utf8')
      expect(text.split(TOKEN).length - 1).toBe(1)
    }
  })

  test('a body without the token fails the render, naming the workflow', () => {
    const apply = readFileSync(join(CANON, 'apply.md'), 'utf8').replace(TOKEN, '')
    expect(() => render({ canonDir: canonWith({ 'apply.md': apply }) })).toThrow(
      /'apply'.*ROOT_GUARD/,
    )
  })

  test('a body repeating the token fails the render, naming the workflow', () => {
    const apply = readFileSync(join(CANON, 'apply.md'), 'utf8')
    expect(() => render({ canonDir: canonWith({ 'apply.md': `${apply}\n${TOKEN}\n` }) })).toThrow(
      /'apply'.*ROOT_GUARD/,
    )
  })

  test('a body carrying an unregistered token fails the render, naming the workflow', () => {
    const verify = readFileSync(join(CANON, 'verify.md'), 'utf8')
    expect(() =>
      render({ canonDir: canonWith({ 'verify.md': `${verify}\n{{OTHER}}\n` }) }),
    ).toThrow(/'verify'.*\{\{OTHER\}\}/)
  })

  test('the type table token is not an unregistered token', () => {
    expect(() => render()).not.toThrow()
  })

  test('runs before the optional-workflow resolver', () => {
    const canonDir = canonWith({
      '_shared/root-guard.md': 'guard: [[opsx:if-workflow verify]]V[[opsx:else]]N[[opsx:end]]\n',
    })
    const apply = render({ canonDir, workflows: new Set(['apply']) }).find(
      (f) => f.workflow === 'apply' && f.kind === 'skill',
    )
    expect(apply?.body).toContain('guard: N')
    expect(apply?.body).not.toContain('[[opsx:')
  })
})
