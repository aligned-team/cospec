import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  extractEmbeddedOpenspec,
  extractEmbeddedOpenspecInto,
} from '../../../src/core/openspec-embedded.ts'
import { PINNED_OPENSPEC_VERSION } from '../../../src/core/openspec.ts'

describe('extractEmbeddedOpenspec (memoized entry)', () => {
  // The module memoizes the extracted path per process, so this whole block
  // observes a single extraction — point XDG_CACHE_HOME at a temp dir first,
  // and restore it afterward so the mutation doesn't leak into other test
  // files sharing this process.
  const cache = mkdtempSync(join(tmpdir(), 'cospec-embed-'))
  const originalXdgCacheHome = process.env.XDG_CACHE_HOME

  beforeAll(() => {
    process.env.XDG_CACHE_HOME = cache
  })

  afterAll(() => {
    if (originalXdgCacheHome === undefined) delete process.env.XDG_CACHE_HOME
    else process.env.XDG_CACHE_HOME = originalXdgCacheHome
  })

  test('extracts into a content-addressed, version-scoped layout with a synthesized manifest', () => {
    const binPath = extractEmbeddedOpenspec(PINNED_OPENSPEC_VERSION)

    // <cache>/cospec/openspec-<version>-<hash>/vendor/bin/openspec.js
    const verDir = dirname(dirname(dirname(binPath)))
    expect(binPath).toBe(join(verDir, 'vendor', 'bin', 'openspec.js'))
    expect(verDir).toMatch(
      new RegExp(
        `${cache}/cospec/openspec-${PINNED_OPENSPEC_VERSION.replace(/\./g, '\\.')}-[0-9a-f]{16}$`,
      ),
    )
    // Bundle exists and is non-trivial (the whole openspec CLI).
    expect(statSync(binPath).size).toBeGreaterThan(100_000)

    // The synthesized manifest is 2 levels up from the bundle (satisfies the
    // bundle's runtime `../../package.json` version read) and carries the pin.
    const manifest = JSON.parse(readFileSync(join(verDir, 'package.json'), 'utf8')) as {
      name: string
      version: string
    }
    expect(manifest.name).toBe('@fission-ai/openspec')
    expect(manifest.version).toBe(PINNED_OPENSPEC_VERSION)
  })

  test('is idempotent — a second call returns the same path', () => {
    expect(extractEmbeddedOpenspec(PINNED_OPENSPEC_VERSION)).toBe(
      extractEmbeddedOpenspec(PINNED_OPENSPEC_VERSION),
    )
  })
})

describe('extractEmbeddedOpenspecInto (non-memoized primitive)', () => {
  test('re-extracts when the cached bundle is corrupt but the same byte length', () => {
    const root = mkdtempSync(join(tmpdir(), 'cospec-embed-corrupt-'))
    const binPath = extractEmbeddedOpenspecInto(root, PINNED_OPENSPEC_VERSION)
    const good = readFileSync(binPath)

    // Length-preserving corruption — the exact class the old byte-length guard
    // silently accepted.
    writeFileSync(binPath, Buffer.alloc(good.length, 0x58))
    expect(statSync(binPath).size).toBe(good.length)

    const again = extractEmbeddedOpenspecInto(root, PINNED_OPENSPEC_VERSION)
    expect(again).toBe(binPath)
    expect(readFileSync(binPath).equals(good)).toBe(true)
  })

  test('repairs a missing manifest on a warm (bin-present) cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'cospec-embed-manifest-'))
    const binPath = extractEmbeddedOpenspecInto(root, PINNED_OPENSPEC_VERSION)
    const manifestPath = join(dirname(dirname(dirname(binPath))), 'package.json')

    rmSync(manifestPath)
    expect(extractEmbeddedOpenspecInto(root, PINNED_OPENSPEC_VERSION)).toBe(binPath)

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version: string }
    expect(manifest.version).toBe(PINNED_OPENSPEC_VERSION)
  })
})
