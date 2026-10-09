// The shared `.agents/skills` arbiter against the pinned binary's own (design decision 6): the
// same `init` sequence is run through the binary and through cospec, each in its own sandbox,
// and the writer each leaves in its ownership marker (`.openspec-target`, `.cospec-target`)
// must be the same row. The binary's `AI_TOOLS` order is the tie-break, and a configured owner
// stays the writer when a later run selects only rows beside it.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { openspecPackageDir } from '../../src/core/openspec.ts'
import { type HarnessAdapter, HARNESS_TABLE, skillsRoot } from '../../src/harness/adapters.ts'
import { SHARED_ROOT_UPSTREAM_ORDER } from '../../src/harness/shared-root.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { assertNoAncestorOpenspec, CAPTURE_GLOBAL_CONFIG } from './support/upstream-init-capture.ts'
import { oracleSpawn } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

const { AI_TOOLS } = (await import(join(openspecPackageDir(), 'dist/core/config.js'))) as {
  AI_TOOLS: { value: string; skillsDir?: string }[]
}

const MARKER_DIR = '.agents/skills'
const TABLE: readonly HarnessAdapter[] = HARNESS_TABLE

/** Runs `openspec init --tools <tools>` for each step, in order, in one project. */
async function upstreamMarker(steps: string[]): Promise<string | undefined> {
  const sandbox = mkTempRepo()
  assertNoAncestorOpenspec(sandbox)
  const project = join(sandbox, 'project')
  mkdirSync(project)
  const env = oracleEnv(sandbox)
  const configDir = join(env.XDG_CONFIG_HOME!, 'openspec')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(CAPTURE_GLOBAL_CONFIG, null, 2))
  for (const tools of steps) {
    const spawn = oracleSpawn(['--no-color', 'init', '--tools', tools], sandbox, {
      runtime: 'node',
      cwd: project,
    })
    const proc = Bun.spawn(spawn.cmd, {
      cwd: spawn.cwd,
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...spawn.env, USERPROFILE: env.HOME! },
    })
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
    if (exitCode !== 0) throw new Error(`upstream init --tools ${tools} failed: ${stderr}`)
  }
  const marker = join(project, MARKER_DIR, '.openspec-target')
  return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined
}

async function cospecMarker(steps: string[]): Promise<string | undefined> {
  const dir = mkTempRepo({ git: true })
  const env = oracleEnv(mkTempRepo())
  for (const harness of steps) {
    const run = await cospec(['init', '--harness', harness, '--no-gate'], { cwd: dir, env })
    expect(run.exitCode).toBe(0)
  }
  const marker = join(dir, MARKER_DIR, '.cospec-target')
  return existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined
}

describe('the shared-root tie-break order is the pinned AI_TOOLS order', () => {
  test('SHARED_ROOT_UPSTREAM_ORDER lists every table row on a shared root, in upstream order', () => {
    const shared = TABLE.filter((r) => r.skillsDir === '.agents').map((r) => r.id)
    const upstream = AI_TOOLS.filter((t) => t.skillsDir === '.agents').map((t) => t.value)
    expect([...SHARED_ROOT_UPSTREAM_ORDER]).toEqual(upstream)
    expect(shared.toSorted()).toEqual(upstream.toSorted())
  })

  test('no other project skills root is shared by two rows', () => {
    const byRoot = new Map<string, string[]>()
    for (const r of TABLE) {
      const { root, scope } = skillsRoot(r)
      if (scope === 'project') byRoot.set(root, [...(byRoot.get(root) ?? []), r.id])
    }
    const sharing = [...byRoot].filter(([, ids]) => ids.length > 1).map(([root]) => root)
    expect(sharing).toEqual([MARKER_DIR])
  })
})

describe('the marker after an init sequence matches the pinned binary', () => {
  const CASES: { name: string; steps: string[] }[] = [
    { name: 'agents,zed on a fresh root', steps: ['agents,zed'] },
    { name: 'agents, then zed,antigravity', steps: ['agents', 'zed,antigravity'] },
    { name: 'codex,agents, then zed', steps: ['codex,agents', 'zed'] },
    { name: 'zed, then agents', steps: ['zed', 'agents'] },
  ]
  for (const { name, steps } of CASES) {
    test(
      name,
      async () => {
        const upstream = await upstreamMarker(steps)
        expect(upstream).toBeDefined()
        expect(await cospecMarker(steps)).toBe(upstream)
      },
      120_000,
    )
  }
})
