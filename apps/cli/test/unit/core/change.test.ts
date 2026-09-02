import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  COSPEC_TYPES,
  isCospecType,
  listChanges,
  readArchiveIndex,
  readOpenspecYaml,
  resolveChange,
  resolveSchema,
} from '../../../src/core/change.ts'

const roots: string[] = []

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-change-'))
  roots.push(dir)
  mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
  return dir
}

function makeChange(cwd: string, id: string, yaml: string | null): void {
  const dir = join(cwd, 'openspec', 'changes', id)
  mkdirSync(dir, { recursive: true })
  if (yaml !== null) writeFileSync(join(dir, '.openspec.yaml'), yaml)
}

function makeArchived(cwd: string, dirName: string): void {
  mkdirSync(join(cwd, 'openspec', 'changes', 'archive', dirName), { recursive: true })
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('type table', () => {
  test('has the 11 conventional-commit types', () => {
    expect(COSPEC_TYPES).toHaveLength(11)
    expect(isCospecType('feat')).toBe(true)
    expect(isCospecType('spec-driven')).toBe(false)
  })
})

describe('readOpenspecYaml', () => {
  test('reads schema and created', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'add-widget', 'schema: feat\ncreated: 2026-07-03\n')
    const yaml = readOpenspecYaml(join(cwd, 'openspec', 'changes', 'add-widget'))
    expect(yaml).toEqual({ schema: 'feat', created: '2026-07-03' })
  })

  test('undefined when absent, unparseable, or schema missing', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'no-yaml', null)
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'no-yaml'))).toBeUndefined()
    makeChange(cwd, 'bad', ': : not yaml :\n  - [')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'bad'))).toBeUndefined()
    makeChange(cwd, 'no-schema', 'created: 2026-07-03\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'no-schema'))).toBeUndefined()
  })

  test('reads a positive-integer schemaVersion', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'v2', 'schema: feat\nschemaVersion: 2\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'v2'))?.schemaVersion).toBe(2)
  })

  test('treats a non-positive-integer schemaVersion as absent (v1 semantics)', () => {
    const cwd = makeRepo()
    // 0/negative/fractional are not stamped versions — leaving them as `undefined`
    // keeps callers on the v1 fallback instead of grandfathering everything out.
    makeChange(cwd, 'zero', 'schema: feat\nschemaVersion: 0\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'zero'))?.schemaVersion,
    ).toBeUndefined()
    makeChange(cwd, 'neg', 'schema: feat\nschemaVersion: -1\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'neg'))?.schemaVersion).toBeUndefined()
    makeChange(cwd, 'frac', 'schema: feat\nschemaVersion: 1.5\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'frac'))?.schemaVersion,
    ).toBeUndefined()
  })

  test('reads boolean skip_specs and retire_capabilities', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skip', 'schema: feat\nskip_specs: true\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'skip'))?.skipSpecs).toBe(true)
    makeChange(cwd, 'retire', 'schema: feat\nretire_capabilities: false\n')
    expect(readOpenspecYaml(join(cwd, 'openspec', 'changes', 'retire'))?.retireCapabilities).toBe(
      false,
    )
  })

  test('treats a non-boolean skip_specs / retire_capabilities as absent', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skip-bad', 'schema: feat\nskip_specs: yes\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'skip-bad'))?.skipSpecs,
    ).toBeUndefined()
    makeChange(cwd, 'retire-bad', 'schema: feat\nretire_capabilities: "true"\n')
    expect(
      readOpenspecYaml(join(cwd, 'openspec', 'changes', 'retire-bad'))?.retireCapabilities,
    ).toBeUndefined()
  })

  test('leaves skip_specs / retire_capabilities undefined when absent', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'plain', 'schema: feat\n')
    const yaml = readOpenspecYaml(join(cwd, 'openspec', 'changes', 'plain'))
    expect(yaml?.skipSpecs).toBeUndefined()
    expect(yaml?.retireCapabilities).toBeUndefined()
  })
})

describe('listChanges / resolveChange', () => {
  test('lists active changes sorted, excluding archive, and resolves by id', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'zeta', 'schema: ci\n')
    makeChange(cwd, 'alpha', 'schema: feat\n')
    makeArchived(cwd, '2026-01-01-old')
    const changes = listChanges(cwd)
    expect(changes.map((c) => c.id)).toEqual(['alpha', 'zeta'])
    expect(changes[0]!.schema).toBe('feat')
    const resolved = resolveChange(cwd, 'zeta')
    expect(resolved?.schema).toBe('ci')
    expect(resolveChange(cwd, 'missing')).toBeUndefined()
  })

  test('propagates skip_specs / retire_capabilities onto listChanges and resolveChange', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'skippable', 'schema: feat\nskip_specs: true\nretire_capabilities: true\n')
    const changes = listChanges(cwd)
    expect(changes[0]!.skipSpecs).toBe(true)
    expect(changes[0]!.retireCapabilities).toBe(true)
    const resolved = resolveChange(cwd, 'skippable')
    expect(resolved?.skipSpecs).toBe(true)
    expect(resolved?.retireCapabilities).toBe(true)
  })

  test('change with missing yaml has empty schema', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'bare', null)
    expect(resolveChange(cwd, 'bare')?.schema).toBe('')
  })

  test('rejects non-kebab ids and path traversal', () => {
    const cwd = makeRepo()
    makeChange(cwd, 'real', 'schema: feat\n')
    // `../changes/real` would join back onto an existing change dir, so the
    // guard must reject the traversal id before resolveChange touches disk.
    for (const bad of ['../changes/real', '../../etc', 'a/b', '..', 'Cap', '-lead', 'trail-', '']) {
      expect(resolveChange(cwd, bad)).toBeUndefined()
    }
    expect(resolveChange(cwd, 'real')?.schema).toBe('feat')
  })
})

describe('readArchiveIndex', () => {
  test('indexes by slug with date, warns on duplicate slug and keeps latest', () => {
    const cwd = makeRepo()
    makeArchived(cwd, '2026-01-01-add-auth')
    makeArchived(cwd, '2026-05-05-add-auth')
    makeArchived(cwd, '2026-02-02-add-widget')
    const index = readArchiveIndex(cwd)
    expect(index.bySlug.get('add-widget')?.date).toBe('2026-02-02')
    expect(index.bySlug.get('add-auth')?.date).toBe('2026-05-05')
    expect(index.warnings.some((w) => w.includes("duplicate archived slug 'add-auth'"))).toBe(true)
  })

  test('warns on and ignores non-conforming archive dirs', () => {
    const cwd = makeRepo()
    makeArchived(cwd, 'not-a-date-prefix')
    const index = readArchiveIndex(cwd)
    expect(index.entries).toHaveLength(0)
    expect(index.warnings.some((w) => w.includes('non-conforming'))).toBe(true)
  })
})

describe('resolveSchema', () => {
  test('cospec type', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'feat')
    expect(res.kind).toBe('cospec')
    expect(res.isCospecType).toBe(true)
  })

  test('legacy project schema', () => {
    const cwd = makeRepo()
    mkdirSync(join(cwd, 'openspec', 'schemas', 'atlas'), { recursive: true })
    writeFileSync(join(cwd, 'openspec', 'schemas', 'atlas', 'schema.yaml'), 'name: atlas\n')
    const res = resolveSchema(cwd, 'atlas')
    expect(res.kind).toBe('legacy')
    expect(res.source).toBe('project')
  })

  test('legacy package schema (spec-driven resolves from the bundled package)', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'spec-driven')
    expect(res.kind).toBe('legacy')
    expect(res.source).toBe('package')
  })

  test('unknown schema', () => {
    const cwd = makeRepo()
    const res = resolveSchema(cwd, 'nonexistent-schema-xyz')
    expect(res.kind).toBe('unknown')
    expect(res.isCospecType).toBe(false)
  })
})
