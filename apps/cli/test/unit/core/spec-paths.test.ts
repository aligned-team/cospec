import { afterAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  capabilityForDeltaFile,
  discoverSpecFiles,
  isDeltaSpecFile,
} from '../../../src/core/spec-paths.ts'

const roots: string[] = []

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-spec-paths-'))
  roots.push(dir)
  return dir
}

/** Writes `<root>/<relative segments>/spec.md`. */
function writeSpec(root: string, ...segments: string[]): string {
  const dir = join(root, ...segments)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'spec.md')
  writeFileSync(file, '# Spec\n')
  return file
}

afterAll(() => {
  for (const dir of roots) {
    // A test chmods a directory to 0 to force EACCES; restore it so rm works.
    try {
      chmodSync(join(dir, 'specs', 'locked'), 0o755)
    } catch {
      // not every root has that directory
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('discoverSpecFiles', () => {
  test('finds flat and nested capabilities, sorted by id', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    writeSpec(specs, 'web')
    writeSpec(specs, 'platform', 'session-layout')
    writeSpec(specs, 'auth')

    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual([
      'auth',
      'platform/session-layout',
      'web',
    ])
  })

  test('sorts by code point, not locale', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    writeSpec(specs, 'Zeta')
    writeSpec(specs, 'alpha')

    // Code-point order puts every uppercase letter before every lowercase one;
    // localeCompare would return the opposite under most ICU locales.
    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['Zeta', 'alpha'])
  })

  test('ids are posix-separated and specFile points at the real file', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    const file = writeSpec(specs, 'platform', 'session-layout')

    expect(discoverSpecFiles(specs)).toEqual([{ id: 'platform/session-layout', specFile: file }])
  })

  test('ignores a root-level spec.md', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    mkdirSync(specs, { recursive: true })
    writeFileSync(join(specs, 'spec.md'), '# Stray\n')
    writeSpec(specs, 'web')

    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['web'])
  })

  test('skips dot-directories and non-spec.md files', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    writeSpec(specs, '.hidden')
    writeSpec(specs, 'web')
    writeFileSync(join(specs, 'web', 'notes.md'), 'not a spec\n')

    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['web'])
  })

  test('returns an empty list for a missing root', () => {
    const root = makeRoot()
    expect(discoverSpecFiles(join(root, 'specs'))).toEqual([])
  })

  test('throws a non-ENOENT read failure rather than dropping a capability', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    writeSpec(specs, 'locked')
    chmodSync(join(specs, 'locked'), 0o000)

    // Root can read anything, so the permission trap only holds for non-root.
    if (process.getuid?.() === 0) return
    expect(() => discoverSpecFiles(specs)).toThrow()
  })

  test('resolves an in-capability symlinked spec.md', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    const capability = join(specs, 'web')
    mkdirSync(capability, { recursive: true })
    writeFileSync(join(capability, 'source.md'), '# Spec\n')
    symlinkSync(join(capability, 'source.md'), join(capability, 'spec.md'))

    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['web'])
  })

  test('skips a dangling spec.md symlink', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    const capability = join(specs, 'web')
    mkdirSync(capability, { recursive: true })
    symlinkSync(join(capability, 'gone.md'), join(capability, 'spec.md'))
    writeSpec(specs, 'auth')

    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['auth'])
  })

  test('rejects a spec.md symlink escaping its capability', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    const capability = join(specs, 'web')
    mkdirSync(capability, { recursive: true })
    const outside = join(root, 'outside.md')
    writeFileSync(outside, '# Elsewhere\n')
    symlinkSync(outside, join(capability, 'spec.md'))

    expect(() => discoverSpecFiles(specs)).toThrow(/outside the allowed directory/)
  })

  test('does not follow a symlinked capability directory', () => {
    const root = makeRoot()
    const specs = join(root, 'specs')
    mkdirSync(specs, { recursive: true })
    const external = join(root, 'external-capability')
    mkdirSync(external, { recursive: true })
    writeFileSync(join(external, 'spec.md'), '# Spec\n')
    symlinkSync(external, join(specs, 'web'))
    writeSpec(specs, 'auth')

    // Faithful to upstream: readdir's Dirent is lstat-based, so a linked
    // directory is neither a directory nor a spec.md entry and is skipped.
    // Only an in-capability symlinked spec.md file is resolved.
    expect(discoverSpecFiles(specs).map((s) => s.id)).toEqual(['auth'])
  })
})

describe('capabilityForDeltaFile', () => {
  test('takes the whole capability path, not the first segment', () => {
    expect(capabilityForDeltaFile('specs/platform/session-layout/spec.md')).toBe(
      'platform/session-layout',
    )
  })

  test('a three-level nesting keeps every segment', () => {
    expect(capabilityForDeltaFile('specs/a/b/c/spec.md')).toBe('a/b/c')
  })

  test('handles the flat layout', () => {
    expect(capabilityForDeltaFile('specs/web/spec.md')).toBe('web')
  })

  // Path shape only: whether the file is a delta at all is isDeltaSpecFile's job.
  test('derives a capability from path shape regardless of file name', () => {
    expect(capabilityForDeltaFile('specs/web/extra-delta.md')).toBe('web')
  })

  test('accepts windows separators', () => {
    expect(capabilityForDeltaFile('specs\\platform\\session-layout\\spec.md')).toBe(
      'platform/session-layout',
    )
  })

  test('returns undefined for a file sitting directly in specs/', () => {
    expect(capabilityForDeltaFile('specs/spec.md')).toBeUndefined()
    expect(capabilityForDeltaFile('specs/notes.md')).toBeUndefined()
  })

  test('returns undefined outside specs/', () => {
    expect(capabilityForDeltaFile('tasks.md')).toBeUndefined()
    expect(capabilityForDeltaFile('design/specs/web/spec.md')).toBeUndefined()
  })

  test('returns undefined for a traversal segment', () => {
    expect(capabilityForDeltaFile('specs/../elsewhere/spec.md')).toBeUndefined()
  })
})

describe('isDeltaSpecFile', () => {
  test('only a file literally named spec.md is a delta', () => {
    expect(isDeltaSpecFile('specs/web/spec.md')).toBe(true)
    expect(isDeltaSpecFile('specs/platform/session-layout/spec.md')).toBe(true)
    expect(isDeltaSpecFile('spec.md')).toBe(true)
  })

  test('companion markdown beside a delta is not a delta', () => {
    // openspec's change parser never reads these, so neither may cospec:
    // parsing them fed phantom ops to both hard archive gates.
    expect(isDeltaSpecFile('specs/web/notes.md')).toBe(false)
    expect(isDeltaSpecFile('specs/web/README.md')).toBe(false)
    expect(isDeltaSpecFile('specs/web/spec-old.md')).toBe(false)
    expect(isDeltaSpecFile('specs/web/Spec.md')).toBe(false)
  })

  test('accepts windows separators', () => {
    expect(isDeltaSpecFile('specs\\web\\spec.md')).toBe(true)
    expect(isDeltaSpecFile('specs\\web\\notes.md')).toBe(false)
  })

  test('a directory named spec.md in the middle of a path is not the file', () => {
    expect(isDeltaSpecFile('specs/spec.md/notes.md')).toBe(false)
  })
})
