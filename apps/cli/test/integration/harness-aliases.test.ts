// `--tools windsurf` and the unknown-tool hint (design decision 11), driven through the CLI.
// The pinned binary resolves the retired id `windsurf` to `devin` and, on an unknown value,
// points at `agents`; it does not accept `agents`'s search aliases (`universal`, ...) as
// values, so neither does cospec.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

const HINT = (spelling: string): string =>
  `Tool not listed? Use ${spelling} agents: the vendor-neutral target that writes .agents/skills/ for any assistant.`

function tree(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.name !== '.git')
    .flatMap((e) => {
      const child = rel === '' ? e.name : `${rel}/${e.name}`
      return e.isDirectory() ? tree(dir, child) : [child]
    })
    .toSorted()
}

function repo(): { dir: string; env: Record<string, string> } {
  return { dir: mkTempRepo({ git: true }), env: oracleEnv(mkTempRepo()) }
}

describe('init: the unknown-tool fallback hint', () => {
  for (const spelling of ['--tools', '--harness']) {
    test(`${spelling} universal is refused with both lines and writes nothing`, async () => {
      const r = repo()
      const run = await cospec(['init', spelling, 'universal', '--no-gate', '--yes'], {
        cwd: r.dir,
        env: r.env,
      })
      expect(run.exitCode).toBe(1)
      const lines = run.stderr.trimEnd().split('\n')
      expect(lines).toHaveLength(2)
      expect(lines[0]).toStartWith(`cospec: invalid ${spelling} 'universal'; valid values: `)
      expect(lines[1]).toBe(HINT(spelling))
      expect(tree(r.dir)).toEqual([])
    }, 60_000)
  }

  test('a list holding one unknown value names the whole list and keeps the hint', async () => {
    const r = repo()
    const run = await cospec(['init', '--tools', 'claude,nope', '--no-gate', '--yes'], {
      cwd: r.dir,
      env: r.env,
    })
    expect(run.exitCode).toBe(1)
    expect(run.stderr).toContain("invalid --tools 'claude,nope'")
    expect(run.stderr).toContain(HINT('--tools'))
    expect(tree(r.dir)).toEqual([])
  }, 60_000)
})

describe('init: the retired windsurf id', () => {
  test('--tools windsurf writes exactly what --harness devin writes', async () => {
    const a = repo()
    const b = repo()
    const viaAlias = await cospec(['init', '--tools', 'windsurf', '--no-gate', '--yes', '--json'], {
      cwd: a.dir,
      env: a.env,
    })
    const viaId = await cospec(['init', '--harness', 'devin', '--no-gate', '--yes', '--json'], {
      cwd: b.dir,
      env: b.env,
    })
    expect(viaAlias.exitCode).toBe(0)
    expect(viaId.exitCode).toBe(0)
    expect((JSON.parse(viaAlias.stdout) as { harnesses: string[] }).harnesses).toEqual(['devin'])
    const files = tree(a.dir)
    expect(files).toEqual(tree(b.dir))
    expect(files.some((f) => f.startsWith('.devin/'))).toBe(true)
    expect(files.some((f) => f.startsWith('.windsurf/'))).toBe(false)
    for (const f of files.filter((p) => p.startsWith('.devin/'))) {
      expect(readFileSync(join(a.dir, f), 'utf8')).toBe(readFileSync(join(b.dir, f), 'utf8'))
    }
  }, 120_000)

  test('windsurf and devin together select devin once, whatever the case', async () => {
    const r = repo()
    const run = await cospec(
      ['init', '--tools', ' Windsurf , devin', '--no-gate', '--yes', '--json'],
      { cwd: r.dir, env: r.env },
    )
    expect(run.exitCode).toBe(0)
    expect((JSON.parse(run.stdout) as { harnesses: string[] }).harnesses).toEqual(['devin'])
  }, 60_000)
})
