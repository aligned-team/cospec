import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  checkVersion,
  enforceExpectation,
  EXPECTED_OPENSPEC_VERSION,
  openspecApplyInstructions,
  openspecArtifactInstructions,
  openspecList,
  openspecPackageDir,
  openspecStatus,
  OpenspecCallError,
  type OpenspecResult,
  runOpenspec,
} from '../../../src/core/openspec.ts'

function result(partial: Partial<OpenspecResult>): OpenspecResult {
  return { stdout: '', stderr: '', exitCode: 0, ...partial }
}

describe('checkVersion', () => {
  test('passes on the expected version', () => {
    expect(() => checkVersion(`${EXPECTED_OPENSPEC_VERSION}\n`, false)).not.toThrow()
  })

  test('throws the DESIGN §1 message on mismatch', () => {
    expect(() => checkVersion('1.4.0', false)).toThrow(
      /wrapped openspec is 1\.4\.0, expected 1\.3\.1 — refusing to run \(COSPEC_ALLOW_OPENSPEC_DRIFT=1 to override\)/,
    )
  })

  test('drift override skips the check', () => {
    expect(() => checkVersion('9.9.9', true)).not.toThrow()
  })
})

describe('enforceExpectation', () => {
  test('accepts an allowed exit code', () => {
    expect(() => enforceExpectation('x', result({ exitCode: 0 }), { exitCodes: [0] })).not.toThrow()
  })

  test('rejects a disallowed exit code with OpenspecCallError', () => {
    expect(() => enforceExpectation('x', result({ exitCode: 2 }), { exitCodes: [0] })).toThrow(
      OpenspecCallError,
    )
  })

  test('rejects a forbidden stdout pattern even on exit 0', () => {
    expect(() =>
      enforceExpectation('x', result({ stdout: 'Aborted. No files were changed.' }), {
        exitCodes: [0],
        denyStdout: [/\bAborted\b/],
      }),
    ).toThrow(/forbidden pattern/)
  })
})

describe('binary resolution', () => {
  test('resolves the bundled openspec package by path', () => {
    const dir = openspecPackageDir()
    expect(dir).toContain('@fission-ai')
  })
})

describe('wrapped calls against the real binary', () => {
  let cwd: string

  beforeAll(async () => {
    cwd = mkdtempSync(join(tmpdir(), 'cospec-openspec-'))
    await runOpenspec(['init', '--tools', 'none'], { cwd, expect: { exitCodes: [0] } })
    await runOpenspec(['new', 'change', 'try-it', '--description', 'try it'], {
      cwd,
      expect: { exitCodes: [0] },
    })
    const changeDir = join(cwd, 'openspec', 'changes', 'try-it')
    writeFileSync(
      join(changeDir, 'proposal.md'),
      '## Why\n\nBecause we must exercise the JSON parsers end to end here now.\n\n' +
        '## What Changes\n\n- a thing\n\n## Impact\n\n- files\n',
    )
    writeFileSync(join(changeDir, 'tasks.md'), '## 1. Group\n\n- [ ] 1.1 do\n- [x] 1.2 done\n')
    mkdirSync(join(changeDir, 'specs', 'widget'), { recursive: true })
    writeFileSync(
      join(changeDir, 'specs', 'widget', 'spec.md'),
      '## ADDED Requirements\n\n### Requirement: Widget works\nThe system SHALL widget.\n\n' +
        '#### Scenario: basic\n- **WHEN** x\n- **THEN** y\n',
    )
  })

  test('version assertion passes so wrapped calls run', async () => {
    const res = await runOpenspec(['--version'], { cwd, expect: { exitCodes: [0] } })
    expect(res.stdout.trim()).toBe(EXPECTED_OPENSPEC_VERSION)
  }, 30_000)

  test('openspecStatus returns the typed status shape', async () => {
    const status = await openspecStatus(cwd, 'try-it')
    expect(status.changeName).toBe('try-it')
    expect(status.schemaName).toBe('spec-driven')
    expect(Array.isArray(status.applyRequires)).toBe(true)
    const proposal = status.artifacts.find((a) => a.id === 'proposal')
    expect(proposal?.status).toBe('done')
  }, 30_000)

  test('openspecList returns the typed list shape', async () => {
    const list = await openspecList(cwd)
    const entry = list.changes.find((c) => c.name === 'try-it')
    expect(entry?.totalTasks).toBe(2)
    expect(entry?.completedTasks).toBe(1)
  }, 30_000)

  test('openspecApplyInstructions returns state and contextFiles', async () => {
    const apply = await openspecApplyInstructions(cwd, 'try-it')
    expect(apply.state).toBe('ready')
    expect(apply.progress).toEqual({ total: 2, complete: 1, remaining: 1 })
    expect(apply.contextFiles.proposal?.[0]).toContain('proposal.md')
  }, 30_000)

  test('openspecArtifactInstructions returns template and instruction', async () => {
    const artifact = await openspecArtifactInstructions(cwd, 'proposal', 'try-it')
    expect(artifact.artifactId).toBe('proposal')
    expect(typeof artifact.template).toBe('string')
    expect(artifact.template.length).toBeGreaterThan(0)
  }, 30_000)

  test('a disallowed exit code throws OpenspecCallError', async () => {
    await expect(openspecStatus(cwd, 'does-not-exist-change')).rejects.toBeInstanceOf(
      OpenspecCallError,
    )
  }, 30_000)
})
