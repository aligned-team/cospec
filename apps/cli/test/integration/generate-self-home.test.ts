// `scripts/generate-self` (the body of `mise run generate` and `generate:check`) must see neither
// the machine-global config nor the home directory of whoever runs it. `update` reads and
// rewrites a home-scoped row's skills root (`minimax-code`: `<home>/.minimax/skills`), so a host
// holding cospec skills from an older version reported drift under its real home and `generate`
// rewrote them there. The scratch HOME below is that host.
import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  cleanup,
  cleanupAll,
  homeCospec,
  homeSandbox,
  mkTempRepo,
  REPO_ROOT,
} from '../fixtures/support.ts'

afterAll(cleanupAll)

const SKILLS = '.minimax/skills'

/** Every path under `dir` with its size, mtime and content hash, sorted: a canary for any write. */
function snapshot(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((entry): string[] => {
      const child = rel === '' ? entry.name : `${rel}/${entry.name}`
      if (entry.isDirectory()) return [`${child}/`, ...snapshot(dir, child)]
      const path = join(dir, child)
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex')
      return [`${child} ${statSync(path).size} ${statSync(path).mtimeMs} ${hash}`]
    })
    .toSorted()
}

describe('generate-self runs off the real home', () => {
  test('stale cospec skills and a profile-core config under HOME: no drift, HOME untouched', async () => {
    const sandbox = homeSandbox()
    const project = mkTempRepo({ git: true })
    try {
      const init = await homeCospec(
        sandbox,
        ['init', '--harness', 'minimax-code', '--no-gate', '--yes'],
        { cwd: project },
      )
      expect(init.exitCode).toBe(0)

      // An earlier cospec's install: every skill carries an older generatedBy stamp.
      const skillsRoot = join(sandbox.home, SKILLS)
      const skills = readdirSync(skillsRoot).filter((name) => name.startsWith('cospec-'))
      expect(skills).toHaveLength(12)
      for (const name of skills) {
        const file = join(skillsRoot, name, 'SKILL.md')
        writeFileSync(file, readFileSync(file, 'utf8').replace(/cospec@[\d.]+/, 'cospec@0.9.0'))
      }
      // And the host's own workflow profile, which `update` would honour from here.
      const configDir = join(sandbox.env.XDG_CONFIG_HOME!, 'openspec')
      mkdirSync(configDir, { recursive: true })
      writeFileSync(join(configDir, 'config.json'), '{"profile":"core","delivery":"both"}\n')

      const before = snapshot(sandbox.home)
      expect(existsSync(join(skillsRoot, 'cospec-explore', 'SKILL.md'))).toBe(true)

      const proc = Bun.spawn(['bash', 'scripts/generate-self', 'update', '--check'], {
        cwd: REPO_ROOT,
        env: { ...process.env, ...sandbox.env },
        stdout: 'pipe',
        stderr: 'pipe',
      })
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ])

      expect({ exitCode, out: stdout + stderr }).toMatchObject({ exitCode: 0 })
      expect(stdout).toContain('no drift')
      expect(stdout + stderr).not.toContain('.minimax')
      expect(snapshot(sandbox.home)).toEqual(before)
    } finally {
      cleanup(sandbox.root)
      cleanup(project)
    }
  }, 180_000)
})
