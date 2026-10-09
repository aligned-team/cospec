// workflow-profiles contract rows: a profile applies only when the user set one (a flag, or a
// `profile` key in the machine-global config file), and the workflow set cospec installs follows
// it. Every run is sandboxed: HOME and every XDG dir point into a temp root, so the global
// config file a row writes is the only one the pinned binary and cospec can see. The binary's
// own `init` runs beside cospec's wherever a message is compared.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { parse } from 'yaml'

import { adapterFor, commandPath } from '../../src/harness/adapters.ts'
import { readWorkflowManifest } from '../../src/harness/render.ts'
import { cleanupAll, cospec, hashTree, mkTempRepo, oracleEnv } from '../fixtures/support.ts'
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

describe('init --language', () => {
  const DIRECTIVE = (lang: string): string =>
    [
      `Language: ${lang}`,
      `All artifacts must be written in ${lang}.`,
      'Keep OpenSpec structural headings and SHALL/MUST keywords in English.',
    ].join('\n')

  /** A sandbox plus a sibling dir for the binary's run, both prepared by `setup`. */
  function pair(setup: (dir: string) => void = () => {}): { s: Sandbox; upstream: string } {
    const s = sandbox()
    const upstream = join(s.root, 'oracle')
    mkdirSync(upstream)
    setup(s.project)
    setup(upstream)
    return { s, upstream }
  }

  const upstreamInit = (root: string, dir: string, args: string[]) =>
    oracle(['init', '--tools', 'claude', ...args], root, { ...NODE, cwd: dir })

  /** The whole project tree as `path -> content hash`, so "wrote nothing" is a comparison. */
  const snapshot = (dir: string): Record<string, string> => hashTree(dir)

  async function expectRefusal(
    args: string[],
    setup?: (dir: string) => void,
    message?: string,
  ): Promise<void> {
    const { s, upstream } = pair(setup)
    const before = snapshot(s.project)
    const run = await initIn(s, args)
    const bin = await upstreamInit(s.root, upstream, args)
    expect(bin.exitCode).toBe(1)
    expect(run.exitCode).toBe(1)
    expect(run.stdout).toBe('')
    expect(messageOf(run.stderr)).toBe(messageOf(bin.stderr))
    if (message !== undefined) expect(messageOf(run.stderr)).toBe(message)
    expect(snapshot(s.project)).toEqual(before)
  }

  const withConfig =
    (yaml: string) =>
    (dir: string): void => {
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'config.yaml'), yaml)
    }

  test.failing(
    'a fresh repo gets the three-line directive as context, as the binary writes it',
    async () => {
      const { s, upstream } = pair()
      const run = await initIn(s, ['--language', 'Portuguese'])
      expect(run.exitCode).toBe(0)
      const bin = await upstreamInit(s.root, upstream, ['--language', 'Portuguese'])
      expect(bin.exitCode).toBe(0)
      const ours = parse(readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8'))
      const theirs = parse(readFileSync(join(upstream, 'openspec', 'config.yaml'), 'utf8'))
      expect(ours.context).toBe(theirs.context)
      expect(ours.context).toBe(`${DIRECTIVE('Portuguese')}\n`)
      expect(ours.schema).toBe('feat')
    },
    60_000,
  )

  test.failing(
    'the language is trimmed, as the binary trims it',
    async () => {
      const { s } = pair()
      const run = await initIn(s, ['--language', '  Español  '])
      expect(run.exitCode).toBe(0)
      const ours = parse(readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8'))
      expect(ours.context).toBe(`${DIRECTIVE('Español')}\n`)
    },
    60_000,
  )

  test.failing(
    'a config whose context differs refuses, writing nothing',
    async () => {
      await expectRefusal(
        ['--language', 'English'],
        withConfig(`schema: feat\ncontext: |\n${DIRECTIVE('Portuguese').replace(/^/gm, '  ')}\n`),
        '--language does not overwrite an existing OpenSpec config. Add the language instruction to its context field instead.',
      )
    },
    60_000,
  )

  test.failing(
    'a config with no context at all refuses',
    async () => {
      await expectRefusal(['--language', 'English'], withConfig('schema: feat\n'))
    },
    60_000,
  )

  test.failing(
    'config.yml alone counts as a config, so no config.yaml is written beside it',
    async () => {
      await expectRefusal(['--language', 'English'], (dir) => {
        mkdirSync(join(dir, 'openspec'), { recursive: true })
        writeFileSync(join(dir, 'openspec', 'config.yml'), 'schema: feat\n')
      })
    },
    60_000,
  )

  test.failing(
    'the same directive already in the context is accepted, and the config kept',
    async () => {
      const yaml = `schema: feat\ncontext: |\n  Team notes.\n${DIRECTIVE('Portuguese').replace(/^/gm, '  ')}\n`
      const { s, upstream } = pair(withConfig(yaml))
      const run = await initIn(s, ['--language', 'Portuguese'])
      const bin = await upstreamInit(s.root, upstream, ['--language', 'Portuguese'])
      expect(bin.exitCode).toBe(0)
      expect(run.exitCode).toBe(0)
      expect(readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8')).toBe(yaml)
    },
    60_000,
  )

  test.failing(
    "an empty or blank value is refused with the binary's message",
    async () => {
      await expectRefusal(
        ['--language', ''],
        undefined,
        'The --language option requires a non-empty value.',
      )
      await expectRefusal(
        ['--language', '   '],
        undefined,
        'The --language option requires a non-empty value.',
      )
    },
    120_000,
  )

  test.failing(
    'a control, bidi or invisible character is refused',
    async () => {
      const message =
        'The --language option must be a single line without control or invisible formatting characters.'
      const invisible = [0x07, 0x200b, 0x202e, 0x2028, 0xfeff].map(
        (c) => `a${String.fromCharCode(c)}b`,
      )
      for (const value of ['a\tb', ...invisible]) {
        await expectRefusal(['--language', value], undefined, message)
      }
    },
    240_000,
  )

  test.failing(
    'a directive over 50KB is refused',
    async () => {
      await expectRefusal(
        ['--language', 'x'.repeat(52_000)],
        undefined,
        "The --language option is too long for OpenSpec's 50KB project context limit.",
      )
    },
    60_000,
  )

  test.failing(
    'a destination that is not writable is refused',
    async () => {
      if (process.getuid?.() === 0) return
      const { s, upstream } = pair((dir) => {
        mkdirSync(join(dir, 'openspec'), { recursive: true })
        chmodSync(join(dir, 'openspec'), 0o555)
      })
      try {
        const run = await initIn(s, ['--language', 'French'])
        const bin = await upstreamInit(s.root, upstream, ['--language', 'French'])
        expect(bin.exitCode).toBe(1)
        expect(run.exitCode).toBe(1)
        expect(messageOf(run.stderr)).toBe(messageOf(bin.stderr))
        expect(messageOf(run.stderr)).toBe(
          'Cannot create openspec/config.yaml for --language: the destination is not writable.',
        )
        expect(readdirSync(join(s.project, 'openspec'))).toEqual([])
      } finally {
        chmodSync(join(s.project, 'openspec'), 0o755)
        chmodSync(join(upstream, 'openspec'), 0o755)
      }
    },
    60_000,
  )

  test.failing(
    "a config path that leaves the project is refused with the binary's reason",
    async () => {
      const { s } = pair()
      const outside = join(s.root, 'outside')
      mkdirSync(outside)
      symlinkSync(outside, join(s.project, 'openspec'))
      const run = await initIn(s, ['--language', 'French'])
      expect(run.exitCode).toBe(1)
      expect(messageOf(run.stderr)).toStartWith(
        'Cannot create openspec/config.yaml for --language: ',
      )
      expect(readdirSync(outside)).toEqual([])
    },
    60_000,
  )

  test.failing(
    'a bad language is reported before a bad profile, as the binary orders them',
    async () => {
      await expectRefusal(
        ['--language', '', '--profile', 'bogus'],
        undefined,
        'The --language option requires a non-empty value.',
      )
    },
    60_000,
  )

  test.failing(
    'a bad profile still stops a good language, before any write',
    async () => {
      const { s } = pair()
      const run = await initIn(s, ['--language', 'French', '--profile', 'bogus'])
      expect(run.exitCode).toBe(1)
      expect(messageOf(run.stderr)).toBe(
        'Invalid profile "bogus". Available profiles: core, custom',
      )
      expect(readdirSync(s.project)).toEqual([])
    },
    60_000,
  )
})
