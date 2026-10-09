// `cospec init --copilot-cloud` / `--no-copilot-cloud` through the CLI as a subprocess: the
// decision (flag, config, files, skip), what is persisted to `openspec/config.yaml`, the
// ignored-flag notice, the receipt sentences and the `--json` `copilotCloud` key. The rows
// that need the two cloud files written or removed are `test.failing` until `generate()`
// emits and removes them (tasks.md 5.2); each says so.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { CTRL_D, ptyRun, terminalText } from '../contract/support/pty.ts'
import { CLI_ENTRY, cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

const WORKFLOW = '.github/workflows/copilot-setup-steps.yml'
const AGENT = '.github/agents/cospec.agent.md'
const IGNORED =
  '--copilot-cloud/--no-copilot-cloud was ignored because the github-copilot tool was not selected.'
const SKIPPED =
  "Skipped GitHub Copilot cloud files (opt-in). Enable with 'cospec init --copilot-cloud'."

interface Repo {
  dir: string
  env: Record<string, string>
}

function repo(): Repo {
  return { dir: mkTempRepo({ git: true }), env: oracleEnv(mkTempRepo()) }
}

const init = (r: Repo, ...args: string[]) => cospec(['init', ...args], { cwd: r.dir, env: r.env })
const config = (r: Repo): string => readFileSync(join(r.dir, 'openspec/config.yaml'), 'utf8')
const has = (r: Repo, path: string): boolean => existsSync(join(r.dir, path))
const doc = (stdout: string): Record<string, unknown> => JSON.parse(stdout)

interface Cloud {
  tier: string
  enabled: boolean
  persisted: boolean | null
  ignoredFlag: boolean
  present: string[]
  collisions: string[]
  removed: string[]
  leftInPlace: string[]
}
const cloudOf = (stdout: string): Cloud => doc(stdout).copilotCloud as Cloud

describe('a flag passed without the tool', () => {
  test.each(['--copilot-cloud', '--no-copilot-cloud'])(
    '%s with claude prints one sentence on stdout and exits 0, writing nothing',
    async (flag) => {
      const r = repo()
      const run = await init(r, '--harness', 'claude', flag)
      expect(run.exitCode).toBe(0)
      expect(run.stdout.split('\n').filter((l) => l === IGNORED)).toHaveLength(1)
      expect(run.stdout.startsWith(`${IGNORED}\n`)).toBe(true)
      expect(run.stderr).toBe('')
      expect(has(r, '.github')).toBe(false)
      expect(config(r)).not.toContain('githubCopilot')
    },
  )

  test('under --json the sentence goes to stderr, stdout is one document and ignoredFlag is true', async () => {
    const r = repo()
    const run = await init(r, '--harness', 'claude', '--no-copilot-cloud', '--json')
    expect(run.exitCode).toBe(0)
    expect(run.stderr).toContain(`${IGNORED}\n`)
    expect(cloudOf(run.stdout)).toEqual({
      tier: 'not-selected',
      enabled: false,
      persisted: null,
      ignoredFlag: true,
      present: [],
      collisions: [],
      removed: [],
      leftInPlace: [],
    })
  })

  test('without the flag a claude init prints no Copilot line and the key says not-selected', async () => {
    const r = repo()
    const run = await init(r, '--harness', 'claude')
    expect(run.stdout).not.toContain('Copilot')
    const json = await init(r, '--harness', 'claude', '--json')
    expect(cloudOf(json.stdout).tier).toBe('not-selected')
    expect(cloudOf(json.stdout).ignoredFlag).toBe(false)
  })
})

describe('persisting the decision', () => {
  test('--copilot-cloud persists true, keeping the config comments and key order', async () => {
    const r = repo()
    expect((await init(r, '--harness', 'claude')).exitCode).toBe(0)
    const before = config(r)
    const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(run.exitCode).toBe(0)
    const after = config(r)
    // Every original line survives, in its original order; the key is added to the map.
    let at = 0
    for (const line of before.split('\n').filter((l) => l !== '')) {
      const found = after.indexOf(line, at)
      expect(found, line).toBeGreaterThanOrEqual(at)
      at = found
    }
    expect(after).toContain('githubCopilot:\n  cloudAgent: true\n')
  })

  test('--no-copilot-cloud persists false', async () => {
    const r = repo()
    await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    expect(config(r)).toContain('githubCopilot:\n  cloudAgent: false')
  })

  test('the last flag wins in either order', async () => {
    const a = repo()
    await init(a, '--harness', 'github-copilot', '--copilot-cloud', '--no-copilot-cloud')
    expect(config(a)).toContain('cloudAgent: false')
    const b = repo()
    await init(b, '--harness', 'github-copilot', '--no-copilot-cloud', '--copilot-cloud')
    expect(config(b)).toContain('cloudAgent: true')
  })

  test('a flag beats a persisted opposite and rewrites the value in place', async () => {
    const r = repo()
    await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(config(r).match(/cloudAgent/g)).toHaveLength(1)
    expect(config(r)).toContain('cloudAgent: true')
  })

  test('nothing decided: the Skipped line prints, and no githubCopilot key is written', async () => {
    const r = repo()
    const run = await init(r, '--harness', 'github-copilot')
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain(`\n${SKIPPED}\n`)
    expect(config(r)).not.toContain('githubCopilot')
    expect(has(r, WORKFLOW)).toBe(false)
    expect(has(r, AGENT)).toBe(false)
  })

  test('a persisted value is honoured and the config bytes are left unchanged (tier 2)', async () => {
    const r = repo()
    await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    const before = config(r)
    const run = await init(r, '--harness', 'github-copilot')
    expect(run.exitCode).toBe(0)
    expect(run.stdout).not.toContain('Skipped GitHub Copilot')
    expect(config(r)).toBe(before)
  })

  test('a malformed cloudAgent is undecided: both warnings on stderr, value untouched', async () => {
    const r = repo()
    await init(r, '--harness', 'claude')
    writeFileSync(
      join(r.dir, 'openspec/config.yaml'),
      'schema: feat\ngithubCopilot:\n  cloudAgent: x\n',
    )
    const run = await init(r, '--harness', 'github-copilot')
    expect(run.exitCode).toBe(0)
    expect(run.stderr).toContain(
      "Invalid 'githubCopilot.cloudAgent' field in config (must be a boolean)",
    )
    expect(run.stdout).toContain(SKIPPED)
    expect(config(r)).toBe('schema: feat\ngithubCopilot:\n  cloudAgent: x\n')
  })

  test('an unparseable config is left byte-identical with a warning, and the init still succeeds', async () => {
    const r = repo()
    await init(r, '--harness', 'claude')
    const broken = 'schema: [unclosed\n'
    writeFileSync(join(r.dir, 'openspec/config.yaml'), broken)
    const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(run.exitCode).toBe(0)
    expect(config(r)).toBe(broken)
    expect(run.stderr).toContain('could not parse')
  })
})

describe('the --json copilotCloud key', () => {
  test('undecided, then a flag: tier, enabled and persisted follow the decision', async () => {
    const r = repo()
    const first = await init(r, '--harness', 'github-copilot', '--json')
    expect(first.exitCode).toBe(0)
    expect(first.stderr).toBe('')
    expect(cloudOf(first.stdout)).toMatchObject({
      tier: 'undecided',
      enabled: false,
      persisted: null,
      ignoredFlag: false,
      removed: [],
    })
    const second = await init(r, '--harness', 'github-copilot', '--copilot-cloud', '--json')
    expect(cloudOf(second.stdout)).toMatchObject({
      tier: 'flag',
      enabled: true,
      persisted: true,
      ignoredFlag: false,
    })
    const third = await init(r, '--harness', 'github-copilot', '--json')
    expect(cloudOf(third.stdout)).toMatchObject({ tier: 'config', enabled: true, persisted: null })
  })

  test.failing(
    'a flag lists both written paths in present (flipped by task 5.2: generate() emits them)',
    async () => {
      const r = repo()
      const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud', '--json')
      expect(cloudOf(run.stdout).present).toEqual([WORKFLOW, AGENT])
    },
  )

  test('an explicit --harness never prompts, even where a terminal could', async () => {
    const r = repo()
    const run = await init(r, '--harness', 'github-copilot', '--json')
    expect(run.stdout).not.toContain('Set up GitHub Copilot')
  })
})

// Everything below needs the cloud files on disk: flipped by tasks.md 5.2, when `generate()`
// takes the `cloud` directive `init` already passes.
describe('opting in, out and in again', () => {
  test.failing('in writes both files, out removes them, in writes them again', async () => {
    const r = repo()
    const on = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(on.stdout).toContain(`GitHub Copilot cloud files: ${WORKFLOW}, ${AGENT}`)
    expect(has(r, WORKFLOW) && has(r, AGENT)).toBe(true)
    const off = await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    expect(off.stdout).toContain(
      'Removed: 2 Copilot cloud agent file(s) (opted out of cloud files)',
    )
    expect(has(r, WORKFLOW) || has(r, AGENT)).toBe(false)
    await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(has(r, WORKFLOW) && has(r, AGENT)).toBe(true)
  })

  test.failing('a second run reports both files unchanged', async () => {
    const r = repo()
    await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    const again = await init(r, '--harness', 'github-copilot', '--json')
    const files = (doc(again.stdout).files as { path: string; outcome: string }[]).filter((f) =>
      [WORKFLOW, AGENT].includes(f.path),
    )
    expect(files.map((f) => f.outcome)).toEqual(['unchanged', 'unchanged'])
  })

  test.failing('an edited agent file survives opt-out while the workflow is removed', async () => {
    const r = repo()
    await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    writeFileSync(join(r.dir, AGENT), `${readFileSync(join(r.dir, AGENT), 'utf8')}\nMy rule.\n`)
    const off = await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    expect(has(r, WORKFLOW)).toBe(false)
    expect(readFileSync(join(r.dir, AGENT), 'utf8')).toContain('My rule.')
    expect(off.stdout).toContain('Removed: 1 Copilot cloud agent file(s)')
    expect(off.stdout).toContain(
      `Left ${AGENT} in place: edited since cospec wrote it (opted out of cloud files).`,
    )
  })

  test.failing(
    'a foreign workflow is never overwritten: sidecar and the Left-your-existing line',
    async () => {
      const r = repo()
      mkdirSync(join(r.dir, '.github/workflows'), { recursive: true })
      writeFileSync(join(r.dir, WORKFLOW), 'name: mine\n')
      const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
      expect(readFileSync(join(r.dir, WORKFLOW), 'utf8')).toBe('name: mine\n')
      expect(has(r, `${WORKFLOW}.cospec-new`)).toBe(true)
      expect(run.stdout).toContain(
        `Left your existing ${WORKFLOW} untouched — add the cospec install step by hand so the Copilot cloud agent can run cospec.`,
      )
    },
  )

  test.failing("OpenSpec's own openspec.agent.md is untouched", async () => {
    const r = repo()
    mkdirSync(join(r.dir, '.github/agents'), { recursive: true })
    writeFileSync(join(r.dir, '.github/agents/openspec.agent.md'), 'theirs\n')
    await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(has(r, AGENT)).toBe(true)
    await init(r, '--harness', 'github-copilot', '--no-copilot-cloud')
    expect(readFileSync(join(r.dir, '.github/agents/openspec.agent.md'), 'utf8')).toBe('theirs\n')
    expect(has(r, AGENT)).toBe(false)
  })

  test.failing('the alternate profile cospec.md suppresses the agent file', async () => {
    const r = repo()
    mkdirSync(join(r.dir, '.github/agents'), { recursive: true })
    writeFileSync(join(r.dir, '.github/agents/cospec.md'), 'mine\n')
    const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
    expect(run.exitCode).toBe(0)
    expect(has(r, AGENT)).toBe(false)
    expect(has(r, WORKFLOW)).toBe(true)
  })

  test.failing(
    'both profiles with the agent file unmanaged is a conflict: exit 1, skills written',
    async () => {
      const r = repo()
      mkdirSync(join(r.dir, '.github/agents'), { recursive: true })
      writeFileSync(join(r.dir, '.github/agents/cospec.md'), 'mine\n')
      writeFileSync(join(r.dir, AGENT), 'also mine\n')
      const run = await init(r, '--harness', 'github-copilot', '--copilot-cloud')
      expect(run.exitCode).toBe(1)
      expect(run.stdout).toContain(
        'Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md',
      )
      expect(has(r, '.github/skills')).toBe(true)
      expect(has(r, '.github/prompts')).toBe(true)
    },
  )

  test.failing(
    'a managed file on disk with no config key refreshes without persisting (tier 3)',
    async () => {
      const r = repo()
      await init(r, '--harness', 'github-copilot', '--copilot-cloud')
      const text = config(r).replace(/githubCopilot:\n {2}cloudAgent: true\n?/, '')
      writeFileSync(join(r.dir, 'openspec/config.yaml'), text)
      const run = await init(r, '--harness', 'github-copilot', '--json')
      expect(cloudOf(run.stdout)).toMatchObject({
        tier: 'existing-files',
        enabled: true,
        persisted: null,
      })
      expect(cloudOf(run.stdout).present).toEqual([WORKFLOW, AGENT])
      expect(config(r)).not.toContain('githubCopilot')
    },
  )
})

// Tier 4 on a real pseudo-terminal: the binary cannot be driven to this cell without answering
// its tool picker, so design decision 1's quoted source is the upstream evidence, and these
// rows pin cospec's own prompt. `.github/prompts` makes `github-copilot` auto-detected, so no
// `--harness` is given.
describe('the interactive confirm on a terminal', () => {
  const QUESTION = 'Set up GitHub Copilot cloud coding-agent files?'
  const PROMPT_END = '(y/N)'

  function detected(): Repo {
    const r = repo()
    mkdirSync(join(r.dir, '.github/prompts'), { recursive: true })
    writeFileSync(join(r.dir, '.github/prompts/release.prompt.md'), 'Tag and push.\n')
    return r
  }

  /** The sandbox env on a terminal: neither `CI` nor `OPEN_SPEC_INTERACTIVE` may be set. */
  const terminalEnv = (r: Repo, extra: Record<string, string> = {}): Record<string, string> => {
    const env = { ...r.env, ...extra }
    for (const key of ['CI', 'OPEN_SPEC_INTERACTIVE']) if (!(key in extra)) delete env[key]
    return env
  }

  const run = (r: Repo, args: string[], key?: { send: string }, extra?: Record<string, string>) =>
    ptyRun([process.execPath, CLI_ENTRY, 'init', ...args], {
      cwd: r.dir,
      env: terminalEnv(r, extra),
      ...(key === undefined ? {} : { key: { after: PROMPT_END, send: key.send } }),
    })

  test('an empty answer is No: no cloud file, and cloudAgent false is saved', async () => {
    const r = detected()
    const out = await run(r, ['--no-gate'], { send: '\r' })
    expect(out.exitCode).toBe(0)
    const text = terminalText(out.output)
    expect(text).toContain(QUESTION)
    expect(text).toContain(`It writes two files: ${WORKFLOW} and ${AGENT}.`)
    expect(has(r, WORKFLOW) || has(r, AGENT)).toBe(false)
    expect(config(r)).toContain('githubCopilot:\n  cloudAgent: false')
  }, 120_000)

  test.each([['n\r'], [CTRL_D]])(
    'an answer of %p is No and is saved',
    async (send) => {
      const r = detected()
      const out = await run(r, ['--no-gate'], { send })
      expect(out.exitCode).toBe(0)
      expect(config(r)).toContain('cloudAgent: false')
    },
    120_000,
  )

  test('y is saved as true', async () => {
    const r = detected()
    const out = await run(r, ['--no-gate'], { send: 'y\r' })
    expect(out.exitCode).toBe(0)
    expect(config(r)).toContain('githubCopilot:\n  cloudAgent: true')
  }, 120_000)

  test.failing(
    'y also writes both files (flipped by task 5.2)',
    async () => {
      const r = detected()
      await run(r, ['--no-gate'], { send: 'y\r' })
      expect(has(r, WORKFLOW) && has(r, AGENT)).toBe(true)
    },
    120_000,
  )

  const GATES: [string, string[], Record<string, string> | undefined][] = [
    ['--harness given', ['--no-gate', '--harness', 'github-copilot'], undefined],
    ['--tools given', ['--no-gate', '--tools', 'github-copilot'], undefined],
    ['--json', ['--no-gate', '--json'], undefined],
    ['a CI variable', ['--no-gate'], { CI: '1' }],
    ['OPEN_SPEC_INTERACTIVE=0', ['--no-gate'], { OPEN_SPEC_INTERACTIVE: '0' }],
  ]
  test.each(GATES)(
    'no prompt with %s: tier 5, nothing saved',
    async (_name, args, extra) => {
      const r = detected()
      const out = await run(r, args, undefined, extra)
      expect(out.exitCode).toBe(0)
      expect(terminalText(out.output)).not.toContain(QUESTION)
      expect(config(r)).not.toContain('githubCopilot')
    },
    120_000,
  )

  test('a flag, a persisted value or a managed file is reached before the prompt', async () => {
    const r = detected()
    const out = await run(r, ['--no-gate', '--no-copilot-cloud'])
    expect(terminalText(out.output)).not.toContain(QUESTION)
    expect(config(r)).toContain('cloudAgent: false')
    const again = await run(r, ['--no-gate'])
    expect(terminalText(again.output)).not.toContain(QUESTION)
  }, 120_000)
})
