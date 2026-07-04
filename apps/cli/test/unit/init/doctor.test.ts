import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { run as doctorRun } from '../../../src/commands/doctor.ts'
import { run as initRun } from '../../../src/commands/init.ts'
import { capture, cleanup, ctx, makeRepo } from './helpers.ts'

function seed(dir: string): void {
  capture(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])) as number)
}

function doctorJson(dir: string): { code: number; findings: { level: string; check: string }[] } {
  const { code, out } = capture(() => doctorRun(ctx(dir, [], true)) as number)
  const parsed = JSON.parse(out) as { findings: { level: string; check: string }[] }
  return { code, findings: parsed.findings }
}

describe('cospec doctor (DESIGN §2.3)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a clean freshly-initialized repo passes (exit 0, no errors)', () => {
    seed(dir)
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.filter((f) => f.level === 'ERROR')).toEqual([])
  })

  test('uninitialized repo reports an ERROR and exits 1', () => {
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'initialized')).toBe(true)
  })

  test('missing manifest is an ERROR', () => {
    seed(dir)
    rmSync(join(dir, 'openspec/.cospec-manifest.json'))
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'manifest' && f.level === 'ERROR')).toBe(true)
  })

  test('a missing managed schema file is a schema-missing ERROR', () => {
    seed(dir)
    rmSync(join(dir, 'openspec/schemas/ci/schema.yaml'))
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'schema-missing')).toBe(true)
  })

  test('a dangling /cospec: reference in a harness body is an ERROR', () => {
    seed(dir)
    mkdirSync(join(dir, '.claude/skills/cospec-rogue'), { recursive: true })
    writeFileSync(
      join(dir, '.claude/skills/cospec-rogue/SKILL.md'),
      '---\nname: rogue\n---\nRun /cospec:teleport to win.\n',
    )
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'dangling-ref')).toBe(true)
  })

  test('a non-cospec config schema is reported as INFO (not an error)', () => {
    seed(dir)
    writeFileSync(join(dir, 'openspec/config.yaml'), 'schema: my-fork\n')
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'config' && f.level === 'INFO')).toBe(true)
  })

  test('a leftover opsx file is a WARNING', () => {
    seed(dir)
    const skill = join(dir, '.claude/skills/openspec-apply-change')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: openspec-apply-change\nmetadata:\n  author: openspec\n  generatedBy: "1.3.1"\n---\nbody\n',
    )
    const { code, findings } = doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'opsx-leftover' && f.level === 'WARNING')).toBe(true)
  })

  test('a user-authored path-matching file is NOT flagged as opsx (provenance-only)', () => {
    seed(dir)
    const cmdDir = join(dir, '.opencode/commands/opsx')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(join(cmdDir, 'mynotes.md'), '# my notes, no openspec provenance\n')
    writeFileSync(join(dir, '.opencode/opsx-helper.md'), '---\nname: My Helper\n---\nplain\n')
    const { findings } = doctorJson(dir)
    expect(findings.some((f) => f.check === 'opsx-leftover')).toBe(false)
  })

  test('an unreconciled .cospec-new sidecar is a WARNING', () => {
    seed(dir)
    writeFileSync(join(dir, 'openspec/schemas/ci/schema.yaml.cospec-new'), 'x\n')
    const { findings } = doctorJson(dir)
    expect(findings.some((f) => f.check === 'stale-sidecar')).toBe(true)
  })
})
