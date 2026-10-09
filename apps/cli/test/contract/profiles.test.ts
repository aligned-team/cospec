// workflow-profiles contract rows: a profile applies only when the user set one (a flag, or a
// `profile` key in the machine-global config file), and the workflow set cospec installs follows
// it. Every run is sandboxed: HOME and every XDG dir point into a temp root, so the global
// config file a row writes is the only one the pinned binary and cospec can see. The binary's
// own `init` runs beside cospec's wherever a message is compared.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { adapterFor, commandPath } from '../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../src/harness/render.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
import { oracle } from './support/upstream-oracle.ts'

afterAll(cleanupAll)

const MANIFEST = readWorkflowManifest().workflows
const CLAUDE = adapterFor('claude')
const CORE_IDS = ['apply', 'archive', 'explore', 'propose', 'sync-specs', 'update']
const ALL_IDS = MANIFEST.map((w) => w.id).toSorted()

interface Sandbox {
  root: string
  project: string
  env: Record<string, string>
  configPath: string
}

/** A project dir inside a sandbox root whose global config file holds `globalConfig`. */
function sandbox(globalConfig?: object | string): Sandbox {
  const root = mkTempRepo()
  const env = oracleEnv(root)
  const configPath = join(env.XDG_CONFIG_HOME!, 'openspec', 'config.json')
  if (globalConfig !== undefined) {
    mkdirSync(dirname(configPath), { recursive: true })
    writeFileSync(
      configPath,
      typeof globalConfig === 'string'
        ? globalConfig
        : `${JSON.stringify(globalConfig, null, 2)}\n`,
    )
  }
  const project = join(root, 'project')
  mkdirSync(project)
  return { root, project, env, configPath }
}

function initIn(s: Sandbox, args: string[] = []) {
  return cospec(['init', '--harness', 'claude', '--no-gate', ...args], {
    cwd: s.project,
    env: s.env,
  })
}

/** The workflow ids that have a Claude skill, and those that have a Claude command, on disk. */
function installed(project: string): { skills: string[]; commands: string[] } {
  const skillsDir = join(project, '.claude', 'skills')
  const skillDirs = existsSync(skillsDir) ? readdirSync(skillsDir) : []
  const skills = MANIFEST.filter((w) => skillDirs.includes(w.skill)).map((w) => w.id)
  const commands = MANIFEST.filter((w) =>
    existsSync(join(project, commandPath(CLAUDE, w.command)!)),
  ).map((w) => w.id)
  return { skills: skills.toSorted(), commands: commands.toSorted() }
}

/** The text after `cospec: ` / `✖ Error: `, so a refusal compares with the binary's. */
function messageOf(stderr: string): string {
  return stderr
    .split('\n')
    .map((l) => l.replace(/^cospec: /, '').replace(/^✖ Error: /, ''))
    .find((l) => l.length > 0)!
}

const NODE = { runtime: 'node' } as const

describe('init: the effective profile', () => {
  test('no profile anywhere installs all twelve workflows', async () => {
    const s = sandbox()
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect(run.stdout).not.toContain('Workflows:')
  }, 60_000)

  test('an explicit core key installs six, and doctor finds no dangling-ref', async () => {
    const s = sandbox({ profile: 'core' })
    const before = readFileSync(s.configPath, 'utf8')
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: CORE_IDS, commands: CORE_IDS })
    expect(run.stdout).toContain('Workflows: 6 of 12 (profile core, set by the global config)')
    const doctor = await cospec(['doctor', '--json'], { cwd: s.project, env: s.env })
    const checks = (JSON.parse(doctor.stdout).findings as { check: string }[]).map((f) => f.check)
    expect(checks).not.toContain('dangling-ref')
    expect(readFileSync(s.configPath, 'utf8')).toBe(before)
  }, 60_000)

  test('a delivery key alone is not an explicit profile: twelve workflows', async () => {
    const s = sandbox({ delivery: 'both' })
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect(run.stdout).toContain('Workflows: 12 of 12 (delivery both, set by the global config)')
  }, 60_000)

  test('--profile core over a custom key installs six', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['verify'] })
    const run = await initIn(s, ['--profile', 'core'])
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: CORE_IDS, commands: CORE_IDS })
    expect(run.stdout).toContain('Workflows: 6 of 12 (profile core, set by --profile)')
  }, 60_000)

  test('--profile custom takes its list from the global file', async () => {
    const s = sandbox({ profile: 'core', workflows: ['verify', 'new'] })
    const run = await initIn(s, ['--profile', 'custom'])
    expect(run.exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['new', 'verify'])
  }, 60_000)

  test('--profile custom with no global file installs nothing', async () => {
    const s = sandbox()
    const run = await initIn(s, ['--profile', 'custom'])
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: [], commands: [] })
    expect(run.stdout).toContain('Workflows: 0 of 12 (profile custom, set by --profile')
    expect(run.stdout).toContain('no workflows selected')
  }, 60_000)

  test('custom [archive] installs sync-specs and archive', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['archive'] })
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['archive', 'sync-specs'])
    expect(installed(s.project).commands).toEqual(['archive', 'sync-specs'])
  }, 60_000)

  test('custom reads upstream\'s "sync" as sync-specs', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['propose', 'sync'] })
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['propose', 'sync-specs'])
  }, 60_000)

  test('an explicit delivery of skills writes no command files', async () => {
    const s = sandbox({ delivery: 'skills' })
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: [] })
  }, 60_000)

  test('--json carries profile and delivery, and the human receipt a line', async () => {
    const none = sandbox()
    const noneDoc = JSON.parse((await initIn(none, ['--json'])).stdout)
    expect(noneDoc.profile).toBeNull()
    expect(noneDoc.delivery).toBe('both')

    const flag = sandbox()
    const flagDoc = JSON.parse((await initIn(flag, ['--json', '--profile', 'core'])).stdout)
    expect({ ...flagDoc.profile, workflows: flagDoc.profile.workflows.toSorted() }).toEqual({
      name: 'core',
      source: 'flag',
      workflows: CORE_IDS,
    })
    expect(flagDoc.delivery).toBe('both')

    const config = sandbox({ profile: 'custom', workflows: ['archive'], delivery: 'skills' })
    const configDoc = JSON.parse((await initIn(config, ['--json'])).stdout)
    expect(configDoc.profile).toEqual({
      name: 'custom',
      source: 'config',
      workflows: ['sync-specs', 'archive'],
    })
    expect(configDoc.delivery).toBe('skills')
    // Every key the document carried before stays.
    for (const key of ['version', 'path', 'state', 'harnesses', 'files', 'failed', 'opsx']) {
      expect(key in configDoc).toBe(true)
    }
  }, 60_000)
})

describe('init --profile validation', () => {
  test("an invalid profile is refused before any write, with the binary's message", async () => {
    const s = sandbox({ profile: 'custom', workflows: ['verify'] })
    const before = readFileSync(s.configPath, 'utf8')
    const run = await initIn(s, ['--profile', 'bogus'])
    expect(run.exitCode).toBe(1)
    expect(run.stdout).toBe('')
    expect(readdirSync(s.project)).toEqual([])
    expect(readFileSync(s.configPath, 'utf8')).toBe(before)
    const oracleDir = join(s.root, 'oracle')
    mkdirSync(oracleDir)
    const upstream = await oracle(['init', '--tools', 'claude', '--profile', 'bogus'], s.root, {
      ...NODE,
      cwd: oracleDir,
    })
    expect(upstream.exitCode).toBe(1)
    expect(messageOf(run.stderr)).toBe('Invalid profile "bogus". Available profiles: core, custom')
    expect(messageOf(upstream.stderr)).toBe(messageOf(run.stderr))
  }, 60_000)

  test('the profile value is case-sensitive, as the binary reads it', async () => {
    const s = sandbox()
    const run = await initIn(s, ['--profile', 'CORE'])
    expect(run.exitCode).toBe(1)
    expect(messageOf(run.stderr)).toBe('Invalid profile "CORE". Available profiles: core, custom')
    expect(readdirSync(s.project)).toEqual([])
  }, 60_000)

  test('the global config file is never written by init', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['archive'], delivery: 'commands' })
    const before = readFileSync(s.configPath, 'utf8')
    await initIn(s)
    await initIn(s, ['--profile', 'core'])
    expect(readFileSync(s.configPath, 'utf8')).toBe(before)
    const none = sandbox()
    await initIn(none, ['--profile', 'core'])
    expect(existsSync(none.configPath)).toBe(false)
  }, 120_000)
})
