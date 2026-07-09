// `cospec doctor`'s delegated openspec relationship/store-health section
// (WI-8). Proves the additive behavior end to end via the real CLI + real
// bundled openspec binary: a store-backed root folds `openspec doctor --json`
// and `openspec store doctor --json` facts in (store metadata + git facts),
// and a `references:` pointer to an unregistered store surfaces openspec's own
// `reference_unresolved` diagnostic — all read-only, none of it repaired.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface Finding {
  level: string
  check: string
  message: string
}

interface DoctorJson {
  findings: Finding[]
  summary: { errors: number; warnings: number; infos: number }
}

const STORE_ID = 'doctor-probe-store'

describe('cospec doctor — delegated openspec relationship health (WI-8)', () => {
  test('a store-backed root reports store metadata + git facts', async () => {
    const workspace = mkTempRepo() // no openspec/ of its own — the cross-repo case
    const storeDir = join(workspace, 'store')
    const xdg = join(workspace, 'xdg')
    const env = { XDG_DATA_HOME: xdg, XDG_CONFIG_HOME: join(workspace, 'xdg-config') }

    mkdirSync(join(storeDir, '.openspec-store'), { recursive: true })
    writeFileSync(join(storeDir, '.openspec-store', 'store.yaml'), `version: 1\nid: ${STORE_ID}\n`)
    mkdirSync(join(storeDir, 'openspec', 'changes', 'archive'), { recursive: true })
    mkdirSync(join(storeDir, 'openspec', 'specs'), { recursive: true })
    writeFileSync(join(storeDir, 'openspec', 'config.yaml'), 'schema: feat\n')
    mkdirSync(join(xdg, 'openspec', 'stores'), { recursive: true })
    writeFileSync(
      join(xdg, 'openspec', 'stores', 'registry.yaml'),
      `version: 1\nstores:\n  ${STORE_ID}:\n    backend:\n      type: git\n      local_path: ${storeDir}\n`,
    )

    const res = await cospec(['doctor', '--store', STORE_ID, '--json'], { cwd: workspace, env })
    const parsed = JSON.parse(res.stdout) as DoctorJson

    // No local `openspec/` at the invocation cwd -> the local "initialized"
    // ERROR still fires (it is about the invocation cwd, not the store), but
    // the delegated section must still have run and surfaced store facts.
    expect(parsed.findings.some((f) => f.check === 'initialized')).toBe(true)
    expect(parsed.findings.some((f) => f.check === 'openspec-root')).toBe(true)
    expect(parsed.findings.some((f) => f.check === 'store-git')).toBe(true)
    const gitFinding = parsed.findings.find((f) => f.check === 'store-git')
    expect(gitFinding?.message).toContain(STORE_ID)
  }, 30_000)

  test("a broken `references:` pointer surfaces openspec's reference diagnostic", async () => {
    const dir = mkTempRepo()
    mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
    mkdirSync(join(dir, 'openspec', 'specs'), { recursive: true })
    writeFileSync(
      join(dir, 'openspec', 'config.yaml'),
      'schema: feat\nreferences:\n  - id: nonexistent-store\n',
    )
    const xdg = join(dir, 'xdg')
    mkdirSync(join(xdg, 'openspec', 'stores'), { recursive: true })
    const env = { XDG_DATA_HOME: xdg, XDG_CONFIG_HOME: join(dir, 'xdg-config') }

    const res = await cospec(['doctor', '--json'], { cwd: dir, env })
    const parsed = JSON.parse(res.stdout) as DoctorJson

    const refFinding = parsed.findings.find((f) => f.check.startsWith('openspec-reference-'))
    expect(refFinding).toBeDefined()
    expect(refFinding?.message).toContain('nonexistent-store')
    expect(refFinding?.level).toBe('WARNING')
  }, 30_000)

  test('a local repo with no store and no references skips the delegated section entirely', async () => {
    const dir = mkTempRepo()
    mkdirSync(join(dir, 'openspec', 'changes', 'archive'), { recursive: true })
    mkdirSync(join(dir, 'openspec', 'specs'), { recursive: true })
    writeFileSync(join(dir, 'openspec', 'config.yaml'), 'schema: feat\n')
    const env = { XDG_CONFIG_HOME: join(dir, 'xdg-config') } // sandbox from the dev machine's real openspec config.json

    const res = await cospec(['doctor', '--json'], { cwd: dir, env })
    expect(existsSync(join(dir, 'openspec', 'config.yaml'))).toBe(true)
    const parsed = JSON.parse(res.stdout) as DoctorJson
    expect(
      parsed.findings.some(
        (f) => f.check === 'openspec-root' || f.check.startsWith('openspec-reference-'),
      ),
    ).toBe(false)
    expect(parsed.findings.some((f) => f.check === 'store-git')).toBe(false)
  }, 30_000)
})
