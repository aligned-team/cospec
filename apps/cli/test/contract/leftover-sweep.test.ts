// The leftover scan reads every tool's own upstream output (design decision 12, verification
// 5.3): for each row of `HARNESS_TABLE`, the pinned binary's live `init --tools <id>` output is
// planted in a repo, doctor names every file it wrote under the tool's directories as
// `opsx-leftover`, and `init --remove-opsx` deletes exactly those files and no cospec file.
// Never compared against cospec's own output; the planted tree is the binary's.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { type HarnessAdapter, HARNESS_NAMES, HARNESS_TABLE } from '../../src/harness/adapters.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { assertNoAncestorOpenspec, CAPTURE_GLOBAL_CONFIG } from './support/upstream-init-capture.ts'
import { oracleSpawn } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

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

/**
 * The pinned binary's `init --tools <id>` in its own sandbox; the project dir it wrote. `plant`
 * is written into the project first, so the binary's legacy cleanup sees it.
 */
async function upstreamProject(
  tool: string,
  plant: Record<string, string> = {},
): Promise<{ project: string; home: string }> {
  const sandbox = mkTempRepo()
  assertNoAncestorOpenspec(sandbox)
  const project = join(sandbox, 'project')
  mkdirSync(project)
  for (const [rel, text] of Object.entries(plant)) {
    mkdirSync(dirname(join(project, rel)), { recursive: true })
    writeFileSync(join(project, rel), text)
  }
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
    : toolFiles(project)
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

  // What is left is cospec's own output and its shared-root marker, never a file the binary wrote.
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
    test(
      `${id}: doctor names, and --remove-opsx removes, every file the binary wrote`,
      () => sweepRow(id),
      120_000,
    )
  }
})

// A pre-opsx command at a `files` legacy pattern with no OPENSPEC markers: the pinned binary's
// cleanup removes it by name (it re-checks markers only for a directory entry's files), while
// cospec keeps it, because a same-named file without the markers is the user's. This is a
// declared cospec opinion (design decision 12), held here so a pin bump that changes the
// binary's side is noticed, and cospec's side is never changed by accident.
describe('a marker-less file at a files-type legacy pattern', () => {
  const FILE = '.cursor/commands/openspec-nomarker.md'
  const TEXT = '# My own command\n\nNot written by OpenSpec.\n'

  test('the binary removes it; cospec neither lists nor removes it', async () => {
    const upstream = await upstreamProject('claude', { [FILE]: TEXT })
    expect(existsSync(join(upstream.project, FILE))).toBe(false)

    const dir = mkTempRepo({ git: true })
    mkdirSync(join(dir, 'openspec'), { recursive: true })
    writeFileSync(join(dir, 'openspec/config.yaml'), 'schema: feat\n')
    mkdirSync(join(dir, '.cursor/commands'), { recursive: true })
    writeFileSync(join(dir, FILE), TEXT)
    const env = oracleEnv(mkTempRepo())
    const run = await cospec(
      ['init', '--harness', 'none', '--no-gate', '--remove-opsx', '--json'],
      { cwd: dir, env },
    )
    expect(run.exitCode).toBe(0)
    expect((JSON.parse(run.stdout) as { opsx: { found: string[] } }).opsx.found).toEqual([])
    expect(readFileSync(join(dir, FILE), 'utf8')).toBe(TEXT)
    const doctor = await cospec(['doctor', '--json'], { cwd: dir, env })
    expect(
      (JSON.parse(doctor.stdout) as DoctorJson).findings.filter((f) => f.check === 'opsx-leftover'),
    ).toEqual([])
  }, 120_000)
})
