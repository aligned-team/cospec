// What the workflow-profiles contract files share: a profile applies only when the user set one (a
// flag, or a `profile` key in the machine-global config file), and the workflow set cospec
// installs follows it. Every run is sandboxed: HOME and every XDG dir point into a temp root, so
// the global config file a row writes is the only one the pinned binary and cospec can see. The
// binary's own `init` runs beside cospec's wherever a message is compared.

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { adapterFor, commandPath } from '../../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../../src/harness/render.ts'
import { cospec, mkTempRepo, oracleEnv } from '../../fixtures/support.ts'
import { oracle } from './upstream-oracle.ts'

export const MANIFEST = readWorkflowManifest().workflows
export const CLAUDE = adapterFor('claude')
export const CORE_IDS = ['apply', 'archive', 'explore', 'propose', 'sync-specs', 'update']
export const ALL_IDS = MANIFEST.map((w) => w.id).toSorted()

export interface Sandbox {
  root: string
  project: string
  env: Record<string, string>
  configPath: string
}

/** A project dir inside a sandbox root whose global config file holds `globalConfig`. */
export function sandbox(globalConfig?: object | string): Sandbox {
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

export function initIn(s: Sandbox, args: string[] = []) {
  return cospec(['init', '--harness', 'claude', '--no-gate', ...args], {
    cwd: s.project,
    env: s.env,
  })
}

/** The workflow ids that have a Claude skill, and those that have a Claude command, on disk. */
export function installed(project: string): { skills: string[]; commands: string[] } {
  const skillsDir = join(project, '.claude', 'skills')
  // A skill is installed by its file: a removed one may leave its (empty) directory.
  const skillDirs = existsSync(skillsDir)
    ? readdirSync(skillsDir).filter((d) => existsSync(join(skillsDir, d, 'SKILL.md')))
    : []
  const skills = MANIFEST.filter((w) => skillDirs.includes(w.skill)).map((w) => w.id)
  const commands = MANIFEST.filter((w) =>
    existsSync(join(project, commandPath(CLAUDE, w.command)!)),
  ).map((w) => w.id)
  return { skills: skills.toSorted(), commands: commands.toSorted() }
}

/** The text after `cospec: ` / `✖ Error: `, so a refusal compares with the binary's. */
export function messageOf(stderr: string): string {
  return stderr
    .split('\n')
    .map((l) => l.replace(/^cospec: /, '').replace(/^✖ Error: /, ''))
    .find((l) => l.length > 0)!
}

export const NODE = { runtime: 'node' } as const

/** A sandbox plus a sibling dir for the binary's run, both prepared by `setup`. */
export function pair(setup: (dir: string) => void = () => {}): { s: Sandbox; upstream: string } {
  const s = sandbox()
  const upstream = join(s.root, 'oracle')
  mkdirSync(upstream)
  setup(s.project)
  setup(upstream)
  return { s, upstream }
}

export const upstreamInit = (root: string, dir: string, args: string[]) =>
  oracle(['init', '--tools', 'claude', ...args], root, { ...NODE, cwd: dir })

export const setConfig = (s: Sandbox, config: object): void => {
  mkdirSync(dirname(s.configPath), { recursive: true })
  writeFileSync(s.configPath, `${JSON.stringify(config, null, 2)}\n`)
}
export const updateIn = (s: Sandbox, args: string[] = []) =>
  cospec(['update', ...args], { cwd: s.project, env: s.env })
export const files = (stdout: string): { path: string; outcome: string }[] =>
  JSON.parse(stdout).files

export const skillFiles = (project: string, root: string): string[] => {
  const dir = join(project, root)
  return (existsSync(dir) ? readdirSync(dir) : [])
    .filter((d) => existsSync(join(dir, d, 'SKILL.md')))
    .toSorted()
}

export interface DoctorFinding {
  level: string
  check: string
  message: string
  remedy?: string
}

export async function doctorFindings(s: Sandbox): Promise<DoctorFinding[]> {
  const run = await cospec(['doctor', '--json'], { cwd: s.project, env: s.env })
  return JSON.parse(run.stdout).findings
}
