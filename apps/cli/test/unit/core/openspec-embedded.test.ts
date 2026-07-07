import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { extractEmbeddedOpenspec } from '../../../src/core/openspec-embedded.ts'
import { PINNED_OPENSPEC_VERSION } from '../../../src/core/openspec.ts'

describe('extractEmbeddedOpenspec', () => {
  // The module memoizes the extracted path per process, so this whole suite
  // observes a single extraction — point XDG_CACHE_HOME at a temp dir first.
  const cache = mkdtempSync(join(tmpdir(), 'cospec-embed-'))
  process.env.XDG_CACHE_HOME = cache

  test('extracts the bundle into the version-scoped layout with a synthesized manifest', () => {
    const binPath = extractEmbeddedOpenspec(PINNED_OPENSPEC_VERSION)

    const verDir = join(cache, 'cospec', `openspec-${PINNED_OPENSPEC_VERSION}`)
    expect(binPath).toBe(join(verDir, 'vendor', 'bin', 'openspec.js'))
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
