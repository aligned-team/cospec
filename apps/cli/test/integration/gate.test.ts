// --gate scaffolding (DESIGN §2.1 state table, §7). Fresh repos get the gate
// files written; existing repos never have their hk.pkl/mise.toml/commitlint
// config merged or overwritten — the paste-ready snippet is printed instead.

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

  test('existing repo with --gate never overwrites configs; prints snippets', async () => {
    const root = mkTempRepo({ fixture: 'plain', git: true })
    const sentinelHk = '# my own hk.pkl — do not touch\n'
    const sentinelMise = '# my own mise.toml — do not touch\n'
    const sentinelCommit = "export default { extends: ['@my/config'] }\n"
    writeFiles(root, {
      'hk.pkl': sentinelHk,
      'mise.toml': sentinelMise,
      'commitlint.config.mjs': sentinelCommit,
    })
    const res = await cospec(['init', '--harness', 'none', '--gate', '--yes'], { cwd: root })
    expect(res.exitCode).toBe(0)
    // Existing gate configs are left byte-for-byte untouched.
    expect(readFileSync(join(root, 'hk.pkl'), 'utf8')).toBe(sentinelHk)
    expect(readFileSync(join(root, 'mise.toml'), 'utf8')).toBe(sentinelMise)
    expect(readFileSync(join(root, 'commitlint.config.mjs'), 'utf8')).toBe(sentinelCommit)
    // A paste-ready snippet is surfaced instead.
    expect(res.stdout.toLowerCase()).toContain('snippet')
  })
})
