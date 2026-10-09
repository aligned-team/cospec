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
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { parse } from 'yaml'

import {
  adapterFor,
  commandPath,
  HARNESS_TABLE,
  type HarnessAdapter,
  skillPath,
} from '../../src/harness/adapters.ts'
import {
  commandSurfaceCapability,
  type Delivery,
  shouldGenerateCommands,
  shouldGenerateSkills,
} from '../../src/harness/delivery.ts'
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
function messageOf(stderr: string): string {
  return stderr
    .split('\n')
    .map((l) => l.replace(/^cospec: /, '').replace(/^✖ Error: /, ''))
    .find((l) => l.length > 0)!
}

const NODE = { runtime: 'node' } as const

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

describe('init: a global config file it cannot use', () => {
  test("is read as nothing set, with the binary's one warning line", async () => {
    const s = sandbox('{"profile": "core"')
    const before = readFileSync(s.configPath, 'utf8')
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    const line = `Warning: Invalid JSON in ${s.configPath}, using defaults`
    expect(run.stderr.split('\n').filter((l) => l === line)).toHaveLength(1)
    const oracleDir = join(s.root, 'oracle')
    mkdirSync(oracleDir)
    const bin = await oracle(['init', '--tools', 'claude'], s.root, { ...NODE, cwd: oracleDir })
    expect(bin.stderr).toContain(line)
    expect(readFileSync(s.configPath, 'utf8')).toBe(before)
  }, 60_000)

  test('a non-object root sets nothing and warns of nothing', async () => {
    const s = sandbox('["core"]')
    const run = await initIn(s)
    expect(run.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect(run.stderr).not.toContain('Warning')
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

  test('a fresh repo gets the three-line directive as context, as the binary writes it', async () => {
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
  }, 60_000)

  test('the language is trimmed, as the binary trims it', async () => {
    const { s } = pair()
    const run = await initIn(s, ['--language', '  Español  '])
    expect(run.exitCode).toBe(0)
    const ours = parse(readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8'))
    expect(ours.context).toBe(`${DIRECTIVE('Español')}\n`)
  }, 60_000)

  test('a config whose context differs refuses, writing nothing', async () => {
    await expectRefusal(
      ['--language', 'English'],
      withConfig(`schema: feat\ncontext: |\n${DIRECTIVE('Portuguese').replace(/^/gm, '  ')}\n`),
      '--language does not overwrite an existing OpenSpec config. Add the language instruction to its context field instead.',
    )
  }, 60_000)

  test('a config with no context at all refuses', async () => {
    await expectRefusal(['--language', 'English'], withConfig('schema: feat\n'))
  }, 60_000)

  test('config.yml alone counts as a config, so no config.yaml is written beside it', async () => {
    await expectRefusal(['--language', 'English'], (dir) => {
      mkdirSync(join(dir, 'openspec'), { recursive: true })
      writeFileSync(join(dir, 'openspec', 'config.yml'), 'schema: feat\n')
    })
  }, 60_000)

  test('the same directive already in the context is accepted, and the config kept', async () => {
    const yaml = `schema: feat\ncontext: |\n  Team notes.\n${DIRECTIVE('Portuguese').replace(/^/gm, '  ')}\n`
    const { s, upstream } = pair(withConfig(yaml))
    const run = await initIn(s, ['--language', 'Portuguese'])
    const bin = await upstreamInit(s.root, upstream, ['--language', 'Portuguese'])
    expect(bin.exitCode).toBe(0)
    expect(run.exitCode).toBe(0)
    expect(readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8')).toBe(yaml)
  }, 60_000)

  test("an empty or blank value is refused with the binary's message", async () => {
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
  }, 120_000)

  test('a control, bidi or invisible character is refused', async () => {
    const message =
      'The --language option must be a single line without control or invisible formatting characters.'
    const invisible = [0x07, 0x200b, 0x202e, 0x2028, 0xfeff].map(
      (c) => `a${String.fromCharCode(c)}b`,
    )
    for (const value of ['a\tb', ...invisible]) {
      await expectRefusal(['--language', value], undefined, message)
    }
  }, 240_000)

  test('a directive over 50KB is refused', async () => {
    await expectRefusal(
      ['--language', 'x'.repeat(52_000)],
      undefined,
      "The --language option is too long for OpenSpec's 50KB project context limit.",
    )
  }, 60_000)

  test('a destination that is not writable is refused', async () => {
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
  }, 60_000)

  test("a config path that leaves the project is refused with the binary's reason", async () => {
    const { s } = pair()
    const outside = join(s.root, 'outside')
    mkdirSync(outside)
    symlinkSync(outside, join(s.project, 'openspec'))
    const run = await initIn(s, ['--language', 'French'])
    expect(run.exitCode).toBe(1)
    expect(messageOf(run.stderr)).toStartWith('Cannot create openspec/config.yaml for --language: ')
    expect(readdirSync(outside)).toEqual([])
  }, 60_000)

  test('a bad language is reported before a bad profile, as the binary orders them', async () => {
    await expectRefusal(
      ['--language', '', '--profile', 'bogus'],
      undefined,
      'The --language option requires a non-empty value.',
    )
  }, 60_000)

  test('a bad profile still stops a good language, before any write', async () => {
    const { s } = pair()
    const run = await initIn(s, ['--language', 'French', '--profile', 'bogus'])
    expect(run.exitCode).toBe(1)
    expect(messageOf(run.stderr)).toBe('Invalid profile "bogus". Available profiles: core, custom')
    expect(readdirSync(s.project)).toEqual([])
  }, 60_000)
})

describe('init: the config.yaml it writes', () => {
  /** `openspec new change <slug>` reads the project config and prints any field warning. */
  async function binaryReads(s: Sandbox, slug: string): Promise<string> {
    const run = await oracle(['new', 'change', slug], s.root, { ...NODE, cwd: s.project })
    expect(run.exitCode).toBe(0)
    return `${run.stdout}${run.stderr}`
  }

  test('carries the commented operations, store and references examples', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    const yaml = readFileSync(join(s.project, 'openspec', 'config.yaml'), 'utf8')
    for (const heading of ['#   operations:', '#   store: team-plans', '#   references:']) {
      expect(yaml).toContain(heading)
    }
    // The binary's own operations example, line for line.
    expect(yaml).toContain(
      [
        '# Per-operation guidance (optional)',
        '# Add advisory guidance for how apply and archive work should be conducted.',
        '# This is separate from artifact rules above.',
        '# Example:',
        '#   operations:',
        '#     apply:',
        '#       guidance:',
        '#         - Keep test summaries concise',
        '#     archive:',
        '#       guidance:',
        '#         - Summarize the archive outcome before finishing',
      ].join('\n'),
    )
  }, 60_000)

  test('the pinned reader sees no warning in it, with or without --language', async () => {
    const plain = sandbox()
    expect((await initIn(plain)).exitCode).toBe(0)
    expect(await binaryReads(plain, 'a')).not.toMatch(/Invalid|ignoring|Warning/)
    const lang = sandbox()
    expect((await initIn(lang, ['--language', 'French'])).exitCode).toBe(0)
    expect(await binaryReads(lang, 'a')).not.toMatch(/Invalid|ignoring|Warning/)
  }, 120_000)

  test('the same reader does warn about a field that is wrong (the check can fail)', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    const path = join(s.project, 'openspec', 'config.yaml')
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nreferences: not-a-list\n`)
    expect(await binaryReads(s, 'a')).toContain("Invalid 'references' field")
  }, 60_000)

  test('the operations example, uncommented, is config the pinned reader accepts', async () => {
    const s = sandbox()
    expect((await initIn(s)).exitCode).toBe(0)
    const path = join(s.project, 'openspec', 'config.yaml')
    const text = readFileSync(path, 'utf8')
    // `store:` names a store that is not registered and `references:` needs a clone source, so
    // only the `operations:` block is uncommented.
    const uncommented = text.replace(/#   operations:\n(#     .*\n)+/, (block) =>
      block.replace(/^#   /gm, ''),
    )
    expect(uncommented).not.toBe(text)
    writeFileSync(path, uncommented)
    expect(await binaryReads(s, 'a')).not.toMatch(/Invalid|ignoring|Warning/)
  }, 60_000)
})

describe('init over an existing config.yaml', () => {
  test('a second init leaves the file byte-identical, with and without --language', async () => {
    const s = sandbox()
    expect((await initIn(s, ['--language', 'French'])).exitCode).toBe(0)
    const path = join(s.project, 'openspec', 'config.yaml')
    const first = readFileSync(path, 'utf8')
    expect((await initIn(s)).exitCode).toBe(0)
    expect(readFileSync(path, 'utf8')).toBe(first)
    expect((await initIn(s, ['--language', 'French'])).exitCode).toBe(0)
    expect(readFileSync(path, 'utf8')).toBe(first)
    const hand = '# mine\nschema: feat\n'
    writeFileSync(path, hand)
    expect((await initIn(s)).exitCode).toBe(0)
    expect(readFileSync(path, 'utf8')).toBe(hand)
  }, 120_000)
})

describe('github-copilot under a profile', () => {
  test('--profile core with --copilot-cloud writes six prompts and skills, and update keeps the cloud files', async () => {
    const s = sandbox()
    const copilot = adapterFor('github-copilot')
    const run = await cospec(
      ['init', '--harness', 'github-copilot', '--profile', 'core', '--copilot-cloud', '--no-gate'],
      { cwd: s.project, env: s.env },
    )
    expect(run.exitCode).toBe(0)
    const present = (path: string) => existsSync(join(s.project, path))
    const ids = (probe: (w: (typeof MANIFEST)[number]) => boolean) =>
      MANIFEST.filter(probe)
        .map((w) => w.id)
        .toSorted()
    expect(ids((w) => present(commandPath(copilot, w.command)!))).toEqual(CORE_IDS)
    expect(ids((w) => present(skillPath(copilot, w.skill)))).toEqual(CORE_IDS)
    const cloud = ['.github/workflows/copilot-setup-steps.yml', '.github/agents/cospec.agent.md']
    for (const f of cloud) expect(present(f)).toBe(true)
    const update = await cospec(['update', '--json'], { cwd: s.project, env: s.env })
    expect(update.exitCode).toBe(0)
    expect(files(update.stdout).filter((f) => f.outcome === 'removed')).toEqual([])
    for (const f of cloud) expect(present(f)).toBe(true)
  }, 120_000)
})

describe('init: OpenSpec blocks in root-level config files', () => {
  const START = '<!-- OPENSPEC:START -->'
  const END = '<!-- OPENSPEC:END -->'
  const FILES = [
    'CLAUDE.md',
    'CLINE.md',
    'CODEBUDDY.md',
    'COSTRICT.md',
    'QODER.md',
    'IFLOW.md',
    'AGENTS.md',
    'QWEN.md',
  ]
  const BLOCK = `${START}\nOpenSpec instructions\n${END}\n`

  const plant =
    (files: Record<string, string>) =>
    (dir: string): void => {
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
    }

  /** Every root config file as `name -> bytes (or null when absent)`. */
  const rootFiles = (dir: string): Record<string, string | null> =>
    Object.fromEntries(
      FILES.map((name) => [
        name,
        existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null,
      ]),
    )

  /** cospec's `init --remove-opsx` beside the binary's `init --force`, on identical copies. */
  async function strippedBoth(files: Record<string, string>) {
    const { s, upstream } = pair(plant(files))
    const run = await initIn(s, ['--remove-opsx'])
    const bin = await upstreamInit(s.root, upstream, ['--force'])
    expect(bin.exitCode).toBe(0)
    expect(run.exitCode).toBe(0)
    return { s, upstream, run, ours: rootFiles(s.project), theirs: rootFiles(upstream) }
  }

  test('all eight files are scanned, as the binary scans them', async () => {
    const files = Object.fromEntries(FILES.map((name) => [name, `# ${name}\n\n${BLOCK}`]))
    const { ours, theirs } = await strippedBoth(files)
    expect(ours).toEqual(theirs)
    for (const name of FILES) expect(ours[name]).toBe(`# ${name}\n`)
  }, 60_000)

  test('a block is stripped and the rest of the file kept', async () => {
    const { ours, theirs } = await strippedBoth({
      'AGENTS.md': `Team rules.\n\n${BLOCK}\nMore rules.\n`,
    })
    expect(ours).toEqual(theirs)
    expect(ours['AGENTS.md']).toBe('Team rules.\n\nMore rules.\n')
  }, 60_000)

  test('a file holding only the block is written empty, never deleted', async () => {
    const { ours, theirs } = await strippedBoth({ 'CLAUDE.md': BLOCK })
    expect(theirs['CLAUDE.md']).toBe('')
    expect(ours['CLAUDE.md']).toBe('')
  }, 60_000)

  test('markers that share a line with other text are left alone', async () => {
    const inline = `Wrap it in ${START} and ${END} markers.\n`
    const { s, ours, theirs, run } = await strippedBoth({ 'CLINE.md': inline })
    expect(ours).toEqual(theirs)
    expect(ours['CLINE.md']).toBe(inline)
    expect(run.stdout).not.toContain('Removed OpenSpec markers from CLINE.md')
    expect(run.stdout).toContain('Left CLINE.md unchanged')
    const doc = JSON.parse((await initIn(s, ['--json', '--remove-opsx'])).stdout)
    expect(doc.opsx.found).toContain('CLINE.md')
    expect(rootFiles(s.project)['CLINE.md']).toBe(inline)
  }, 60_000)

  test('line endings and blank-line collapsing come out as the binary leaves them', async () => {
    const crlf = `a\r\n\r\n\r\n\r\n${START}\r\nx\r\n${END}\r\nb\r\n`
    const lf = `a\n\n\n\n${START}\nx\n${END}\n\n\nb\n`
    const { ours, theirs } = await strippedBoth({ 'QWEN.md': crlf, 'QODER.md': lf })
    expect(ours).toEqual(theirs)
    expect(ours['QWEN.md']).toBe('a\n\nb\r\n')
  }, 60_000)

  test('without --remove-opsx or --yes the files are listed and nothing changes', async () => {
    const files = { 'CLAUDE.md': BLOCK, 'AGENTS.md': `keep me\n\n${BLOCK}` }
    const s = sandbox()
    plant(files)(s.project)
    const before = rootFiles(s.project)
    const run = await initIn(s, ['--json'])
    expect(run.exitCode).toBe(0)
    const doc = JSON.parse(run.stdout)
    expect(doc.opsx.found).toEqual(expect.arrayContaining(['CLAUDE.md', 'AGENTS.md']))
    expect(doc.opsx.removed).toBe(false)
    expect(rootFiles(s.project)).toEqual(before)
    const human = await initIn(s)
    expect(human.stdout).toContain('CLAUDE.md')
    expect(human.stdout).toContain('--remove-opsx')
    expect(rootFiles(s.project)).toEqual(before)
  }, 60_000)

  test('--yes consents, and the receipt names each file', async () => {
    const s = sandbox()
    plant({ 'CLAUDE.md': BLOCK, 'AGENTS.md': `keep me\n\n${BLOCK}` })(s.project)
    const run = await initIn(s, ['--yes'])
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain('Removed OpenSpec markers from CLAUDE.md')
    expect(run.stdout).toContain('Removed OpenSpec markers from AGENTS.md')
    expect(rootFiles(s.project)['CLAUDE.md']).toBe('')
    expect(rootFiles(s.project)['AGENTS.md']).toBe('keep me\n')
  }, 60_000)

  test('a file without both markers is not listed', async () => {
    const s = sandbox()
    plant({ 'CLAUDE.md': `${START}\nonly a start\n`, 'AGENTS.md': 'plain\n' })(s.project)
    const doc = JSON.parse((await initIn(s, ['--json', '--remove-opsx'])).stdout)
    expect(doc.opsx.found).not.toContain('CLAUDE.md')
    expect(doc.opsx.found).not.toContain('AGENTS.md')
    expect(rootFiles(s.project)['CLAUDE.md']).toBe(`${START}\nonly a start\n`)
  }, 60_000)

  test('a root config file that is a link leaving the project is never rewritten', async () => {
    const s = sandbox()
    const outside = join(s.root, 'elsewhere.md')
    writeFileSync(outside, BLOCK)
    symlinkSync(outside, join(s.project, 'CLAUDE.md'))
    const run = await initIn(s, ['--yes'])
    expect(run.exitCode).toBe(0)
    expect(readFileSync(outside, 'utf8')).toBe(BLOCK)
  }, 60_000)
})

const setConfig = (s: Sandbox, config: object): void => {
  mkdirSync(dirname(s.configPath), { recursive: true })
  writeFileSync(s.configPath, `${JSON.stringify(config, null, 2)}\n`)
}
const updateIn = (s: Sandbox, args: string[] = []) =>
  cospec(['update', ...args], { cwd: s.project, env: s.env })
const files = (stdout: string): { path: string; outcome: string }[] => JSON.parse(stdout).files

const skillFiles = (project: string, root: string): string[] => {
  const dir = join(project, root)
  return (existsSync(dir) ? readdirSync(dir) : [])
    .filter((d) => existsSync(join(dir, d, 'SKILL.md')))
    .toSorted()
}

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
    setConfig(s, { delivery: 'skills' })
    const toSkills = await updateIn(s, ['--json'])
    expect(toSkills.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: [] })
    expect(files(toSkills.stdout).filter((f) => f.outcome === 'removed')).toHaveLength(12)

    setConfig(s, { delivery: 'commands' })
    const toCommands = await updateIn(s, ['--json'])
    expect(toCommands.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: [], commands: ALL_IDS })

    setConfig(s, { delivery: 'both' })
    const toBoth = await updateIn(s, ['--json'])
    expect(toBoth.exitCode).toBe(0)
    expect(installed(s.project)).toEqual({ skills: ALL_IDS, commands: ALL_IDS })
    expect((await updateIn(s, ['--check'])).exitCode).toBe(0)
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

interface DoctorFinding {
  level: string
  check: string
  message: string
  remedy?: string
}

async function doctorFindings(s: Sandbox): Promise<DoctorFinding[]> {
  const run = await cospec(['doctor', '--json'], { cwd: s.project, env: s.env })
  return JSON.parse(run.stdout).findings
}

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

// The matrix (task 8.1): profile x delivery x harness, each cell running init, update and doctor
// in its own sandbox. The harness list is one row per distinct command surface, so a row added
// to HARNESS_TABLE with a new surface joins the matrix with no edit here.
describe('the profile x delivery x harness matrix', () => {
  // `flag` picks the profile on init's command line with no key in the global file, so nothing
  // persists it: `update` would then write all twelve, and only init and doctor are run.
  type ProfileCase = { name: string; config?: object; flag?: string; expected: string[] }
  const PROFILES: ProfileCase[] = [
    { name: 'unset', expected: ALL_IDS },
    { name: 'core', config: { profile: 'core' }, expected: CORE_IDS },
    { name: 'core by flag only', flag: 'core', expected: CORE_IDS },
    {
      name: 'custom with archive',
      config: { profile: 'custom', workflows: ['archive'] },
      expected: ['archive', 'sync-specs'],
    },
    {
      name: 'custom without archive',
      config: { profile: 'custom', workflows: ['explore', 'verify'] },
      expected: ['explore', 'verify'],
    },
  ]
  const DELIVERIES: (Delivery | undefined)[] = [undefined, 'skills', 'commands', 'both']

  const surfaceKey = (r: HarnessAdapter): string =>
    JSON.stringify([
      commandSurfaceCapability(r),
      r.commands?.serializer,
      r.commands?.namespacing,
      r.commands?.injectArguments,
      r.bodyDialect,
      r.skillDialect,
      r.skillsOnlyDialect,
      r.invocationPrefix,
      r.rulesPath !== undefined,
      r.skillsDir !== undefined,
    ])
  const seen = new Set<string>()
  const ROWS: HarnessAdapter[] = []
  for (const row of HARNESS_TABLE as readonly HarnessAdapter[]) {
    const key = surfaceKey(row)
    const named = ['claude', 'codex', 'opencode', 'agents', 'github-copilot'].includes(row.id)
    if (named || !seen.has(key)) ROWS.push(row)
    seen.add(key)
  }

  test('the four named rows and the copilot row are in the matrix', () => {
    const ids = ROWS.map((r) => r.id)
    for (const id of ['claude', 'codex', 'opencode', 'agents', 'github-copilot'])
      expect(ids).toContain(id)
  })

  async function cell(row: HarnessAdapter, profile: ProfileCase, delivery?: Delivery) {
    const label = `${row.id} / ${profile.name} / delivery ${delivery ?? 'unset'}`
    const problems: string[] = []
    const config = {
      ...profile.config,
      ...(delivery === undefined ? {} : { delivery }),
    }
    const s = sandbox(Object.keys(config).length === 0 ? undefined : config)
    const run = (args: string[]) => cospec(args, { cwd: s.project, env: s.env })
    const effective: Delivery = delivery ?? 'both'
    const expectFiles = (phase: string): void => {
      for (const w of MANIFEST) {
        const want = profile.expected.includes(w.id)
        if (row.skillsDir !== undefined) {
          const have = existsSync(join(s.project, skillPath(row, w.skill)))
          const should = want && shouldGenerateSkills(row, effective)
          if (have !== should)
            problems.push(`${phase}: skill ${w.id} present=${have}, want ${should}`)
        }
        const cmd = commandPath(row, w.command)
        if (cmd !== undefined) {
          const have = existsSync(join(s.project, cmd))
          const should = want && shouldGenerateCommands(row, effective)
          if (have !== should)
            problems.push(`${phase}: command ${w.id} present=${have}, want ${should}`)
        }
      }
    }
    const init = await run([
      'init',
      '--harness',
      row.id,
      '--no-gate',
      ...(profile.flag === undefined ? [] : ['--profile', profile.flag]),
    ])
    if (init.exitCode !== 0)
      problems.push(`init exit ${init.exitCode}: ${init.stderr.slice(0, 200)}`)
    expectFiles('init')
    if (profile.flag === undefined) {
      const update = await run(['update', '--json'])
      if (update.exitCode !== 0) {
        problems.push(`update exit ${update.exitCode}: ${update.stderr.slice(0, 200)}`)
      } else {
        const moved = files(update.stdout).filter(
          (f) => !['unchanged', 'skipped'].includes(f.outcome),
        )
        if (moved.length > 0)
          problems.push(`update changed ${moved.map((f) => `${f.path}:${f.outcome}`).join(', ')}`)
      }
      expectFiles('update')
    }
    const doctor = await run(['doctor', '--json'])
    if (doctor.exitCode !== 0) problems.push(`doctor exit ${doctor.exitCode}`)
    const bad = (JSON.parse(doctor.stdout).findings as DoctorFinding[]).filter(
      (f) =>
        f.level === 'ERROR' ||
        f.check === 'drift' ||
        f.check === 'stale-harness' ||
        f.check === 'mixed-versions',
    )
    for (const f of bad) problems.push(`doctor ${f.level} ${f.check}: ${f.message.slice(0, 120)}`)
    return problems.map((p) => `${label}: ${p}`)
  }

  for (const row of ROWS) {
    test.failing(
      `${row.id}: every profile x delivery cell passes init, update and doctor`,
      async () => {
        const cells = PROFILES.flatMap((profile) => DELIVERIES.map((d) => cell(row, profile, d)))
        expect((await Promise.all(cells)).flat()).toEqual([])
      },
      300_000,
    )
  }
})
