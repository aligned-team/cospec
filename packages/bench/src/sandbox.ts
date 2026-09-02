// Per-cell hermetic sandbox lifecycle (mirrors e2e/eval/context.ts conventions).
//
// Each cell gets a fresh mkdtemp git repo seeded from the scenario's fixture
// dir, then initialized for its arm:
//   - cospec arm  → the WORKING-TREE CLI (apps/cli/src/index.ts) runs
//     `cospec init . --harness claude --yes`, so the generated /cospec:* skills
//     and schemas come from the current tree under test.
//   - openspec arm → the repo's PINNED @fission-ai/openspec binary, resolved by
//     path (never $PATH), runs `openspec init . --tools claude` — OpenSpec's own
//     instructions, no cospec skills.
// Sandboxes are torn down after scoring.

import { cp, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { Arm } from './matrix.ts'

export interface Sandbox {
  dir: string
  arm: Arm
}

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function run(
  argv: readonly string[],
  cwd: string,
  extraEnv?: Record<string, string>,
): Promise<SpawnResult> {
  const proc = Bun.spawn([...argv], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1', ...extraEnv },
  })
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

/**
 * Path to the pinned openspec bin, resolved BY PATH (never $PATH). The package is
 * a dependency of `apps/cli` (symlinked into `apps/cli/node_modules`), not the
 * root, so resolution is based there — the same location the cospec CLI itself
 * resolves the wrapped binary from.
 */
export function openspecBin(repoRoot: string): string {
  const pkgJson = Bun.resolveSync('@fission-ai/openspec/package.json', join(repoRoot, 'apps/cli'))
  return join(dirname(pkgJson), 'bin', 'openspec.js')
}

/**
 * Create and initialize a sandbox for one cell. Seeds the fixture (if any),
 * makes a baseline git commit so task-completion diffs have a reference point,
 * then runs the arm's init. Throws with an actionable message if init fails, so
 * a broken arm surfaces rather than silently scoring an uninitialized tree.
 */
export async function createArmSandbox(
  repoRoot: string,
  fixtureAbsDir: string,
  arm: Arm,
): Promise<Sandbox> {
  const dir = await mkdtemp(join(tmpdir(), 'cospec-bench-'))
  await run(['git', 'init', '-q'], dir)
  await run(['git', 'config', 'user.email', 'bench@aligned.team'], dir)
  await run(['git', 'config', 'user.name', 'cospec-bench'], dir)

  if (await exists(fixtureAbsDir)) {
    await cp(fixtureAbsDir, dir, { recursive: true })
  }
  await run(['git', 'add', '-A'], dir)
  await run(['git', 'commit', '-q', '-m', 'seed', '--allow-empty'], dir)

  if (arm === 'cospec') {
    const init = await run(
      [
        'bun',
        'run',
        join(repoRoot, 'apps/cli/src/index.ts'),
        '--',
        'init',
        '.',
        '--harness',
        'claude',
        '--yes',
      ],
      dir,
    )
    if (init.exitCode !== 0) {
      throw new Error(`cospec init failed in sandbox (exit ${init.exitCode})\n${init.stderr}`)
    }
  } else {
    const init = await run(
      ['bun', 'run', openspecBin(repoRoot), '--', 'init', '.', '--tools', 'claude'],
      dir,
    )
    if (init.exitCode !== 0) {
      throw new Error(`openspec init failed in sandbox (exit ${init.exitCode})\n${init.stderr}`)
    }
  }

  return { dir, arm }
}

// Paths never included in a captured cell diff: the spec-workflow artifacts
// (which would both reveal the arm and are already snapshotted separately) and
// the hidden-test suite (`scoreHiddenTests` copies it into the sandbox). Git
// pathspec `:(exclude)` magic, honored by both `git diff` and `git ls-files`.
const DIFF_EXCLUDES = [
  ':(exclude)openspec/**',
  ':(exclude).claude/**',
  ':(exclude).codex/**',
  ':(exclude).opencode/**',
  ':(exclude)hidden-tests/**',
] as const

/**
 * Capture the agent's code change as a unified diff from the seed commit: the
 * diff of tracked files plus the full content of each untracked file (rendered
 * via `git diff --no-index` against /dev/null), EXCLUDING the spec-workflow
 * dirs and the hidden-test suite (see `DIFF_EXCLUDES`) — so the result is the
 * arm-agnostic engineering change only, never the openspec/cospec artifacts
 * that would reveal which arm produced it. Raw (unredacted) text; callers MUST
 * redact before persisting. Best captured before `scoreMechanical` seeds
 * `hidden-tests/`, though that path is excluded defensively regardless.
 */
export async function captureSandboxDiff(dir: string): Promise<string> {
  const tracked = await run(['git', 'diff', 'HEAD', '--', '.', ...DIFF_EXCLUDES], dir)
  const untracked = await run(
    ['git', 'ls-files', '--others', '--exclude-standard', '--', '.', ...DIFF_EXCLUDES],
    dir,
  )
  const parts: string[] = []
  if (tracked.stdout.trim().length > 0) parts.push(tracked.stdout.trimEnd())
  for (const rel of untracked.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)) {
    // `git diff --no-index` exits 1 when the files differ (they always do here:
    // one side is /dev/null); the diff text is on stdout regardless.
    const added = await run(['git', 'diff', '--no-index', '--', '/dev/null', rel], dir)
    if (added.stdout.trim().length > 0) parts.push(added.stdout.trimEnd())
  }
  return parts.join('\n')
}

export async function teardown(sandbox: Sandbox): Promise<void> {
  await rm(sandbox.dir, { recursive: true, force: true })
}

/** Read a sandbox-relative file, or undefined when absent. */
export async function readSandboxFile(dir: string, rel: string): Promise<string | undefined> {
  const path = join(dir, rel)
  return (await exists(path)) ? Bun.file(path).text() : undefined
}

/** Whether a sandbox-relative path exists. */
export async function sandboxExists(dir: string, rel: string): Promise<boolean> {
  return exists(join(dir, rel))
}

export { run as spawnIn }
