// Version tripwire (DESIGN §8.2, risk #3). Three sources of the openspec version
// must agree: the runtime constant, the live binary, and the package.json pin. A
// dependency bump breaks THIS file first, pointing the upgrader at the contract
// suite and the design doc before anything else surfaces.

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import pkg from '../../package.json'
import { EXPECTED_OPENSPEC_VERSION } from '../../src/core/openspec.ts'
import { openspec, REPO_ROOT } from '../fixtures/support.ts'

describe('openspec version tripwire', () => {
  test('EXPECTED_OPENSPEC_VERSION equals the package.json dependency pin', () => {
    const pin = (pkg.dependencies as Record<string, string>)['@fission-ai/openspec']
    expect(pin).toBe(EXPECTED_OPENSPEC_VERSION)
  })

  test('the live bundled binary reports EXPECTED_OPENSPEC_VERSION', async () => {
    const res = await openspec(['--version'], REPO_ROOT)
    expect(res.exitCode).toBe(0)
    expect(res.stdout.trim()).toBe(EXPECTED_OPENSPEC_VERSION)
  })

  test('the pin is an exact version (no range operators)', () => {
    const raw = readFileSync(`${REPO_ROOT}/apps/cli/package.json`, 'utf8')
    const pin = (JSON.parse(raw) as { dependencies: Record<string, string> }).dependencies[
      '@fission-ai/openspec'
    ]
    expect(pin).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
