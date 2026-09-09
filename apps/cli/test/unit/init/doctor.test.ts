import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { run as doctorRun } from '../../../src/commands/doctor.ts'
import { run as initRun } from '../../../src/commands/init.ts'
import { capture, captureAsync, cleanup, ctx, makeRepo, managedMarkdown } from './helpers.ts'

function seed(dir: string): void {
  capture(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])) as number)
}

/** Init a repo on a harness that renders into the shared `.agents/skills` root. */
function seedShared(dir: string, harness: 'codex' | 'agents'): void {
  capture(() => initRun(ctx(dir, ['--harness', harness, '--yes'])) as number)
}

interface JsonFinding {
  level: string
  check: string
  message: string
}

async function doctorJson(dir: string): Promise<{ code: number; findings: JsonFinding[] }> {
  const { code, out } = await captureAsync(() => doctorRun(ctx(dir, [], true)))
  const parsed = JSON.parse(out) as { findings: JsonFinding[] }
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

  // `generatedBy` here is an arbitrary openspec version, not cospec's pin: the
  // detector matches the SHAPE (`author: openspec` + a bare semver), and the
  // `.agents/` case below deliberately uses a different one.
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

  test('a leftover under `.agents/skills/` is a WARNING (openspec ≥1.8 Codex root)', async () => {
    seed(dir)
    const skill = join(dir, '.agents/skills/openspec-propose')
    mkdirSync(skill, { recursive: true })
    writeFileSync(
      join(skill, 'SKILL.md'),
      '---\nname: openspec-propose\nmetadata:\n  author: openspec\n  generatedBy: "1.11.0"\n---\nbody\n',
    )
    const { findings } = await doctorJson(dir)
    const opsx = findings.filter((f) => f.check === 'opsx-leftover')
    expect(opsx.some((f) => f.level === 'WARNING')).toBe(true)
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

describe('cospec doctor — the shared .agents/skills root', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  // The shared dialect emits no command files, so its bodies reference skills by
  // DIR NAME (`/cospec-apply-change`), not by workflow id (`/cospec:apply`).
  // Doctor resolves both spellings; if it did not, every generated body here
  // would be flagged.
  test('generated shared-root bodies raise no dangling-ref findings', async () => {
    seedShared(dir, 'agents')
    const { code, findings } = await doctorJson(dir)
    expect(findings.filter((f) => f.check === 'dangling-ref')).toEqual([])
    expect(code).toBe(0)
  })

  test('an unknown skill-name reference under .agents/ is a single ERROR', async () => {
    seedShared(dir, 'agents')
    mkdirSync(join(dir, '.agents/skills/cospec-rogue'), { recursive: true })
    writeFileSync(
      join(dir, '.agents/skills/cospec-rogue/SKILL.md'),
      '---\nname: rogue\n---\nRun /cospec-teleport-change to win.\n',
    )
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    const dangling = findings.filter((f) => f.check === 'dangling-ref')
    // Exactly one: `.agents` (a harness dir) and `.agents/skills` (the shared
    // opsx root) are both walked, and the overlap is deduped by relpath.
    expect(dangling).toHaveLength(1)
    expect(dangling[0]?.level).toBe('ERROR')
    expect(dangling[0]?.message).toContain('.agents/skills/cospec-rogue/SKILL.md')
  })

  test('a real workflow whose skill file is missing is still a dangling ERROR', async () => {
    seedShared(dir, 'agents')
    rmSync(join(dir, '.agents/skills/cospec-apply-change'), { recursive: true })
    const { code, findings } = await doctorJson(dir)
    expect(code).toBe(1)
    expect(findings.some((f) => f.check === 'dangling-ref' && f.message.includes('apply'))).toBe(
      true,
    )
  })

  test('a leftover .codex/skills file is a legacy-layout WARNING, not drift', async () => {
    seedShared(dir, 'codex')
    mkdirSync(join(dir, '.codex/skills/cospec-propose'), { recursive: true })
    writeFileSync(
      join(dir, '.codex/skills/cospec-propose/SKILL.md'),
      managedMarkdown('cospec-propose', 'legacy body'),
    )
    const { code, findings } = await doctorJson(dir)
    // WARNING only — doctor exits 1 on ERRORs.
    expect(code).toBe(0)
    const legacy = findings.filter((f) => f.check === 'legacy-layout')
    expect(legacy).toHaveLength(1)
    expect(legacy[0]?.level).toBe('WARNING')
    expect(legacy[0]?.message).toContain('.codex/skills/cospec-propose/SKILL.md')
    // The file is misplaced, not diverged from canon: the drift vocabulary must
    // stay out of it.
    expect(findings.some((f) => f.check === 'drift')).toBe(false)
  })

  test('no legacy-layout finding once the legacy tree is gone', async () => {
    seedShared(dir, 'codex')
    const { findings } = await doctorJson(dir)
    expect(findings.some((f) => f.check === 'legacy-layout')).toBe(false)
  })
})
