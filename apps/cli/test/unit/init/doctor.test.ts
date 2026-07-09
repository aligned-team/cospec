import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { run as doctorRun } from '../../../src/commands/doctor.ts'
import { run as initRun } from '../../../src/commands/init.ts'
import { capture, captureAsync, cleanup, ctx, makeRepo } from './helpers.ts'

function seed(dir: string): void {
  capture(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])) as number)
}

async function doctorJson(
  dir: string,
): Promise<{ code: number; findings: { level: string; check: string }[] }> {
  const { code, out } = await captureAsync(() => doctorRun(ctx(dir, [], true)))
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

  test('a clean freshly-initialized repo passes (exit 0, no errors)', async () => {
    seed(dir)
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.filter((f) => f.level === 'ERROR')).toEqual([])
  })

  test('uninitialized repo reports an ERROR and exits 1', async () => {
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'initialized')).toBe(true)
  })

  test('missing manifest is an ERROR', async () => {
    seed(dir)
    rmSync(join(dir, 'openspec/.cospec-manifest.json'))
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'manifest' && f.level === 'ERROR')).toBe(true)
  })

  test('a missing managed schema file is a schema-missing ERROR', async () => {
    seed(dir)
    rmSync(join(dir, 'openspec/schemas/ci/schema.yaml'))
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'schema-missing')).toBe(true)
  })

  test('a dangling /cospec: reference in a harness body is an ERROR', async () => {
    seed(dir)
    mkdirSync(join(dir, '.claude/skills/cospec-rogue'), { recursive: true })
    writeFileSync(
      join(dir, '.claude/skills/cospec-rogue/SKILL.md'),
      '---\nname: rogue\n---\nRun /cospec:teleport to win.\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'dangling-ref')).toBe(true)
  })

  test('a non-cospec config schema is reported as INFO (not an error)', async () => {
    seed(dir)
    writeFileSync(join(dir, 'openspec/config.yaml'), 'schema: my-fork\n')
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'config' && f.level === 'INFO')).toBe(true)
  })

  test('a leftover opsx file is a WARNING', async () => {
    seed(dir)
    const skill = join(dir, '.claude/skills/openspec-apply-change')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: openspec-apply-change\nmetadata:\n  author: openspec\n  generatedBy: "1.5.0"\n---\nbody\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(0)
    expect(findings.some((f) => f.check === 'opsx-leftover' && f.level === 'WARNING')).toBe(true)
  })

  test('a user-authored path-matching file is NOT flagged as opsx (provenance-only)', async () => {
    seed(dir)
    const cmdDir = join(dir, '.opencode/commands/opsx')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(join(cmdDir, 'mynotes.md'), '# my notes, no openspec provenance\n')
    writeFileSync(join(dir, '.opencode/opsx-helper.md'), '---\nname: My Helper\n---\nplain\n')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'opsx-leftover')).toBe(false)
  })

  test('an unreconciled .cospec-new sidecar is a WARNING', async () => {
    seed(dir)
    writeFileSync(join(dir, 'openspec/schemas/ci/schema.yaml.cospec-new'), 'x\n')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'stale-sidecar')).toBe(true)
  })

  test('a change on a forked (legacy) schema resolves as change-schema INFO, not WARNING/ERROR', async () => {
    seed(dir)
    mkdirSync(join(dir, 'openspec/schemas/my-fork'), { recursive: true })
    writeFileSync(join(dir, 'openspec/schemas/my-fork/schema.yaml'), 'name: my-fork\nversion: 1\n')
    mkdirSync(join(dir, 'openspec/changes/forked-change'), { recursive: true })
    writeFileSync(join(dir, 'openspec/changes/forked-change/.openspec.yaml'), 'schema: my-fork\n')
    const { findings } = await doctorJson(dir)
    const changeSchema = (
      findings as unknown as { level: string; check: string; message: string }[]
    ).filter((f) => f.check === 'change-schema')
    expect(changeSchema).toHaveLength(1)
    expect(changeSchema[0]?.level).toBe('INFO')
    expect(changeSchema[0]?.message).toMatch(/legacy schema 'my-fork'/)
  })
})
