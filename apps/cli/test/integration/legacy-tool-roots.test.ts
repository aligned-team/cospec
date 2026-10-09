// The pinned binary's `LEGACY_TOOL_ROOTS` moves (design decision 9), driven through the CLI.
// What sits under each legacy root is the pinned binary's own `init --tools <id>` output,
// run under Node in a private sandbox and copied in with its root renamed, so every file
// the move sees is one OpenSpec really wrote.

import { afterAll, describe, expect, test } from 'bun:test'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { assertNoAncestorOpenspec } from '../contract/support/upstream-init-capture.ts'
import { oracleSpawn } from '../contract/support/upstream-oracle.ts'
import { cleanupAll, cospec, mkTempRepo, oracleEnv } from '../fixtures/support.ts'

afterAll(cleanupAll)

interface MoveEntry {
  path: string
  outcome: string
  to?: string
}

interface InitDoc {
  harnesses: string[]
  opsx: { found: unknown[]; removed: boolean }
  migration: MoveEntry[]
}

interface Repo {
  dir: string
  env: Record<string, string>
}

/** A fresh git repo plus the sandbox env every cospec call in it runs under. */
function freshRepo(): Repo {
  const sandbox = mkTempRepo()
  return { dir: mkTempRepo({ git: true }), env: oracleEnv(sandbox) }
}

/** Run the pinned binary's `init --tools <tool>` in its own sandbox; return that project dir. */
async function upstreamInit(tool: string): Promise<string> {
  const sandbox = mkTempRepo()
  assertNoAncestorOpenspec(sandbox)
  const project = join(sandbox, 'project')
  mkdirSync(project)
  const spawn = oracleSpawn(['--no-color', 'init', '--tools', tool], sandbox, {
    runtime: 'node',
    cwd: project,
  })
  const home = spawn.env.HOME!
  const proc = Bun.spawn(spawn.cmd, {
    cwd: spawn.cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...spawn.env, USERPROFILE: home },
  })
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
  if (exitCode !== 0) throw new Error(`upstream init --tools ${tool} failed: ${stderr}`)
  return project
}

/** Copy upstream's `<from>` tree into the repo as `<to>`, the root an earlier release used. */
function plant(project: string, from: string, repo: Repo, to: string): void {
  cpSync(join(project, from), join(repo.dir, to), { recursive: true })
}

function files(dir: string, rel = ''): string[] {
  const abs = join(dir, rel)
  if (!existsSync(abs)) return []
  return readdirSync(abs, { withFileTypes: true })
    .flatMap((e) => {
      const child = rel === '' ? e.name : `${rel}/${e.name}`
      return e.isDirectory() ? files(dir, child) : [child]
    })
    .toSorted()
}

const SKILL_DIRS = [
  'openspec-apply-change',
  'openspec-archive-change',
  'openspec-bulk-archive-change',
  'openspec-continue-change',
  'openspec-explore',
  'openspec-ff-change',
  'openspec-new-change',
  'openspec-onboard',
  'openspec-propose',
  'openspec-sync-specs',
  'openspec-update-change',
  'openspec-verify-change',
]

const COMMAND_IDS = [
  'apply',
  'archive',
  'bulk-archive',
  'continue',
  'explore',
  'ff',
  'new',
  'onboard',
  'propose',
  'sync',
  'update',
  'verify',
]

const skillPaths = (root: string): string[] => SKILL_DIRS.map((d) => `${root}/skills/${d}/SKILL.md`)
const workflowPaths = (root: string): string[] =>
  COMMAND_IDS.map((id) => `${root}/workflows/opsx-${id}.md`)

async function initJson(repo: Repo, harness: string): Promise<InitDoc> {
  const run = await cospec(['init', '--harness', harness, '--json'], {
    cwd: repo.dir,
    env: repo.env,
  })
  expect(run.exitCode).toBe(0)
  return JSON.parse(run.stdout) as InitDoc
}

describe('legacy tool roots move on init', () => {
  test.failing(
    "kimi: OpenSpec's .kimi skills move to .kimi-code, .kimi goes once empty",
    async () => {
      const upstream = await upstreamInit('kimi')
      const repo = freshRepo()
      plant(upstream, '.kimi-code', repo, '.kimi')
      const before = Object.fromEntries(
        skillPaths('.kimi').map((p) => [p, readFileSync(join(repo.dir, p), 'utf8')]),
      )

      const doc = await initJson(repo, 'kimi')

      expect(existsSync(join(repo.dir, '.kimi'))).toBe(false)
      for (const [from, text] of Object.entries(before)) {
        const to = from.replace(/^\.kimi\//, '.kimi-code/')
        expect(readFileSync(join(repo.dir, to), 'utf8')).toBe(text)
        expect(doc.migration).toContainEqual({ path: from, outcome: 'moved', to })
      }
      // The moved files are OpenSpec's, so the leftover scan reports them where they now are.
      expect(doc.opsx.found).toEqual(expect.arrayContaining(skillPaths('.kimi-code')))
    },
    120_000,
  )

  test.failing(
    'kimi: the receipt reports the move',
    async () => {
      const upstream = await upstreamInit('kimi')
      const repo = freshRepo()
      plant(upstream, '.kimi-code', repo, '.kimi')
      const run = await cospec(['init', '--harness', 'kimi'], { cwd: repo.dir, env: repo.env })
      expect(run.exitCode).toBe(0)
      expect(run.stdout).toContain('Migrated 12 skills: .kimi → .kimi-code\n')
    },
    120_000,
  )

  test.failing(
    'devin: selecting it moves .windsurf; a user workflow there stays',
    async () => {
      const upstream = await upstreamInit('devin')
      const repo = freshRepo()
      plant(upstream, '.devin', repo, '.windsurf')
      const userFlow = join(repo.dir, '.windsurf/workflows/my-flow.md')
      writeFileSync(userFlow, '# My flow\n\nMine.\n')

      const doc = await initJson(repo, 'devin')

      expect(files(repo.dir, '.windsurf')).toEqual(['workflows/my-flow.md'])
      expect(readFileSync(userFlow, 'utf8')).toBe('# My flow\n\nMine.\n')
      for (const from of [...skillPaths('.windsurf'), ...workflowPaths('.windsurf')]) {
        const to = from.replace(/^\.windsurf\//, '.devin/')
        expect(existsSync(join(repo.dir, to))).toBe(true)
        expect(doc.migration).toContainEqual({ path: from, outcome: 'moved', to })
      }
    },
    120_000,
  )

  test.failing(
    'devin: a differing destination keeps both copies and reports it',
    async () => {
      const upstream = await upstreamInit('devin')
      const repo = freshRepo()
      plant(upstream, '.devin', repo, '.windsurf')
      const dest = join(repo.dir, '.devin/workflows/opsx-apply.md')
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, '# customised\n')
      const legacy = readFileSync(join(repo.dir, '.windsurf/workflows/opsx-apply.md'), 'utf8')

      const run = await cospec(['init', '--harness', 'devin'], { cwd: repo.dir, env: repo.env })
      expect(run.exitCode).toBe(0)
      expect(readFileSync(dest, 'utf8')).toBe('# customised\n')
      expect(readFileSync(join(repo.dir, '.windsurf/workflows/opsx-apply.md'), 'utf8')).toBe(legacy)
      expect(run.stdout).toContain('Migrated 12 skills and 11 commands: .windsurf → .devin\n')
      expect(run.stdout).toContain(
        'Left 1 file in .windsurf/ that differs from the copy in .devin/. Nothing was ' +
          'overwritten — compare the two and delete the .windsurf/ copy once you have kept ' +
          'anything you customized.\n',
      )
    },
    120_000,
  )

  test.failing(
    "codex: OpenSpec's .codex skills move to .agents after cospec's are written",
    async () => {
      const upstream = await upstreamInit('codex')
      const repo = freshRepo()
      plant(upstream, '.agents/skills', repo, '.codex/skills')
      rmSync(join(repo.dir, '.codex/skills/.openspec-target'))

      const doc = await initJson(repo, 'codex')

      expect(existsSync(join(repo.dir, '.codex/skills'))).toBe(false)
      expect(existsSync(join(repo.dir, '.codex/rules/cospec.rules'))).toBe(true)
      for (const from of skillPaths('.codex')) {
        const to = from.replace(/^\.codex\//, '.agents/')
        expect(existsSync(join(repo.dir, to))).toBe(true)
        expect(doc.migration).toContainEqual({ path: from, outcome: 'moved', to })
      }
      expect(doc.opsx.found).toEqual(expect.arrayContaining(skillPaths('.agents')))
    },
    120_000,
  )

  test.failing(
    'antigravity: .agent moves to .agents after generation (row lands in task 8.3)',
    async () => {
      const upstream = await upstreamInit('antigravity')
      const repo = freshRepo()
      plant(upstream, '.agents', repo, '.agent')
      rmSync(join(repo.dir, '.agent/skills/.openspec-target'))

      const doc = await initJson(repo, 'antigravity')

      expect(existsSync(join(repo.dir, '.agent'))).toBe(false)
      for (const from of [...skillPaths('.agent'), ...workflowPaths('.agent')]) {
        const to = from.replace(/^\.agent\//, '.agents/')
        expect(doc.migration).toContainEqual({ path: from, outcome: 'moved', to })
      }
    },
    120_000,
  )
})

describe('legacy tool roots move on update', () => {
  test.failing(
    'update --json moves .windsurf without asking when devin is detected',
    async () => {
      const upstream = await upstreamInit('devin')
      const repo = freshRepo()
      expect(
        (await cospec(['init', '--harness', 'devin'], { cwd: repo.dir, env: repo.env })).exitCode,
      ).toBe(0)
      plant(upstream, '.devin', repo, '.windsurf')

      const run = await cospec(['update', '--json'], { cwd: repo.dir, env: repo.env })
      expect(run.exitCode).toBe(0)
      const doc = JSON.parse(run.stdout) as { harnesses: string[]; migration: MoveEntry[] }
      expect(doc.harnesses).toContain('devin')
      expect(existsSync(join(repo.dir, '.windsurf'))).toBe(false)
      for (const from of [...skillPaths('.windsurf'), ...workflowPaths('.windsurf')]) {
        const to = from.replace(/^\.windsurf\//, '.devin/')
        expect(existsSync(join(repo.dir, to))).toBe(true)
        expect(doc.migration).toContainEqual({ path: from, outcome: 'moved', to })
      }
    },
    120_000,
  )

  test.failing(
    'update --check reports the move as drift and moves nothing',
    async () => {
      const upstream = await upstreamInit('kimi')
      const repo = freshRepo()
      expect(
        (await cospec(['init', '--harness', 'kimi'], { cwd: repo.dir, env: repo.env })).exitCode,
      ).toBe(0)
      plant(upstream, '.kimi-code', repo, '.kimi')
      const before = files(repo.dir, '.kimi')

      const run = await cospec(['update', '--check'], { cwd: repo.dir, env: repo.env })
      expect(run.exitCode).toBe(1)
      expect(run.stdout).toContain('Would migrate 12 skills: .kimi → .kimi-code\n')
      expect(files(repo.dir, '.kimi')).toEqual(before)
    },
    120_000,
  )
})
