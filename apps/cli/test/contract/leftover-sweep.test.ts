// The leftover scan reads every tool's own upstream output (design decision 12, verification
// 5.3): for each row of `HARNESS_TABLE`, the pinned binary's live `init --tools <id>` output is
// planted in a repo, doctor names every file it wrote under the tool's directories as
// `opsx-leftover`, and `init --remove-opsx` deletes exactly those files and no cospec file.
// Never compared against cospec's own output; the planted tree is the binary's.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type HarnessAdapter, HARNESS_NAMES, HARNESS_TABLE } from '../../src/harness/adapters.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { assertNoAncestorOpenspec, CAPTURE_GLOBAL_CONFIG } from './support/upstream-init-capture.ts'
import { oracleSpawn } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

/** Rows whose output the scan does not yet read in full, and the task that makes it so. */
const SWEEP_PENDING = new Map<string, string>()

/** Every file under `dir` (relative, sorted), skipping `.git` and the repo's `openspec/` tree. */
function toolFiles(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => {
      const child = rel === '' ? e.name : `${rel}/${e.name}`
      if (rel === '' && (e.name === '.git' || e.name === 'openspec')) return []
      return e.isDirectory() ? toolFiles(dir, child) : [child]
    })
    .toSorted()
}

/** The pinned binary's `init --tools <id>` in its own sandbox; the project dir it wrote. */
async function upstreamProject(tool: string): Promise<{ project: string; home: string }> {
  const sandbox = mkTempRepo()
  assertNoAncestorOpenspec(sandbox)
  const project = join(sandbox, 'project')
  mkdirSync(project)
  const env = oracleEnv(sandbox)
  const configDir = join(env.XDG_CONFIG_HOME!, 'openspec')
  mkdirSync(configDir, { recursive: true })
  writeFileSync(join(configDir, 'config.json'), JSON.stringify(CAPTURE_GLOBAL_CONFIG, null, 2))
  const spawn = oracleSpawn(['--no-color', 'init', '--tools', tool], sandbox, {
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
  if (exitCode !== 0) throw new Error(`upstream init --tools ${tool} failed: ${stderr}`)
  Bun.spawnSync(['git', 'init', '-q'], { cwd: project })
  return { project, home: env.HOME! }
}

interface DoctorJson {
  findings: { check: string; message: string }[]
}

/**
 * A home-scoped row (`globalSkillsDir`) writes under the sandbox HOME, never the project, so its
 * files are named by absolute path and its cospec run shares that HOME.
 */
async function sweepRow(id: string): Promise<void> {
  const row: HarnessAdapter = HARNESS_TABLE.find((r) => r.id === id)!
  const home = row.skillsDir === undefined && row.globalSkillsDir !== undefined
  const homeDir = row.globalSkillsDir ?? ''
  const upstream = await upstreamProject(id)
  const project = upstream.project
  const env = home
    ? { ...oracleEnv(mkTempRepo()), HOME: upstream.home, USERPROFILE: upstream.home }
    : oracleEnv(mkTempRepo())
  // `wrote` is relative to the base the binary wrote under; a project file is named by its
  // relative path, a home file by its absolute one.
  const base = home ? upstream.home : project
  const wrote = home
    ? toolFiles(join(upstream.home, homeDir)).map((f) => join(homeDir, f))
    : toolFiles(project).filter((f) => !f.endsWith('/.openspec-target'))
  const shown = (rel: string): string => (home ? join(base, rel) : rel)
  expect(wrote.length).toBeGreaterThan(0)

  const doctor = await cospec(['doctor', '--json'], { cwd: project, env })
  const named = (JSON.parse(doctor.stdout) as DoctorJson).findings
    .filter((f) => f.check === 'opsx-leftover')
    .map((f) => /: (\S+) — /.exec(f.message)?.[1])
    .toSorted()
  expect(named).toEqual(wrote.map(shown).toSorted())

  const run = await cospec(['init', '--harness', id, '--no-gate', '--remove-opsx', '--json'], {
    cwd: project,
    env,
  })
  expect(run.exitCode).toBe(0)
  const doc = JSON.parse(run.stdout) as {
    opsx: {
      found: (string | { path: string; scope: string; removed: boolean })[]
      removed: boolean
    }
  }
  const found = doc.opsx.found.map((f) => (typeof f === 'string' ? f : f.path))
  expect(found.toSorted()).toEqual(wrote.map(shown).toSorted())
  for (const f of doc.opsx.found) {
    if (typeof f !== 'string')
      expect({ scope: f.scope, removed: f.removed }).toEqual({ scope: 'home', removed: true })
  }
  if (!home) expect(doc.opsx.removed).toBe(true)
  for (const rel of wrote) expect(existsSync(join(base, rel))).toBe(false)

  // What is left is cospec's own output and the shared-root marker, never a file the binary wrote.
  if (home) {
    for (const name of readdirSync(join(upstream.home, homeDir, 'skills'))) {
      expect(name.startsWith('cospec-')).toBe(true)
    }
    return
  }
  for (const rel of toolFiles(project)) {
    expect(wrote).not.toContain(rel)
    if (rel.endsWith('.md'))
      expect(readFileSync(join(project, rel), 'utf8')).not.toContain('`openspec ')
  }
}

describe("the leftover scan reads each row's upstream output", () => {
  for (const id of HARNESS_NAMES) {
    const pending = SWEEP_PENDING.get(id)
    const run = pending === undefined ? test : test.failing
    run(
      `${id}: doctor names, and --remove-opsx removes, every file the binary wrote${pending === undefined ? '' : ` (task ${pending})`}`,
      () => sweepRow(id),
      120_000,
    )
  }
})
