// --gate scaffolding (DESIGN §2.1 state table, §7). Fresh repos get the gate
// files written. For an existing repo, hk.pkl and commitlint.config.mjs are
// whole-file configs with no additive-merge story — they are never overwritten
// and a paste-ready snippet is printed instead. mise.toml is DIFFERENT: it is
// additively merged (the documented install flow means a mise.toml always
// pre-exists), and re-running init leaves it byte-identical (idempotent).

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

describe('gate scaffolding', () => {
  test('fresh repo (gate on by default) writes the gate files', async () => {
    const root = mkTempRepo({ fixture: 'fresh', git: true })
    const res = await cospec(['init', '--harness', 'none', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'commitlint.config.mjs'))).toBe(true)
    expect(existsSync(join(root, 'hk.pkl'))).toBe(true)
    expect(existsSync(join(root, 'mise.toml'))).toBe(true)
  })

  test('existing hk.pkl/commitlint are untouched (snippet); mise.toml is merged', async () => {
    const root = mkTempRepo({ fixture: 'plain', git: true })
    const sentinelHk = '# my own hk.pkl — do not touch\n'
    const sentinelCommit = "export default { extends: ['@my/config'] }\n"
    // The documented install-flow mise.toml: a cospec pin + experimental flag.
    const mise =
      '[settings]\nexperimental = true\n\n[tools]\n"github:aligned-team/cospec" = "0.5.0"\n'
    writeFiles(root, {
      'hk.pkl': sentinelHk,
      'mise.toml': mise,
      'commitlint.config.mjs': sentinelCommit,
    })
    const res = await cospec(['init', '--harness', 'none', '--gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // Whole-file configs are left byte-for-byte untouched; snippet surfaced.
    expect(readFileSync(join(root, 'hk.pkl'), 'utf8')).toBe(sentinelHk)
    expect(readFileSync(join(root, 'commitlint.config.mjs'), 'utf8')).toBe(sentinelCommit)
    expect(res.stdout.toLowerCase()).toContain('snippet')
    // mise.toml is additively merged: gate content added, original preserved.
    const merged = readFileSync(join(root, 'mise.toml'), 'utf8')
    expect(merged).toContain('[tools]')
    expect(merged).toContain('"github:aligned-team/cospec" = "0.5.0"')
    expect(merged).toContain('[hooks]')
    expect(merged).toContain('[tasks."cospec:apply"]')
    // No duplicate cospec pin was added.
    expect(merged).not.toContain('"npm:@aligned-team/cospec"')
    // A second init leaves mise.toml byte-identical (idempotent).
    const res2 = await cospec(['init', '--harness', 'none', '--gate', '--yes'], { cwd: root })
    expect(res2.exitCode).toBe(0)
    expect(readFileSync(join(root, 'mise.toml'), 'utf8')).toBe(merged)
  })

  test('state-C re-init with an already-adopted gate resyncs it with no --gate flag', async () => {
    // vanilla-openspec is state C (openspec/ already exists). Simulate a prior
    // `cospec init --gate` by giving it a mise.toml that already carries the
    // gate's tasks — the fix under test: a plain re-init must resync it.
    const root = mkTempRepo({ fixture: 'vanilla-openspec', git: true })
    const mise =
      '[tools]\n"npm:@aligned-team/cospec" = "0.5.1"\n\n[tasks."cospec:apply"]\nrun = "cospec apply"\n'
    writeFiles(root, { 'mise.toml': mise })
    const res = await cospec(['init', '--harness', 'none', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    expect(existsSync(join(root, 'hk.pkl'))).toBe(true)
    expect(existsSync(join(root, 'commitlint.config.mjs'))).toBe(true)
    const merged = readFileSync(join(root, 'mise.toml'), 'utf8')
    expect(merged).toContain('[tasks."cospec:apply"]')
    expect(merged).toContain('[tasks."cospec:validate"]')

    // A second re-init (still no --gate) is idempotent: no diff.
    const res2 = await cospec(['init', '--harness', 'none', '--yes'], { cwd: root })
    expect(res2.exitCode).toBe(0)
    expect(readFileSync(join(root, 'mise.toml'), 'utf8')).toBe(merged)
  })
})
