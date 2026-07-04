import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { run as initRun } from '../../../src/commands/init.ts'
import { capture, cleanup, ctx, makeRepo } from './helpers.ts'

function runInit(dir: string, args: string[]): { code: number; out: string; err: string } {
  return capture(() => initRun(ctx(dir, args)) as number)
}

describe('cospec init (DESIGN §2.1)', () => {
  let dir: string
  beforeEach(() => {
    dir = makeRepo()
  })
  afterEach(() => {
    cleanup(dir)
  })

  test('state A (fresh): scaffolds openspec, config schema:feat, and gate on by default', () => {
    const { code } = runInit(dir, ['--harness', 'claude', '--yes'])
    expect(code).toBe(0)
    expect(existsSync(join(dir, 'openspec/changes/archive'))).toBe(true)
    expect(existsSync(join(dir, 'openspec/specs'))).toBe(true)
    const config = readFileSync(join(dir, 'openspec/config.yaml'), 'utf8')
    expect(config).toContain('schema: feat')
    expect(config).not.toContain('defaultSchema')
    // gate defaults on for fresh repos
    expect(existsSync(join(dir, 'hk.pkl'))).toBe(true)
    expect(existsSync(join(dir, 'commitlint.config.mjs'))).toBe(true)
    expect(existsSync(join(dir, 'mise.toml'))).toBe(true)
  })

  test('state B (package.json, no openspec): gate off by default', () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}\n')
    const { code } = runInit(dir, ['--harness', 'none'])
    expect(code).toBe(0)
    expect(existsSync(join(dir, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
    expect(existsSync(join(dir, 'hk.pkl'))).toBe(false)
  })

  test('state B with --gate: writes absent gate files but never overwrites an existing one', () => {
    writeFileSync(join(dir, 'package.json'), '{"name":"x"}\n')
    writeFileSync(join(dir, 'hk.pkl'), 'MY OWN HK\n')
    const { code, out } = runInit(dir, ['--harness', 'none', '--gate'])
    expect(code).toBe(0)
    // Existing hk.pkl untouched; snippet printed instead.
    expect(readFileSync(join(dir, 'hk.pkl'), 'utf8')).toBe('MY OWN HK\n')
    expect(out).toContain('hk.pkl already exists')
    // Absent gate files are written.
    expect(existsSync(join(dir, 'commitlint.config.mjs'))).toBe(true)
  })

  test('config.yaml is written only when absent (never modified)', () => {
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec/config.yaml'), 'schema: custom-thing\n')
    runInit(dir, ['--harness', 'none'])
    expect(readFileSync(join(dir, 'openspec/config.yaml'), 'utf8')).toBe('schema: custom-thing\n')
  })

  test('claude harness additively merges the permission into settings.json', () => {
    mkdirSync(join(dir, '.claude'), { recursive: true })
    writeFileSync(
      join(dir, '.claude/settings.json'),
      JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }, null, 2),
    )
    runInit(dir, ['--harness', 'claude', '--yes'])
    const settings = JSON.parse(readFileSync(join(dir, '.claude/settings.json'), 'utf8')) as {
      permissions: { allow: string[] }
    }
    expect(settings.permissions.allow).toContain('Bash(ls)')
    expect(settings.permissions.allow).toContain('Bash(cospec *)')
  })

  test('invalid --harness exits 1 with the valid-values message', () => {
    const { code, err } = runInit(dir, ['--harness', 'bogus'])
    expect(code).toBe(1)
    expect(err).toContain('invalid --harness')
  })

  test('state B/C with no harness and no flag exits 1', () => {
    writeFileSync(join(dir, 'package.json'), '{}')
    const { code, err } = runInit(dir, [])
    expect(code).toBe(1)
    expect(err).toContain('no harness detected')
  })

  test('opsx files are listed but not removed without --remove-opsx', () => {
    plantOpsx(dir)
    const { out } = runInit(dir, ['--harness', 'claude'])
    expect(out).toContain('leftover openspec (opsx)')
    expect(existsSync(join(dir, '.claude/skills/openspec-apply-change/SKILL.md'))).toBe(true)
  })

  test('--remove-opsx deletes provably openspec-generated files and prunes empty dirs', () => {
    plantOpsx(dir)
    const { out } = runInit(dir, ['--harness', 'claude', '--remove-opsx'])
    expect(out).toContain('Removed')
    expect(existsSync(join(dir, '.claude/skills/openspec-apply-change/SKILL.md'))).toBe(false)
    expect(existsSync(join(dir, '.claude/skills/openspec-apply-change'))).toBe(false)
    // cospec's own files survive.
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
  })

  test('user-authored path-matching files are never removed (provenance-only)', () => {
    // Plant files whose only "opsx-ness" is the path/name convention, with no
    // openspec provenance frontmatter — a user's personal notes (finding repro).
    const cmdDir = join(dir, '.opencode/commands/opsx')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(
      join(cmdDir, 'mynotes.md'),
      '# my personal opsx notes\n\nnot generated by anyone\n',
    )
    writeFileSync(
      join(dir, '.opencode/opsx-helper.md'),
      '---\nname: My Helper\n---\nplain content\n',
    )
    // A genuine opsx command file (name: 'OPSX: …') must still be detected/removed.
    const realDir = join(dir, '.claude/commands/opsx')
    mkdirSync(realDir, { recursive: true })
    writeFileSync(
      join(realDir, 'apply.md'),
      "---\nname: 'OPSX: Apply'\n---\nreal openspec command\n",
    )

    const { out } = capture(
      () => initRun(ctx(dir, ['--harness', 'opencode', '--remove-opsx', '--yes'], true)) as number,
    )
    const json = JSON.parse(out) as { opsx: { found: string[]; removed: boolean } }
    // User files survive and were never even reported.
    expect(existsSync(join(cmdDir, 'mynotes.md'))).toBe(true)
    expect(existsSync(join(dir, '.opencode/opsx-helper.md'))).toBe(true)
    expect(json.opsx.found).not.toContain('.opencode/commands/opsx/mynotes.md')
    expect(json.opsx.found).not.toContain('.opencode/opsx-helper.md')
    // The genuine opsx command file was removed.
    expect(json.opsx.found).toContain('.claude/commands/opsx/apply.md')
    expect(existsSync(join(realDir, 'apply.md'))).toBe(false)
  })

  test('a bare `init --yes` (no --remove-opsx) never deletes unmarked user files', () => {
    const cmdDir = join(dir, '.opencode/commands/opsx')
    mkdirSync(cmdDir, { recursive: true })
    writeFileSync(join(cmdDir, 'mynotes.md'), '# personal notes, no provenance\n')
    runInit(dir, ['--harness', 'opencode', '--yes'])
    expect(existsSync(join(cmdDir, 'mynotes.md'))).toBe(true)
  })

  test('a second init leaves the tree unchanged (idempotent)', () => {
    runInit(dir, ['--harness', 'claude', '--yes'])
    const { code, out } = capture(
      () => initRun(ctx(dir, ['--harness', 'claude', '--yes'], true)) as number,
    )
    expect(code).toBe(0)
    const json = JSON.parse(out) as { files: { outcome: string }[] }
    expect(json.files.every((f) => f.outcome === 'unchanged')).toBe(true)
  })

  test('--json reports state, harnesses, and per-file outcomes', () => {
    const { out } = capture(
      () => initRun(ctx(dir, ['--harness', 'claude,codex', '--yes'], true)) as number,
    )
    const json = JSON.parse(out) as {
      state: string
      harnesses: string[]
      config: { written: boolean }
    }
    expect(json.state).toBe('A')
    expect(json.harnesses).toEqual(['claude', 'codex'])
    expect(json.config.written).toBe(true)
  })
})

function plantOpsx(dir: string): void {
  const skill = join(dir, '.claude/skills/openspec-apply-change')
  mkdirSync(skill, { recursive: true })
  writeFileSync(
    join(skill, 'SKILL.md'),
    '---\nname: openspec-apply-change\nmetadata:\n  author: openspec\n  generatedBy: "1.3.1"\n---\nbody\n',
  )
}
