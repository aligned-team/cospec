// workflow-profiles contract rows for `update` and `doctor` (test/contract/support/profiles.ts has
// the sandbox and the helpers the profiles files share).

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { adapterFor, commandPath } from '../../src/harness/adapters.ts'
import { cleanupAll, cospec } from '../fixtures/support.ts'
import {
  ALL_IDS,
  CLAUDE,
  CORE_IDS,
  type DoctorFinding,
  doctorFindings,
  files,
  initIn,
  installed,
  MANIFEST,
  type Sandbox,
  sandbox,
  setConfig,
  skillFiles,
  updateIn,
} from './support/profiles.ts'

// Commands run as child processes, imported so `bun test --changed` selects this file.
import '../../src/commands/doctor.ts'
import '../../src/commands/init.ts'
import '../../src/commands/update.ts'

afterAll(cleanupAll)

describe('update: the effective profile', () => {
  /** A repo that init wrote with nothing set: all twelve workflows, both surfaces. */
  async function twelve(harness = 'claude'): Promise<Sandbox> {
    const s = sandbox()
    const run = await cospec(['init', '--harness', harness, '--no-gate'], {
      cwd: s.project,
      env: s.env,
    })
    expect(run.exitCode).toBe(0)
    return s
  }

  test('an explicit core key over twelve installed workflows removes nothing', async () => {
    const s = await twelve()
    setConfig(s, { profile: 'core' })
    const run = await updateIn(s, ['--json'])
    expect(run.exitCode).toBe(0)
    expect(files(run.stdout).filter((f) => f.outcome === 'removed')).toEqual([])
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect(JSON.parse(run.stdout).profile).toMatchObject({ name: 'core', source: 'config' })
    const check = await updateIn(s, ['--check'])
    expect(check.exitCode).toBe(0)
  }, 120_000)

  test('the human receipt names the explicit profile and the delivery', async () => {
    const s = await twelve()
    setConfig(s, { profile: 'core', delivery: 'both' })
    const run = await updateIn(s)
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain(
      'Workflows: 6 of 12 (profile core, set by the global config; delivery both, set by the global config)',
    )
  }, 120_000)

  test('update --check exits 0 on a repo that sets nothing', async () => {
    const s = await twelve()
    const check = await updateIn(s, ['--check'])
    expect(check.exitCode).toBe(0)
    expect(check.stdout).toContain('no drift')
    expect(check.stdout).not.toContain('Workflows:')
  }, 120_000)

  test('a repo that sets nothing reports no profile and delivery both', async () => {
    const s = await twelve()
    const doc = JSON.parse((await updateIn(s, ['--json'])).stdout)
    expect(doc.profile).toBeNull()
    expect(doc.delivery).toBe('both')
  }, 120_000)

  test('a custom profile that adds verify creates only verify', async () => {
    const s = sandbox({ profile: 'core' })
    expect((await initIn(s)).exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(CORE_IDS)
    setConfig(s, {
      profile: 'custom',
      workflows: [...CORE_IDS.filter((i) => i !== 'sync-specs'), 'verify'],
    })
    const run = await updateIn(s, ['--json'])
    expect(run.exitCode).toBe(0)
    const created = files(run.stdout)
      .filter((f) => f.outcome === 'created')
      .map((f) => f.path)
      .toSorted()
    expect(created).toEqual(
      [
        '.claude/commands/cospec/verify.md',
        '.claude/skills/cospec-verify-change/SKILL.md',
      ].toSorted(),
    )
    expect(installed(s.project).skills).toEqual([...CORE_IDS, 'verify'].toSorted())
  }, 120_000)

  test('custom [archive] adds sync-specs beside archive', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['verify'] })
    expect((await initIn(s)).exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['verify'])
    setConfig(s, { profile: 'custom', workflows: ['verify', 'archive'] })
    const run = await updateIn(s, ['--json'])
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({
      skills: ['archive', 'sync-specs', 'verify'],
      commands: ['archive', 'sync-specs', 'verify'],
    })
  }, 120_000)

  test('delivery skills, then commands, then both moves files and keeps every workflow', async () => {
    const s = await twelve()
    // User files beside the managed ones: a skill of their own and a command in cospec's folder.
    const mine = ['.claude/skills/my-own/SKILL.md', '.claude/commands/cospec/my-own.md']
    for (const f of mine) {
      mkdirSync(dirname(join(s.project, f)), { recursive: true })
      writeFileSync(join(s.project, f), 'mine\n')
    }
    const intact = async (): Promise<void> => {
      for (const f of mine) expect(readFileSync(join(s.project, f), 'utf8')).toBe('mine\n')
      const findings = await doctorFindings(s)
      expect(findings.filter((f) => f.level === 'ERROR')).toEqual([])
    }
    setConfig(s, { delivery: 'skills' })
    const toSkills = await updateIn(s, ['--json'])
    expect(toSkills.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: [] })
    expect(files(toSkills.stdout).filter((f) => f.outcome === 'removed')).toHaveLength(12)
    await intact()

    setConfig(s, { delivery: 'commands' })
    const toCommands = await updateIn(s, ['--json'])
    expect(toCommands.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: [], commands: ALL_IDS })
    await intact()

    setConfig(s, { delivery: 'both' })
    const toBoth = await updateIn(s, ['--json'])
    expect(toBoth.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect((await updateIn(s, ['--check'])).exitCode).toBe(0)
    await intact()
  }, 240_000)

  test('delivery skills respells the bodies so none names a removed command', async () => {
    const s = await twelve()
    setConfig(s, { delivery: 'skills' })
    expect((await updateIn(s)).exitCode).toBe(0)
    const body = readFileSync(
      join(s.project, '.claude', 'skills', 'cospec-apply-change', 'SKILL.md'),
      'utf8',
    )
    expect(body).not.toContain('/cospec:')
    const doctor = await cospec(['doctor', '--json'], { cwd: s.project, env: s.env })
    const checks = (JSON.parse(doctor.stdout).findings as { check: string }[]).map((f) => f.check)
    expect(checks).not.toContain('dangling-ref')
  }, 120_000)

  test('a harness added later gets the profile set while claude keeps twelve', async () => {
    const s = await twelve()
    setConfig(s, { profile: 'core' })
    const add = await cospec(['init', '--harness', 'cursor', '--no-gate'], {
      cwd: s.project,
      env: s.env,
    })
    expect(add.exitCode).toBe(0)
    const cursor = adapterFor('cursor')
    const cursorIds = (): string[] =>
      MANIFEST.filter((w) => existsSync(join(s.project, commandPath(cursor, w.command)!)))
        .map((w) => w.id)
        .toSorted()
    expect(cursorIds()).toEqual(CORE_IDS)
    const run = await updateIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect(cursorIds()).toEqual(CORE_IDS)
  }, 240_000)

  test('detection holds with no propose skill installed', async () => {
    const s = sandbox({ profile: 'custom', workflows: ['explore'] })
    expect((await initIn(s)).exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['explore'])
    const doc = JSON.parse((await updateIn(s, ['--json'])).stdout)
    expect(doc.harnesses).toEqual(['claude'])
    setConfig(s, { profile: 'custom', workflows: ['explore', 'verify'] })
    const run = await updateIn(s, ['--json'])
    expect(run.exitCode).toBe(0)
    expect(installed(s.project).skills).toEqual(['explore', 'verify'])
  }, 120_000)

  test('detection holds with commands only', async () => {
    const s = sandbox({ delivery: 'commands' })
    expect((await initIn(s)).exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: [], commands: ALL_IDS })
    const doc = JSON.parse((await updateIn(s, ['--json'])).stdout)
    expect(doc.harnesses).toEqual(['claude'])
    expect(doc.delivery).toBe('commands')
    expect((await updateIn(s, ['--check'])).exitCode).toBe(0)
  }, 120_000)

  test('a skills-only row under commands writes and keeps nothing, and says so', async () => {
    const s = await twelve('agents')
    expect(skillFiles(s.project, '.agents/skills')).toHaveLength(12)
    setConfig(s, { delivery: 'commands' })
    const run = await updateIn(s)
    expect(run.exitCode).toBe(0)
    expect(skillFiles(s.project, '.agents/skills')).toEqual([])
    expect(run.stdout).toContain('No skills or commands were generated for')
    expect(run.stdout).toContain("Run 'cospec config set delivery both' to generate skills.")
  }, 120_000)

  test('codex keeps its skills under commands', async () => {
    const s = await twelve('codex')
    setConfig(s, { delivery: 'commands' })
    const run = await updateIn(s)
    expect(run.exitCode).toBe(0)
    expect(skillFiles(s.project, '.agents/skills')).toHaveLength(12)
    expect(run.stdout).not.toContain('No skills or commands were generated')
    expect(JSON.parse((await updateIn(s, ['--json'])).stdout).delivery).toBe('commands')
  }, 120_000)

  test("an invalid global config is read as nothing set, with the binary's one warning", async () => {
    const s = await twelve()
    mkdirSync(dirname(s.configPath), { recursive: true })
    writeFileSync(s.configPath, '{ nope')
    const run = await updateIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    const lines = `${run.stdout}${run.stderr}`
      .split('\n')
      .filter((l) => l.startsWith('Warning: Invalid JSON in'))
    expect(lines).toHaveLength(1)
  }, 120_000)
})

describe('doctor: a repo whose profile came from the flag alone', () => {
  test('is clean, and names at INFO the workflows an update would install', async () => {
    const s = sandbox()
    expect((await initIn(s, ['--profile', 'core'])).exitCode).toBe(0)
    const run = await cospec(['doctor', '--json'], { cwd: s.project, env: s.env })
    expect(run.exitCode).toBe(0)
    const findings = JSON.parse(run.stdout).findings as DoctorFinding[]
    expect(findings.filter((f) => f.level === 'ERROR' || f.level === 'WARNING')).toEqual([])
    const info = findings.filter((f) => f.check === 'installed-workflows')
    expect(info).toHaveLength(1)
    expect(info[0]!.level).toBe('INFO')
    for (const id of ALL_IDS.filter((w) => !CORE_IDS.includes(w)))
      expect(info[0]!.message).toContain(id)
    expect(info[0]!.message).not.toContain('propose')
  }, 120_000)

  test('a workflow with one surface deleted is still reported missing', async () => {
    const s = sandbox()
    expect((await initIn(s, ['--profile', 'core'])).exitCode).toBe(0)
    rmSync(join(s.project, commandPath(CLAUDE, 'apply')!))
    const findings = await doctorFindings(s)
    expect(findings.some((f) => f.level === 'ERROR' && f.check === 'schema-missing')).toBe(true)
  }, 120_000)

  test('a twelve-workflow repo with nothing set reports no installed-workflows finding', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    expect((await doctorFindings(s)).filter((f) => f.check === 'installed-workflows')).toEqual([])
  }, 120_000)
})

describe('doctor: the global profile and the installed set', () => {
  const OUTSIDE_CORE = ALL_IDS.filter((id) => !CORE_IDS.includes(id))

  test('an explicit core key over twelve workflows names the six outside it', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    setConfig(s, { profile: 'core' })
    const findings = await doctorFindings(s)
    const profile = findings.filter((f) => f.check === 'openspec-global-profile')
    expect(profile.length).toBeGreaterThan(0)
    expect(profile.every((f) => f.level === 'INFO')).toBe(true)
    const text = profile.map((f) => f.message).join('\n')
    expect(text).toContain('profile core')
    for (const id of OUTSIDE_CORE) expect(text).toContain(id)
    // The six inside the profile are not named as outside it.
    const outside = profile.find((f) => f.message.includes('outside'))!
    for (const id of CORE_IDS.filter((i) => i !== 'update')) {
      expect(outside.message).not.toContain(` ${id},`)
    }
    expect(profile.some((f) => f.remedy?.includes('cospec config profile'))).toBe(true)
    expect(findings.map((f) => `${f.message} ${f.remedy ?? ''}`).join('\n')).not.toContain('inert')
    expect(findings.filter((f) => f.level !== 'INFO')).toEqual([])
  }, 120_000)

  test('a custom profile is reported with its list, and so is an explicit delivery', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    setConfig(s, { profile: 'custom', workflows: ['verify', 'archive'], delivery: 'skills' })
    const text = (await doctorFindings(s))
      .filter((f) => f.check === 'openspec-global-profile')
      .map((f) => f.message)
      .join('\n')
    expect(text).toContain('profile custom')
    expect(text).toContain('delivery skills')
    expect(text).toContain('sync-specs')
  }, 120_000)

  test('a workflows key with no profile is not explicit, so it is silent', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    setConfig(s, { workflows: ['verify'] })
    const checks = (await doctorFindings(s)).map((f) => f.check)
    expect(checks).not.toContain('openspec-global-profile')
  }, 120_000)

  test('nothing explicit is silent', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    const checks = (await doctorFindings(s)).map((f) => f.check)
    expect(checks).not.toContain('openspec-global-profile')
  }, 120_000)

  test('a narrowed install has no dangling-ref, even under delivery skills', async () => {
    const s = sandbox({ profile: 'core', delivery: 'skills' })
    expect((await initIn(s)).exitCode).toBe(0)
    const checks = (await doctorFindings(s)).map((f) => f.check)
    expect(checks).not.toContain('dangling-ref')
  }, 120_000)

  test('a reference to a workflow that is not installed is still a dangling-ref', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    rmSync(join(s.project, '.claude', 'skills', 'cospec-verify-change'), { recursive: true })
    rmSync(join(s.project, commandPath(CLAUDE, 'verify')!))
    const findings = (await doctorFindings(s)).filter((f) => f.check === 'dangling-ref')
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.every((f) => f.level === 'ERROR')).toBe(true)
    expect(findings.some((f) => f.message.includes('verify'))).toBe(true)
  }, 120_000)

  test('a residual optional-workflow marker is a dangling-ref ERROR', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    const file = join(s.project, '.claude', 'skills', 'cospec-apply-change', 'SKILL.md')
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n[[opsx:if-workflow verify]]\n`)
    const findings = (await doctorFindings(s)).filter((f) => f.check === 'dangling-ref')
    expect(findings).toHaveLength(1)
    expect(findings[0]!.level).toBe('ERROR')
    expect(findings[0]!.message).toContain('.claude/skills/cospec-apply-change/SKILL.md')
    expect(findings[0]!.message).toContain('[[opsx:if-workflow verify]]')
  }, 120_000)

  test('a root config file holding an OpenSpec block is an opsx-leftover', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    writeFileSync(
      join(s.project, 'CLAUDE.md'),
      '# Notes\n\n<!-- OPENSPEC:START -->\nOpenSpec instructions\n<!-- OPENSPEC:END -->\n',
    )
    const findings = (await doctorFindings(s)).filter((f) => f.check === 'opsx-leftover')
    expect(findings.map((f) => f.message).join('\n')).toContain('CLAUDE.md')
    expect(findings.every((f) => f.level === 'WARNING')).toBe(true)
    const fix = await cospec(['init', '--harness', 'claude', '--no-gate', '--remove-opsx'], {
      cwd: s.project,
      env: s.env,
    })
    expect(fix.exitCode).toBe(0)
    const after = (await doctorFindings(s)).filter((f) => f.check === 'opsx-leftover')
    expect(after).toEqual([])
  }, 120_000)
})
