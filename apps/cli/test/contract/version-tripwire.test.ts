// Version tripwire (DESIGN §8.2, risk #3). cospec accepts a semver RANGE at
// runtime (>=1.3.1 <2.0.0) but pins ONE exact dev/CI build (PINNED_OPENSPEC_VERSION)
// that the contract suite is probed against. Three things must stay coherent: the
// package.json dependency pin, the exact pin the live binary reports, and the
// range the runtime enforces. A dependency bump breaks THIS file first, pointing
// the upgrader at the contract suite and the design doc before anything else
// surfaces. The range assertions below pin the semantics: in-range passes,
// below-floor and 2.x are refused.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import pkg from '../../package.json'
import {
  checkVersion,
  OPENSPEC_VERSION_CEILING,
  OPENSPEC_VERSION_FLOOR,
  PINNED_OPENSPEC_VERSION,
  satisfiesOpenspecRange,
} from '../../src/core/openspec.ts'
import { openspec, REPO_ROOT } from '../fixtures/support.ts'

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

  test('the runtime range refuses below the floor and at the 2.x ceiling', () => {
    // Floor is inclusive; the version just below it is refused.
    expect(satisfiesOpenspecRange(OPENSPEC_VERSION_FLOOR)).toBe(true)
    expect(satisfiesOpenspecRange('1.3.0')).toBe(false)
    // Ceiling is exclusive: the next major is refused.
    expect(satisfiesOpenspecRange(OPENSPEC_VERSION_CEILING)).toBe(false)
    expect(() => checkVersion('2.0.0', false)).toThrow(/expected a version satisfying/)
  })
})
