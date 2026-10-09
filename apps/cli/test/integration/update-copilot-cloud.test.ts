// `cospec update` for the GitHub Copilot cloud files through the CLI as a subprocess: the
// series (opted in, opted out, undecided, tool dropped), what an opt-out removes and what it
// leaves, the one Warning line for a failure the binary would catch, `--check`, and the hint
// that appears only where a person could act on it. The rows that need the files emitted or
// removed are `test.failing` until `generate()` does that (tasks.md 5.2).

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { ptyRun, terminalText } from '../contract/support/pty.ts'
import { CLI_ENTRY, cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

// Flipped to `test` by tasks.md 5.2.
const t = test.failing

const WORKFLOW = '.github/workflows/copilot-setup-steps.yml'
const AGENT = '.github/agents/cospec.agent.md'
const ALTERNATE = '.github/agents/cospec.md'
const HINT =
  "GitHub Copilot cloud coding-agent files are available (opt-in). Enable with 'cospec init --copilot-cloud'."

interface Repo {
  dir: string
  env: Record<string, string>
}

function repo(): Repo {
  return { dir: mkTempRepo({ git: true }), env: oracleEnv(mkTempRepo()) }
}

const run = (r: Repo, ...args: string[]) => cospec(args, { cwd: r.dir, env: r.env })
const has = (r: Repo, path: string): boolean => existsSync(join(r.dir, path))
const read = (r: Repo, path: string): string => readFileSync(join(r.dir, path), 'utf8')
const put = (r: Repo, path: string, text: string): void => {
  mkdirSync(join(r.dir, path, '..'), { recursive: true })
  writeFileSync(join(r.dir, path), text)
}
const setCloud = (r: Repo, value: boolean): void =>
  put(r, 'openspec/config.yaml', `githubCopilot:\n  cloudAgent: ${value}\n`)

/** A project with the tool configured and the cloud files written, opted in. */
async function optedIn(): Promise<Repo> {
  const r = repo()
  await run(r, 'init', '--harness', 'github-copilot', '--copilot-cloud')
  return r
}

describe('update while opted in', () => {
  t('re-syncs a deleted cloud file and a stale one, and says so', async () => {
    const r = await optedIn()
    rmSync(join(r.dir, WORKFLOW))
    const out = await run(r, 'update')
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain(WORKFLOW)
    expect(has(r, WORKFLOW)).toBe(true)
    expect((await run(r, 'update')).stdout).toContain('everything up to date')
  })

  t('keeps the files when only a managed tier-3 file marks the opt-in', async () => {
    const r = await optedIn()
    writeFileSync(join(r.dir, 'openspec/config.yaml'), 'schema: spec-driven\n')
    rmSync(join(r.dir, WORKFLOW))
    await run(r, 'update')
    expect(has(r, WORKFLOW)).toBe(true)
  })

  t('--check exits 1 for a missing managed cloud file and writes nothing', async () => {
    const r = await optedIn()
    rmSync(join(r.dir, WORKFLOW))
    const out = await run(r, 'update', '--check')
    expect(out.exitCode).toBe(1)
    expect(has(r, WORKFLOW)).toBe(false)
  })

  t('doctor reports a missing managed cloud file', async () => {
    const r = await optedIn()
    rmSync(join(r.dir, WORKFLOW))
    const out = await run(r, 'doctor')
    expect(out.stdout).toContain(`managed file is missing: ${WORKFLOW}`)
  })
})

describe('opt-out and opt-in again', () => {
  t('out removes the managed files, in writes them again', async () => {
    const r = await optedIn()
    setCloud(r, false)
    const off = await run(r, 'update')
    expect(off.exitCode).toBe(0)
    expect(off.stdout).toContain(
      'Removed: 2 Copilot cloud agent file(s) (opted out of cloud files)',
    )
    expect(has(r, WORKFLOW) || has(r, AGENT)).toBe(false)
    expect((await run(r, 'update')).stdout).not.toContain('Removed')
    setCloud(r, true)
    await run(r, 'update')
    expect(has(r, WORKFLOW) && has(r, AGENT)).toBe(true)
  })

  t('a hand-edited file survives opt-out; the managed one is removed', async () => {
    const r = await optedIn()
    put(r, AGENT, `${read(r, AGENT)}\nMy rule.\n`)
    setCloud(r, false)
    const off = await run(r, 'update')
    expect(off.stdout).toContain(
      'Removed: 1 Copilot cloud agent file(s) (opted out of cloud files)',
    )
    expect(off.stdout).toContain(
      `Left ${AGENT} in place: edited since cospec wrote it (opted out of cloud files).`,
    )
    expect(has(r, WORKFLOW)).toBe(false)
    expect(read(r, AGENT)).toContain('My rule.')
    // A second run has nothing left to do and says nothing about it.
    expect((await run(r, 'update')).exitCode).toBe(0)
    expect(read(r, AGENT)).toContain('My rule.')
  })

  t('OpenSpec own agent file is never touched', async () => {
    const r = await optedIn()
    expect(has(r, AGENT)).toBe(true)
    put(r, '.github/agents/openspec.agent.md', 'theirs\n')
    setCloud(r, false)
    await run(r, 'update')
    expect(has(r, AGENT)).toBe(false)
    expect(read(r, '.github/agents/openspec.agent.md')).toBe('theirs\n')
  })

  t('--json keeps one document: the removals are in files', async () => {
    const r = await optedIn()
    setCloud(r, false)
    const out = await run(r, 'update', '--json')
    const doc = JSON.parse(out.stdout) as { files: { path: string; outcome: string }[] }
    expect(
      doc.files.filter((f) => [WORKFLOW, AGENT].includes(f.path)).map((f) => f.outcome),
    ).toEqual(['removed', 'removed'])
  })
})

describe('the tool dropped', () => {
  t('removes the managed cloud files with the not-configured reason', async () => {
    const r = await optedIn()
    rmSync(join(r.dir, '.github/skills'), { recursive: true })
    rmSync(join(r.dir, '.github/prompts'), { recursive: true })
    const out = await run(r, 'update')
    expect(out.exitCode).toBe(0)
    expect(out.stdout).toContain(
      'Removed: 2 Copilot cloud agent file(s) (github-copilot not configured)',
    )
    expect(has(r, WORKFLOW) || has(r, AGENT)).toBe(false)
  })
})

describe('a failure the binary would catch', () => {
  t('both profiles with the agent file unmanaged: one Warning on stderr, exit 0', async () => {
    const r = await optedIn()
    put(r, ALTERNATE, 'mine\n')
    put(r, AGENT, 'also mine\n')
    const out = await run(r, 'update')
    expect(out.exitCode).toBe(0)
    expect(out.stderr).toBe(
      'Warning: failed to sync Copilot cloud agent files: Conflicting Copilot agent profiles: preserve either .github/agents/cospec.md or .github/agents/cospec.agent.md\n',
    )
    expect(read(r, AGENT)).toBe('also mine\n')
  })
})

describe('the hint', () => {
  /** Undecided: the tool is configured, nothing was ever opted into. */
  async function undecided(): Promise<Repo> {
    const r = repo()
    await run(r, 'init', '--harness', 'github-copilot')
    return r
  }
  const terminalEnv = (r: Repo): Record<string, string> => {
    const env = { ...r.env }
    for (const key of ['CI', 'OPEN_SPEC_INTERACTIVE']) delete env[key]
    return env
  }
  const onTerminal = (r: Repo, ...args: string[]) =>
    ptyRun([process.execPath, CLI_ENTRY, 'update', ...args], { cwd: r.dir, env: terminalEnv(r) })

  test('a piped run prints no hint', async () => {
    const r = await undecided()
    const out = await run(r, 'update')
    expect(out.stdout).not.toContain(HINT)
    expect(has(r, WORKFLOW)).toBe(false)
  })

  t(
    'an interactive run that is undecided prints it once and writes nothing',
    async () => {
      const r = await undecided()
      const out = await onTerminal(r)
      expect(out.exitCode).toBe(0)
      const text = terminalText(out.output)
      expect(text.split(HINT)).toHaveLength(2)
      expect(has(r, WORKFLOW) || has(r, AGENT)).toBe(false)
    },
    120_000,
  )

  test('not with --check, not with --json, not once decided', async () => {
    const r = await undecided()
    expect(terminalText((await onTerminal(r, '--check')).output)).not.toContain(HINT)
    expect(terminalText((await onTerminal(r, '--json')).output)).not.toContain(HINT)
    setCloud(r, false)
    expect(terminalText((await onTerminal(r)).output)).not.toContain(HINT)
  }, 120_000)
})
