import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { checkOpenspecVersion } from '../../../src/commands/doctor.ts'
import { PINNED_OPENSPEC_VERSION } from '../../../src/core/openspec.ts'

function projectDir(version: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-doctor-openspec-'))
  mkdirSync(join(dir, 'pkg'))
  writeFileSync(join(dir, 'pkg', 'package.json'), JSON.stringify({ version }))
  return dir
}

describe('doctor openspec resolution (embedded-openspec spec)', () => {
  let dir: string | undefined
  beforeEach(() => {
    dir = undefined
  })
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  })

  // Regression: before the fix this pushed an openspec-resolve ERROR
  // ("run `bun install`") on a healthy standalone install.
  test('embedded resolution reports the pin as INFO, never an ERROR', () => {
    const findings: Parameters<typeof checkOpenspecVersion>[0] = []
    checkOpenspecVersion(findings, {
      source: 'embedded',
      version: PINNED_OPENSPEC_VERSION,
    })
    expect(findings.filter((f) => f.level === 'ERROR')).toEqual([])
    const info = findings.find((f) => f.check === 'openspec-resolve')
    expect(info?.level).toBe('INFO')
    expect(info?.message).toContain(PINNED_OPENSPEC_VERSION)
  })

  test('in-range project copy yields no findings', () => {
    dir = projectDir(PINNED_OPENSPEC_VERSION)
    const findings: Parameters<typeof checkOpenspecVersion>[0] = []
    checkOpenspecVersion(findings, { source: 'project', packageDir: join(dir, 'pkg') })
    expect(findings).toEqual([])
  })

  test('out-of-range project copy is still an openspec-version ERROR', () => {
    dir = projectDir('0.9.0')
    const findings: Parameters<typeof checkOpenspecVersion>[0] = []
    checkOpenspecVersion(findings, { source: 'project', packageDir: join(dir, 'pkg') })
    const error = findings.find((f) => f.check === 'openspec-version')
    expect(error?.level).toBe('ERROR')
    expect(error?.message).toContain('0.9.0')
    expect(error?.remedy).toContain('re-run the contract suite')
  })
})
