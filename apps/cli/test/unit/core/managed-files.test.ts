import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  computeContentHash,
  CURRENT_GENERATED_BY,
  type ManagedFrontmatter,
  type Manifest,
  readManifest,
  removeManagedFile,
  renderManaged,
  splitFrontmatter,
  writeManaged,
  writeManagedManifestFile,
  writeManifest,
} from '../../../src/core/managed-files.ts'

const roots: string[] = []

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-managed-'))
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

const fm: ManagedFrontmatter = {
  fields: { name: 'cospec-apply-change', description: 'Implement tasks' },
  body: '\nBody line one.\nBody line two.\n',
}

describe('renderManaged / splitFrontmatter', () => {
  test('injects the provenance metadata block and round-trips', () => {
    const text = renderManaged(fm)
    const { frontmatter, body } = splitFrontmatter(text)
    expect(body).toBe(fm.body)
    const meta = (frontmatter as { metadata: Record<string, string> }).metadata
    expect(meta.author).toBe('cospec')
    expect(meta.generatedBy).toBe(CURRENT_GENERATED_BY)
    expect(meta.contentHash).toBe(computeContentHash(fm.body))
  })

  test('splitFrontmatter returns body as-is when no frontmatter', () => {
    const out = splitFrontmatter('name: x\nversion: 1\n')
    expect(out.frontmatter).toBeUndefined()
    expect(out.body).toBe('name: x\nversion: 1\n')
  })
})

describe('writeManaged (frontmatter files)', () => {
  let dir: string
  let path: string
  beforeEach(() => {
    dir = tmpRoot()
    path = join(dir, 'nested', 'SKILL.md')
  })

  test('created on first write, creating parent dirs', () => {
    const result = writeManaged(path, fm)
    expect(result.outcome).toBe('created')
    expect(existsSync(path)).toBe(true)
  })

  test('unchanged on a byte-identical second write (idempotent)', () => {
    writeManaged(path, fm)
    const before = readFileSync(path, 'utf8')
    const result = writeManaged(path, fm)
    expect(result.outcome).toBe('unchanged')
    expect(readFileSync(path, 'utf8')).toBe(before)
  })

  test('updated when the body changes but the file is unmodified', () => {
    writeManaged(path, fm)
    const result = writeManaged(path, { ...fm, body: '\nNew body.\n' })
    expect(result.outcome).toBe('updated')
    expect(readFileSync(path, 'utf8')).toContain('New body.')
  })

  test('updated when only generatedBy changes (version bump)', () => {
    writeManaged(path, fm, { generatedBy: 'cospec@0.1.0' })
    const result = writeManaged(path, fm, { generatedBy: 'cospec@0.2.0' })
    expect(result.outcome).toBe('updated')
    expect(readFileSync(path, 'utf8')).toContain('cospec@0.2.0')
  })

  test('preserved-foreign when the file is not cospec-authored', () => {
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(path, '---\nmetadata:\n  author: openspec\n---\nhand written\n')
    const result = writeManaged(path, fm)
    expect(result.outcome).toBe('preserved-foreign')
    expect(result.sidecar).toBe(`${path}.cospec-new`)
    expect(existsSync(result.sidecar!)).toBe(true)
    expect(readFileSync(path, 'utf8')).toContain('hand written')
  })

  test('preserved-modified when a managed file was user-edited', () => {
    writeManaged(path, fm)
    const edited = readFileSync(path, 'utf8').replace('Body line one.', 'Body line one EDITED.')
    writeFileSync(path, edited)
    const result = writeManaged(path, { ...fm, body: '\nRegenerated.\n' })
    expect(result.outcome).toBe('preserved-modified')
    expect(readFileSync(path, 'utf8')).toContain('EDITED')
    expect(readFileSync(result.sidecar!, 'utf8')).toContain('Regenerated.')
  })

  test('forced overwrites a user-edited managed file', () => {
    writeManaged(path, fm)
    const edited = readFileSync(path, 'utf8').replace('Body line one.', 'Body line one EDITED.')
    writeFileSync(path, edited)
    const result = writeManaged(path, { ...fm, body: '\nRegenerated.\n' }, { force: true })
    expect(result.outcome).toBe('forced')
    expect(readFileSync(path, 'utf8')).toContain('Regenerated.')
  })
})

describe('writeManagedManifestFile (schema files)', () => {
  let dir: string
  let path: string
  beforeEach(() => {
    dir = tmpRoot()
    path = join(dir, 'openspec', 'schemas', 'feat', 'schema.yaml')
  })

  test('created then unchanged with the prior hash', () => {
    const content = 'name: feat\nversion: 1\n'
    const first = writeManagedManifestFile(path, content)
    expect(first.outcome).toBe('created')
    const hash = computeContentHash(content)
    const second = writeManagedManifestFile(path, content, { priorHash: hash })
    expect(second.outcome).toBe('unchanged')
  })

  test('updated when content changes and file is unmodified', () => {
    const content = 'name: feat\nversion: 1\n'
    writeManagedManifestFile(path, content)
    const result = writeManagedManifestFile(path, 'name: feat\nversion: 2\n', {
      priorHash: computeContentHash(content),
    })
    expect(result.outcome).toBe('updated')
  })

  test('preserved-foreign when file exists but was never tracked', () => {
    mkdirSync(join(dir, 'openspec', 'schemas', 'feat'), { recursive: true })
    writeFileSync(path, 'name: other\n')
    const result = writeManagedManifestFile(path, 'name: feat\n')
    expect(result.outcome).toBe('preserved-foreign')
    expect(existsSync(result.sidecar!)).toBe(true)
    expect(readFileSync(path, 'utf8')).toBe('name: other\n')
  })

  test('preserved-modified when a tracked file was user-edited', () => {
    const content = 'name: feat\nversion: 1\n'
    writeManagedManifestFile(path, content)
    writeFileSync(path, 'name: feat\nversion: 999\n')
    const result = writeManagedManifestFile(path, 'name: feat\nversion: 2\n', {
      priorHash: computeContentHash(content),
    })
    expect(result.outcome).toBe('preserved-modified')
    expect(readFileSync(path, 'utf8')).toContain('999')
  })
})

describe('removeManagedFile', () => {
  test('removes an unmodified managed file', () => {
    const dir = tmpRoot()
    const path = join(dir, 'stale.yaml')
    const content = 'stale: true\n'
    writeFileSync(path, content)
    const result = removeManagedFile(dir, 'stale.yaml', [dir], computeContentHash(content))
    expect(result?.outcome).toBe('removed')
    expect(existsSync(path)).toBe(false)
  })

  test('preserves a user-modified file it no longer emits', () => {
    const dir = tmpRoot()
    const path = join(dir, 'stale.yaml')
    writeFileSync(path, 'stale: edited\n')
    const result = removeManagedFile(
      dir,
      'stale.yaml',
      [dir],
      computeContentHash('stale: original\n'),
    )
    expect(result?.outcome).toBe('preserved-modified')
    expect(existsSync(path)).toBe(true)
  })

  test('refuses a poisoned relpath that escapes the owned roots (no delete)', () => {
    const dir = tmpRoot()
    const owned = join(dir, 'owned')
    mkdirSync(owned, { recursive: true })
    const victim = join(dir, 'victim.txt')
    writeFileSync(victim, 'secret\n')
    // A traversal key whose hash matches the file's content still must not delete
    // it, and neither does --force.
    const hash = computeContentHash('secret\n')
    expect(removeManagedFile(owned, '../victim.txt', [owned], hash)).toBeUndefined()
    expect(removeManagedFile(owned, '../victim.txt', [owned], undefined, true)).toBeUndefined()
    expect(existsSync(victim)).toBe(true)
  })
})

describe('manifest read/write', () => {
  test('round-trips and reads undefined when absent', () => {
    const dir = tmpRoot()
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    expect(readManifest(dir)).toBeUndefined()
    const manifest: Manifest = {
      cospecVersion: '0.1.0',
      files: { 'schemas/feat/schema.yaml': computeContentHash('x') },
    }
    writeManifest(dir, manifest)
    expect(readManifest(dir)).toEqual(manifest)
  })
})
