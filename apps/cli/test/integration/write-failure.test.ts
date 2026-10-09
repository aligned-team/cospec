// Verification 6.1: a locked harness directory fails alone, through the real CLI.

import { afterAll, expect, test } from 'bun:test'
import { chmodSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

test('init writes claude, fails cursor with exit 1, and update retries it with exit 0', async () => {
  const env = oracleEnv(mkTempRepo())
  const dir = mkTempRepo({ git: true })
  mkdirSync(join(dir, '.cursor'))
  chmodSync(join(dir, '.cursor'), 0)
  try {
    const init = await cospec(['init', '--harness', 'claude,cursor', '--json'], { cwd: dir, env })
    expect(init.exitCode).toBe(1)
    const doc = JSON.parse(init.stdout) as { failed: { path: string; error: string }[] }
    expect(doc.failed.length).toBeGreaterThan(0)
    for (const f of doc.failed) {
      expect(f.path.startsWith('.cursor/')).toBe(true)
      expect(f.error.startsWith('EACCES:')).toBe(true)
    }
    expect(existsSync(join(dir, '.claude/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.claude/commands/cospec/propose.md'))).toBe(true)

    chmodSync(join(dir, '.cursor'), 0o755)
    const update = await cospec(['update'], { cwd: dir, env })
    expect(update.exitCode).toBe(0)
    expect(existsSync(join(dir, '.cursor/skills/cospec-propose/SKILL.md'))).toBe(true)
    expect(existsSync(join(dir, '.cursor/commands/cospec-propose.md'))).toBe(true)
  } finally {
    chmodSync(join(dir, '.cursor'), 0o755)
  }
})
