// A write failure is isolated to its file (design decision 10): a permission or path-type
// error on one generated file is recorded as `{ path, error }` and every other file of every
// selected harness is still written. `chmod` really denies here (the suite never runs as root),
// and every locked directory is made writable again before the temp repo is removed.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { run as doctorRun } from '../../../src/commands/doctor.ts'
import { run as initRun } from '../../../src/commands/init.ts'
import { generate, run as updateRun } from '../../../src/commands/update.ts'
import { readManifest } from '../../../src/core/managed-files.ts'
import { errnoShape } from '../../fixtures/errno.ts'
import { capture, captureAsync, cleanup, ctx, makeRepo } from './helpers.ts'

const CODEX_RULES = '.codex/rules/cospec.rules'

/** The paths a fresh `generate()` for `harness` writes, from a dry run in an empty repo. */
function pathsOf(harness: 'cursor' | 'codex', under: string): string[] {
  const scratch = makeRepo()
  try {
    return generate(scratch, { harnesses: [harness], dryRun: true })
      .results.map((r) => r.path)
      .filter((p) => p.startsWith(under))
      .toSorted()
  } finally {
    cleanup(scratch)
  }
}

describe('generate() isolates a per-file write failure', () => {
  let dir: string
  let locked: string[]
  const lock = (relpath: string, mode = 0): void => {
    chmodSync(join(dir, relpath), mode)
    locked.push(relpath)
  }
  beforeEach(() => {
    dir = makeRepo()
    locked = []
  })
  afterEach(() => {
    for (const relpath of locked) chmodSync(join(dir, relpath), 0o755)
    cleanup(dir)
  })

  test('a locked harness dir fails once per file while every other harness is written', () => {
    mkdirSync(join(dir, '.cursor'))
    lock('.cursor')
    const result = generate(dir, { harnesses: ['claude', 'cursor'] })

    const expected = pathsOf('cursor', '.cursor/')
    expect(expected.length).toBeGreaterThan(0)
    expect(result.failed.map((f) => f.path).toSorted()).toEqual(expected)
    for (const f of result.failed) {
      const shape = errnoShape(f.error)
      expect(shape.code).toBe('EACCES')
      expect(shape.path?.startsWith(join(dir, '.cursor'))).toBe(true)
    }
    // A file that failed is not also reported as a result.
    expect(result.results.filter((r) => r.path.startsWith('.cursor/'))).toEqual([])
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.claude/commands/cospec/propose.md'))).toBe(true)
    expect(existsSync(join(dir, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
  })

  test('a retry after the dir is writable again writes every failed file', () => {
    mkdirSync(join(dir, '.cursor'))
    lock('.cursor')
    expect(generate(dir, { harnesses: ['claude', 'cursor'] }).failed.length).toBeGreaterThan(0)
    chmodSync(join(dir, '.cursor'), 0o755)

    const retry = generate(dir, { harnesses: ['claude', 'cursor'] })
    expect(retry.failed).toEqual([])
    for (const path of pathsOf('cursor', '.cursor/')) expect(existsSync(join(dir, path))).toBe(true)
  })

  test('a file whose parent is a regular file fails with ENOTDIR', () => {
    writeFileSync(join(dir, '.cursor'), 'not a directory\n')
    const result = generate(dir, { harnesses: ['claude', 'cursor'] })
    expect(result.failed.map((f) => f.path).toSorted()).toEqual(pathsOf('cursor', '.cursor/'))
    for (const f of result.failed) expect(errnoShape(f.error).code).toBe('ENOTDIR')
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
  })

  test('a managed path that is a directory fails with EISDIR', () => {
    mkdirSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'), { recursive: true })
    const result = generate(dir, { harnesses: ['claude'] })
    expect(result.failed.map((f) => f.path)).toEqual(['.claude/skills/cospec-propose/SKILL.md'])
    expect(errnoShape(result.failed[0]!.error).code).toBe('EISDIR')
    expect(existsSync(join(dir, '.claude/skills/cospec-apply-change/SKILL.md'))).toBe(true)
  })

  test('a tracked file that failed is left out of the manifest so the next run retries', () => {
    mkdirSync(join(dir, '.codex'))
    lock('.codex')
    const result = generate(dir, { harnesses: ['claude', 'codex'] })
    expect(result.failed.map((f) => f.path)).toEqual([CODEX_RULES])
    expect(result.manifest.files[CODEX_RULES]).toBeUndefined()
    expect(readManifest(dir)?.files[CODEX_RULES]).toBeUndefined()
    chmodSync(join(dir, '.codex'), 0o755)

    const retry = generate(dir, { harnesses: ['claude', 'codex'] })
    expect(retry.failed).toEqual([])
    expect(existsSync(join(dir, CODEX_RULES))).toBe(true)
    expect(readManifest(dir)?.files[CODEX_RULES]).toBeDefined()
  })

  test('a removal that failed keeps its manifest entry so the next run removes it', () => {
    generate(dir, { harnesses: ['claude', 'codex'] })
    const tracked = readManifest(dir)?.files[CODEX_RULES]
    expect(tracked).toBeDefined()
    lock('.codex/rules', 0o555)

    const failed = generate(dir, { harnesses: ['claude'] })
    expect(failed.failed.map((f) => f.path)).toEqual([CODEX_RULES])
    expect(existsSync(join(dir, CODEX_RULES))).toBe(true)
    expect(readManifest(dir)?.files[CODEX_RULES]).toBe(tracked)
    chmodSync(join(dir, '.codex/rules'), 0o755)

    const retry = generate(dir, { harnesses: ['claude'] })
    expect(retry.failed).toEqual([])
    expect(existsSync(join(dir, CODEX_RULES))).toBe(false)
  })

  test('an errno outside the isolated set still propagates', () => {
    // A symlink that points at itself: every access to it is ELOOP.
    symlinkSync('.cursor', join(dir, '.cursor'))
    expect(() => generate(dir, { harnesses: ['claude', 'cursor'] })).toThrow(/ELOOP/)
  })
})

describe('init and update report a per-file failure', () => {
  let dir: string
  let locked: string[]
  const lock = (relpath: string, mode = 0): void => {
    chmodSync(join(dir, relpath), mode)
    locked.push(relpath)
  }
  const unlock = (relpath: string): void => chmodSync(join(dir, relpath), 0o755)
  beforeEach(() => {
    dir = makeRepo()
    locked = []
  })
  afterEach(() => {
    for (const relpath of locked) unlock(relpath)
    cleanup(dir)
  })

  interface FailedDoc {
    failed: { path: string; error: string }[]
  }

  test('init lists the failures, exits 1, and update retries them', () => {
    mkdirSync(join(dir, '.cursor'))
    lock('.cursor')
    const init = capture(
      () => initRun(ctx(dir, ['--harness', 'claude,cursor', '--yes'], true)) as number,
    )
    expect(init.code).toBe(1)
    const doc = JSON.parse(init.out) as FailedDoc
    expect(doc.failed.map((f) => f.path).toSorted()).toEqual(pathsOf('cursor', '.cursor/'))
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)

    unlock('.cursor')
    const update = capture(() => updateRun(ctx(dir, [], false, 'update')) as number)
    expect(update.code).toBe(0)
    for (const path of pathsOf('cursor', '.cursor/')) expect(existsSync(join(dir, path))).toBe(true)
  })

  test('the human receipts print a Failed: block naming each path', () => {
    mkdirSync(join(dir, '.cursor'))
    lock('.cursor')
    const init = capture(() => initRun(ctx(dir, ['--harness', 'claude,cursor', '--yes'])) as number)
    expect(init.code).toBe(1)
    expect(init.out).toContain('Failed:')
    expect(init.out).toContain('.cursor/skills/cospec-propose/SKILL.md')
    expect(init.out).toContain('EACCES')
  })

  test('update records one failed entry and still writes the other harness', () => {
    const seed = capture(
      () => initRun(ctx(dir, ['--harness', 'claude,cursor', '--yes'], true)) as number,
    )
    expect(seed.code).toBe(0)
    const stale = [
      '.claude/skills/cospec-propose/SKILL.md',
      '.cursor/skills/cospec-propose/SKILL.md',
    ]
    for (const relpath of stale) {
      const file = join(dir, relpath)
      writeFileSync(
        file,
        readFileSync(file, 'utf8').replace(/generatedBy: \S+/, 'generatedBy: 0.0.1'),
      )
    }
    lock('.cursor/skills/cospec-propose', 0o555)

    const update = capture(() => updateRun(ctx(dir, [], true, 'update')) as number)
    expect(update.code).toBe(1)
    const doc = JSON.parse(update.out) as FailedDoc
    expect(doc.failed.map((f) => f.path)).toEqual(['.cursor/skills/cospec-propose/SKILL.md'])
    expect(errnoShape(doc.failed[0]!.error).code).toBe('EACCES')
    expect(readFileSync(join(dir, stale[0]!), 'utf8')).not.toContain('generatedBy: 0.0.1')

    unlock('.cursor/skills/cospec-propose')
    const retry = capture(() => updateRun(ctx(dir, [], false, 'update')) as number)
    expect(retry.code).toBe(0)
    expect(readFileSync(join(dir, stale[1]!), 'utf8')).not.toContain('generatedBy: 0.0.1')
  })
})

describe('doctor does not hide a managed file it cannot read', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('a managed path that is a directory is an unreadable-file ERROR and exit 1', async () => {
    const seed = capture(() => initRun(ctx(dir, ['--harness', 'claude', '--yes'])) as number)
    expect(seed.code).toBe(0)
    const command = join(dir, '.claude/commands/cospec/propose.md')
    rmSync(command)
    mkdirSync(command)

    const { code, out } = await captureAsync(() => doctorRun(ctx(dir, [], true, 'doctor')))
    const findings = (
      JSON.parse(out) as { findings: { level: string; check: string; message: string }[] }
    ).findings.filter((f) => f.check === 'unreadable-file')
    expect(code).toBe(1)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.level).toBe('ERROR')
    expect(findings[0]!.message).toContain('.claude/commands/cospec/propose.md')
    expect(findings[0]!.message).toContain('EISDIR')
  })
})
