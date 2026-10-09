// The rows that need a dialect or serializer no earlier row used, driven through the CLI as a
// subprocess: Kimi's `/skill:` skills, Rovo Dev's prose, Cline's and Kilo Code's
// frontmatter-less commands, Devin's split spelling, Pi's `$@`, and Hermes's setup note.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readFixture } from '../contract/support/upstream-init-capture.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface Repo {
  dir: string
  env: Record<string, string>
}

async function initRepo(harness: string): Promise<{ repo: Repo; stdout: string }> {
  const sandbox = mkTempRepo()
  const dir = mkTempRepo({ git: true })
  const env = oracleEnv(sandbox)
  const init = await cospec(['init', '--harness', harness], { cwd: dir, env })
  expect(init.exitCode).toBe(0)
  return { repo: { dir, env }, stdout: init.stdout }
}

const read = (repo: Repo, path: string): string => readFileSync(join(repo.dir, path), 'utf8')

async function manifestFiles(repo: Repo): Promise<string[]> {
  const parsed = JSON.parse(read(repo, 'openspec/.cospec-manifest.json')) as {
    files: Record<string, string>
  }
  return Object.keys(parsed.files)
}

async function danglingRefs(repo: Repo): Promise<string[]> {
  const doctor = await cospec(['doctor', '--json'], { cwd: repo.dir, env: repo.env })
  const report = JSON.parse(doctor.stdout) as { findings: { check: string; message: string }[] }
  return report.findings.filter((f) => f.check === 'dangling-ref').map((f) => f.message)
}

describe('skill and prose dialects', () => {
  test("kimi's skills reference /skill:cospec-<skill> and doctor finds them resolved", async () => {
    const { repo } = await initRepo('kimi')
    const body = read(repo, '.kimi-code/skills/cospec-propose/SKILL.md')
    expect(body).toContain('/skill:cospec-apply-change')
    expect(body).not.toContain('/cospec:')
    expect(await danglingRefs(repo)).toEqual([])
  })

  test('doctor finds a dangling /skill:cospec-nope in a kimi skill', async () => {
    const { repo } = await initRepo('kimi')
    const path = join(repo.dir, '.kimi-code/skills/cospec-propose/SKILL.md')
    writeFileSync(path, `${readFileSync(path, 'utf8')}\nThen run /skill:cospec-nope.\n`)
    expect(await danglingRefs(repo)).toEqual([
      '.kimi-code/skills/cospec-propose/SKILL.md references /cospec:nope, which is not a known cospec workflow',
    ])
  })

  test("rovodev's skills are referenced in prose and its receipt hint asks the tool by name", async () => {
    const { repo, stdout } = await initRepo('rovodev')
    expect(read(repo, '.rovodev/skills/cospec-propose/SKILL.md')).toContain(
      'the cospec-apply-change skill',
    )
    expect(stdout).toContain(
      'Try: ask Rovo Dev CLI to use the cospec-propose skill with "feat: <what you want to build>"\n',
    )
    expect(await danglingRefs(repo)).toEqual([])
  })

  test("devin's skills and workflows spell references differently", async () => {
    const { repo } = await initRepo('devin')
    const skill = read(repo, '.devin/skills/cospec-propose/SKILL.md')
    const workflow = read(repo, '.devin/workflows/cospec-propose.md')
    expect(skill).toContain('/cospec-apply-change')
    expect(workflow).toMatch(/\/cospec-apply(?![-\w])/)
    expect(workflow).not.toContain('/cospec-apply-change')
    expect(await danglingRefs(repo)).toEqual([])
  })
})

describe('frontmatter-less commands', () => {
  test("cline's workflows start with a header, carry no frontmatter and are manifest-tracked", async () => {
    const { repo } = await initRepo('cline')
    const workflow = read(repo, '.clinerules/workflows/cospec-propose.md')
    expect(workflow.startsWith('# COSPEC: Propose\n\nPropose a new change')).toBe(true)
    expect(workflow).not.toMatch(/^---$/m)
    const tracked = await manifestFiles(repo)
    expect(tracked.filter((p) => p.startsWith('.clinerules/workflows/'))).toHaveLength(12)
    expect(tracked.filter((p) => p.startsWith('.cline/skills/'))).toEqual([])
  })

  test('a hand-edited kilocode workflow is kept, its regeneration sidecarred, and --check fails', async () => {
    const { repo } = await initRepo('kilocode')
    const path = '.kilocode/workflows/cospec-propose.md'
    const generated = read(repo, path)
    expect(generated.startsWith('---')).toBe(false)
    expect(
      (await manifestFiles(repo)).filter((p) => p.startsWith('.kilocode/workflows/')),
    ).toHaveLength(12)
    writeFileSync(join(repo.dir, path), `${generated}\nmy note\n`)

    const check = await cospec(['update', '--check'], { cwd: repo.dir, env: repo.env })
    expect(check.exitCode).toBe(1)
    const update = await cospec(['update'], { cwd: repo.dir, env: repo.env })
    expect(update.exitCode).toBe(0)
    expect(read(repo, path)).toContain('my note')
    expect(read(repo, `${path}.cospec-new`)).toBe(generated)
  })

  test("gemini's TOML commands are manifest-tracked", async () => {
    const { repo } = await initRepo('gemini')
    expect(read(repo, '.gemini/commands/cospec/propose.toml').startsWith('description = "')).toBe(
      true,
    )
    expect(await manifestFiles(repo)).toContain('.gemini/commands/cospec/propose.toml')
  })
})

describe('argument placeholders', () => {
  test("pi's command carries $@ and its skill does not", async () => {
    const { repo } = await initRepo('pi')
    expect(read(repo, '.pi/prompts/cospec-propose.md')).toContain('**Provided arguments**: $@')
    expect(read(repo, '.pi/skills/cospec-propose/SKILL.md')).not.toContain('$@')
  })

  test("command-code's plain command carries $ARGUMENTS", async () => {
    const { repo } = await initRepo('command-code')
    const command = read(repo, '.commandcode/commands/cospec-propose.md')
    expect(command).toContain('**Provided arguments**: $ARGUMENTS')
    expect(command.startsWith('---')).toBe(false)
  })
})

describe('setup notes', () => {
  test("hermes's receipt prints the pinned binary's setup note verbatim", async () => {
    const upstream = readFixture('hermes')
      .stdout.split('\n')
      .find((l) => l.startsWith('Setup required for Hermes Agent: '))
    expect(upstream).toBeDefined()
    const { stdout } = await initRepo('hermes')
    expect(stdout.split('\n')).toContain(upstream!)
  })

  test('hermes is detected from HERMES.md alone', async () => {
    const sandbox = mkTempRepo()
    const dir = mkTempRepo({ git: true })
    writeFileSync(join(dir, 'HERMES.md'), '# notes\n')
    const init = await cospec(['init', '--json'], { cwd: dir, env: oracleEnv(sandbox) })
    expect(init.exitCode).toBe(0)
    expect((JSON.parse(init.stdout) as { harnesses: string[] }).harnesses).toEqual(['hermes'])
    expect(existsSync(join(dir, '.hermes/skills/cospec-propose/SKILL.md'))).toBe(true)
  })
})

// The shared `.agents` root's acceptance rows (spec "selecting four shared-root harnesses
// writes each file once", "the marker keeps the writer across runs"). The arbiter is proven
// over synthetic rows in `test/unit/init/shared-root-generate.test.ts`; these drive the real
// ids.
describe('the shared .agents skills root', () => {
  test('codex, agents, zed and antigravity write each shared file once and stamp codex', async () => {
    const { repo, stdout } = await initRepo('codex,agents,zed,antigravity')
    const tracked = await manifestFiles(repo)
    const all = [...new Bun.Glob('.agents/**/*').scanSync({ cwd: repo.dir, dot: true })]
    expect(all.filter((p) => /^\.agents\/skills\/cospec-[^/]+\/SKILL\.md$/.test(p))).toHaveLength(
      12,
    )
    expect(all.filter((p) => /^\.agents\/workflows\/cospec-[^/]+\.md$/.test(p))).toHaveLength(12)
    expect(existsSync(join(repo.dir, '.codex/rules/cospec.rules'))).toBe(true)
    expect(read(repo, '.agents/skills/.cospec-target')).toBe('codex\n')
    expect(tracked).toContain('.agents/skills/.cospec-target')
    expect(existsSync(join(repo.dir, '.agents/skills/.openspec-target'))).toBe(false)
    expect(stdout).toContain(
      'skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for codex)',
    )
  })

  test('a marker naming agents keeps agents the writer, and update detects agents, not zed', async () => {
    const sandbox = mkTempRepo()
    const dir = mkTempRepo({ git: true })
    const env = oracleEnv(sandbox)
    const first = await cospec(['init', '--harness', 'agents'], { cwd: dir, env })
    expect(first.exitCode).toBe(0)
    const init = await cospec(['init', '--harness', 'agents,zed'], { cwd: dir, env })
    expect(init.exitCode).toBe(0)
    expect(readFileSync(join(dir, '.agents/skills/.cospec-target'), 'utf8')).toBe('agents\n')
    const check = await cospec(['update', '--check', '--json'], { cwd: dir, env })
    expect((JSON.parse(check.stdout) as { harnesses: string[] }).harnesses).toEqual(['agents'])
  })

  test('a configured owner stays the writer when a later run selects only rows beside it', async () => {
    const dir = mkTempRepo({ git: true })
    const env = oracleEnv(mkTempRepo())
    expect((await cospec(['init', '--harness', 'agents'], { cwd: dir, env })).exitCode).toBe(0)
    const next = await cospec(['init', '--harness', 'zed,antigravity'], { cwd: dir, env })
    expect(next.exitCode).toBe(0)
    expect(readFileSync(join(dir, '.agents/skills/.cospec-target'), 'utf8')).toBe('agents\n')
    expect(next.stdout).toContain(
      'skills for codex/agents/antigravity/zed share the .agents/skills root (one tree, written for agents)',
    )
    const check = await cospec(['update', '--check', '--json'], { cwd: dir, env })
    expect((JSON.parse(check.stdout) as { harnesses: string[] }).harnesses).toEqual([
      'agents',
      'antigravity',
    ])
  })

  test('agents,zed on a fresh root is written for zed, as the binary writes it', async () => {
    const { repo, stdout } = await initRepo('agents,zed')
    expect(read(repo, '.agents/skills/.cospec-target')).toBe('zed\n')
    expect(stdout).toContain('(one tree, written for zed)')
  })
})

describe('the github-copilot row', () => {
  test.failing(
    'writes twelve skills and twelve prompts under .github, and the receipt asks for a restart',
    async () => {
      const { repo, stdout } = await initRepo('github-copilot')
      const tracked = await manifestFiles(repo)
      expect(
        tracked.filter((p) => p.startsWith('.github/skills/') && p.endsWith('/SKILL.md')),
      ).toHaveLength(12)
      expect(
        tracked.filter((p) => p.startsWith('.github/prompts/') && p.endsWith('.prompt.md')),
      ).toHaveLength(12)
      expect(read(repo, '.github/prompts/cospec-propose.prompt.md')).toStartWith(
        '---\ndescription: ',
      )
      expect(read(repo, '.github/prompts/cospec-propose.prompt.md')).toContain('/cospec-apply')
      expect(stdout).toContain('12 skills and 12 commands in .github/')
      expect(stdout.trimEnd().endsWith('Restart your IDE to refresh commands.')).toBe(true)
      expect(await danglingRefs(repo)).toEqual([])
    },
  )

  test.failing(
    'a second init reports unchanged, and update detects the tool from .github/skills',
    async () => {
      const { repo } = await initRepo('github-copilot')
      const again = await cospec(['init', '--harness', 'github-copilot', '--json'], {
        cwd: repo.dir,
        env: repo.env,
      })
      expect(again.exitCode).toBe(0)
      const files = (JSON.parse(again.stdout) as { files: { outcome: string }[] }).files
      expect(files.filter((f) => f.outcome !== 'unchanged' && f.outcome !== 'skipped')).toEqual([])
      const update = await cospec(['update', '--json'], { cwd: repo.dir, env: repo.env })
      expect(update.exitCode).toBe(0)
      expect((JSON.parse(update.stdout) as { harnesses: string[] }).harnesses).toEqual([
        'github-copilot',
      ])
      const doctor = await cospec(['doctor'], { cwd: repo.dir, env: repo.env })
      expect(doctor.exitCode).toBe(0)
    },
  )
})
