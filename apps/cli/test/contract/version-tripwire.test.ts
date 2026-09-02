// Version tripwire (DESIGN §8.2, risk #3). cospec accepts a semver RANGE at
// runtime (>=1.0.0 <2.0.0) but pins ONE exact dev/CI build (PINNED_OPENSPEC_VERSION)
// that the contract suite is probed against. Three things must stay coherent: the
// package.json dependency pin, the exact pin the live binary reports, and the
// range the runtime enforces. A dependency bump breaks THIS file first, pointing
// the upgrader at the contract suite and the design doc before anything else
// surfaces. The range assertions below pin the semantics: in-range passes,
// below-floor and 2.x are refused.

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import pkg from '../../package.json'
import {
  checkVersion,
  OPENSPEC_VERSION_CEILING,
  OPENSPEC_VERSION_FLOOR,
  openspecPackageDir,
  PINNED_OPENSPEC_VERSION,
  satisfiesOpenspecRange,
  WRAPPED_ENV,
} from '../../src/core/openspec.ts'
import { openspec, REPO_ROOT } from '../fixtures/support.ts'

/** Concatenated JS the pinned openspec package actually ships. */
function shippedSource(): string {
  const chunks: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.js')) chunks.push(readFileSync(full, 'utf8'))
    }
  }
  walk(join(openspecPackageDir(), 'dist'))
  return chunks.join('\n')
}

describe('openspec version tripwire', () => {
  test('the package.json dependency pin equals the exact PINNED_OPENSPEC_VERSION', () => {
    const pin = (pkg.dependencies as Record<string, string>)['@fission-ai/openspec']
    expect(pin).toBe(PINNED_OPENSPEC_VERSION)
  })

  test('the pin is an exact version (no range operators)', () => {
    const raw = readFileSync(`${REPO_ROOT}/apps/cli/package.json`, 'utf8')
    const pin = (JSON.parse(raw) as { dependencies: Record<string, string> }).dependencies[
      '@fission-ai/openspec'
    ]
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/)
  })

  test('the mise.toml dev/probe pin equals the same exact PINNED_OPENSPEC_VERSION', () => {
    const raw = readFileSync(`${REPO_ROOT}/mise.toml`, 'utf8')
    const match = /"npm:@fission-ai\/openspec"\s*=\s*"([^"]+)"/.exec(raw)
    expect(match?.[1]).toBe(PINNED_OPENSPEC_VERSION)
  })

  test('the mise.lock entry pins the same exact version as mise.toml', () => {
    // mise.toml and mise.lock disagreeing means CI resolves a different build
    // from the one this suite probes. The npm backend records only a version
    // (no per-platform rows), so this single entry is the whole lock surface.
    const raw = readFileSync(`${REPO_ROOT}/mise.lock`, 'utf8')
    const match = /\[\[tools\."npm:@fission-ai\/openspec"\]\]\nversion = "([^"]+)"/.exec(raw)
    expect(match?.[1]).toBe(PINNED_OPENSPEC_VERSION)
  })

  test('the exact pin itself satisfies the accepted runtime range', () => {
    expect(satisfiesOpenspecRange(PINNED_OPENSPEC_VERSION)).toBe(true)
  })

  test('the live bundled binary reports the exact pin and satisfies the range', async () => {
    const res = await openspec(['--version'], REPO_ROOT)
    expect(res.exitCode).toBe(0)
    const version = res.stdout.trim()
    expect(version).toBe(PINNED_OPENSPEC_VERSION)
    expect(satisfiesOpenspecRange(version)).toBe(true)
    expect(() => checkVersion(version, false)).not.toThrow()
  })

  test('the pinned binary still reads the env gates cospec forces on every spawn', () => {
    // cospec suppresses openspec's first-run notices by environment, not by
    // writing openspec's global config. That only works while these exact env
    // keys remain the gates upstream reads: OPENSPEC_TELEMETRY silences the
    // stdout telemetry notice AND openspec's per-command update check, and
    // OPENSPEC_NO_COMPLETIONS (added 1.10.0) silences the stderr completion tip
    // that `runPassthrough` would otherwise relay verbatim to a cospec user.
    // A rename upstream fails here rather than leaking a notice into output.
    const src = shippedSource()
    expect(src).toContain('OPENSPEC_TELEMETRY')
    expect(src).toContain('OPENSPEC_NO_COMPLETIONS')
    expect(Object.keys(WRAPPED_ENV)).toEqual(
      expect.arrayContaining(['OPENSPEC_TELEMETRY', 'OPENSPEC_NO_COMPLETIONS']),
    )
  })

  test('the runtime range refuses below the floor and at the 2.x ceiling', () => {
    // Floor is inclusive; the last 0.x release below it is refused.
    expect(satisfiesOpenspecRange(OPENSPEC_VERSION_FLOOR)).toBe(true)
    expect(satisfiesOpenspecRange('0.23.0')).toBe(false)
    // Ceiling is exclusive: the next major is refused.
    expect(satisfiesOpenspecRange(OPENSPEC_VERSION_CEILING)).toBe(false)
    expect(() => checkVersion('2.0.0', false)).toThrow(/expected a version satisfying/)
  })
})
