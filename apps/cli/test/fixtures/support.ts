// Shared test harness for the contract and integration suites (Track H).
//
// Everything here drives the CLI and the real bundled openspec binary the same
// way a user's shell would — via `Bun.spawn`, never by importing command
// modules — so the suites exercise the built surface end to end (DESIGN §8.2–8.3).

import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** apps/cli/src/index.ts — the cospec entrypoint spawned as a subprocess. */
export const CLI_ENTRY = resolve(here, '../../src/index.ts')

/** apps/cli/test/fixtures — the checked-in fixture trees. */
export const FIXTURES_DIR = here

/** Monorepo root (…/cospec). */
export const REPO_ROOT = resolve(here, '../../../..')

/** The three repo-state fixtures (DESIGN §8.3). */
export type FixtureName = 'fresh' | 'plain' | 'vanilla-openspec'

export interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Resolved path to the bundled openspec binary (by package, never `$PATH`). */
export function openspecBinPath(): string {
  const pkgJson = Bun.resolveSync('@fission-ai/openspec/package.json', resolve(here, '../../src'))
  return join(dirname(pkgJson), 'bin', 'openspec.js')
}

async function spawn(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, NO_COLOR: '1', ...env },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

/** Run the cospec CLI from source in `cwd`. */
export function cospec(
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): Promise<SpawnResult> {
  return spawn(['bun', CLI_ENTRY, ...args], opts.cwd, opts.env)
}

/** Run the packed-tarball `cospec` binary at `binPath` from `cwd`. */
export function cospecBin(
  binPath: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): Promise<SpawnResult> {
  return spawn([binPath, ...args], opts.cwd, opts.env)
}

/**
 * Run the real bundled openspec binary in `cwd`.
 *
 * `env` exists for the same reason `cospec`'s does, and is load-bearing for
 * `TZ`: assigning `process.env.TZ` in Bun changes the SUITE's zone but the key
 * does not survive `{ ...process.env }`, so a child never inherits it. A test
 * comparing a date computed in-process against one a child stamped must pass
 * the zone explicitly here.
 */
export function openspec(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<SpawnResult> {
  return spawn(['bun', openspecBinPath(), '--no-color', ...args], cwd, env)
}

/**
 * Run the real bundled openspec binary with NO leading `--no-color`.
 *
 * `openspec()` mirrors cospec's own spawn, which always prefixes `--no-color`
 * before the subcommand. A probe of how upstream treats a *trailing*
 * `--no-color` must not have a leading copy already in the argv, or the result
 * says nothing about the trailing one.
 */
export function openspecRaw(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<SpawnResult> {
  return spawn(['bun', openspecBinPath(), ...args], cwd, env)
}

const activeDirs = new Set<string>()

/**
 * Create a fresh temp directory. When `fixture` is given, its tree is copied in;
 * when `git` is true, `git init` runs so repo-state detection sees a work tree.
 * Registered for `cleanupAll()` and returned for explicit `cleanup()`.
 */
export function mkTempRepo(opts: { fixture?: FixtureName; git?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-test-'))
  activeDirs.add(dir)
  if (opts.fixture !== undefined) copyFixture(opts.fixture, dir)
  if (opts.git === true) Bun.spawnSync(['git', 'init', '-q'], { cwd: dir })
  return dir
}

/** Copy a checked-in fixture tree into `dest` (contents merged, not nested). */
export function copyFixture(name: FixtureName, dest: string): void {
  mkdirSync(dest, { recursive: true })
  cpSync(join(FIXTURES_DIR, name), dest, { recursive: true })
}

/** Write a `{ relpath: contents }` map under `root`, creating parent dirs. */
export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, contents)
  }
}

/**
 * Normalized recursive file listing: forward-slash relative paths, sorted,
 * excluding `.git/`. `.gitkeep` markers are dropped so an empty-by-design dir
 * (e.g. openspec/specs) does not perturb golden trees.
 */
export function listTree(root: string): string[] {
  const out: string[] = []
  const walk = (abs: string): void => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === '.git') continue
      const child = join(abs, entry.name)
      if (entry.isDirectory()) walk(child)
      else if (entry.isFile() && entry.name !== '.gitkeep')
        out.push(relative(root, child).split(sep).join('/'))
    }
  }
  walk(root)
  return out.toSorted()
}

/**
 * Map every tracked file under `root` to a sha256 of its contents (relative
 * forward-slash paths, `.git`/`.gitkeep` excluded). Two equal maps prove an
 * operation was a byte-for-byte no-op — the idempotence contract (DESIGN §6.5).
 */
export function hashTree(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rel of listTree(root))
    out[rel] = createHash('sha256')
      .update(readFileSync(join(root, rel)))
      .digest('hex')
  return out
}

/** Remove a temp dir created by `mkTempRepo`. */
export function cleanup(dir: string): void {
  activeDirs.delete(dir)
  rmSync(dir, { recursive: true, force: true })
}

/** Remove every temp dir still registered (afterAll safety net). */
export function cleanupAll(): void {
  for (const dir of activeDirs) rmSync(dir, { recursive: true, force: true })
  activeDirs.clear()
}
