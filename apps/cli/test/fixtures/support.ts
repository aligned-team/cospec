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
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildWrappedSpawnEnv } from '../../src/core/openspec.ts'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Color-forcing env vars that Node/Bun's tty color-depth detection reads.
 * When any of these leak into a child alongside `NO_COLOR`, Node prints a
 * "The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set"
 * warning on stderr (`internal:tty` `warnOnDeactivatedColors`) — which
 * corrupts every stderr-empty assertion in a shell that happens to export
 * one of these. Strip them before forcing `NO_COLOR=1` so a child always
 * observes a clean, deterministic color-disabled env regardless of the
 * parent shell.
 */
export const COLOR_ENV_KEYS = ['FORCE_COLOR', 'COLORTERM', 'CLICOLOR', 'CLICOLOR_FORCE'] as const

/**
 * The zone the suite process itself runs in. `bun test` leaves `$TZ` unset and
 * runs in UTC, while a child spawned from `{ ...process.env }` — which does not
 * carry a `process.env.TZ` assignment either — falls back to the machine's own
 * zone. A row that expects a date computed in-process (`formatLocalDate()`)
 * then disagrees with the date the child stamped for every hour the two zones
 * sit on different calendar days.
 */
export function suiteZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * `env` for a spawned child, with `TZ` pinned to `suiteZone()` unless `env`
 * names its own. Applied where a child is spawned, never inside `oracleEnv`:
 * several suites assign an `oracleEnv` onto `process.env` and later `delete` the
 * keys, and in Bun a `delete` of a `TZ` that was assigned leaves later `TZ`
 * assignments without effect, which would break every row that skews the
 * suite's zone afterwards.
 */
export function withSuiteZone<T extends Record<string, string | undefined>>(
  env: T,
): T & { TZ: string | undefined } {
  return { TZ: suiteZone(), ...env }
}

/** `process.env` with every color-forcing key (`COLOR_ENV_KEYS`) removed. */
export function envWithoutColorForcing(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  for (const key of COLOR_ENV_KEYS) delete out[key]
  return out
}

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
  unset: readonly string[] = [],
): Promise<SpawnResult> {
  const childEnv: Record<string, string | undefined> = withSuiteZone({
    ...envWithoutColorForcing(),
    NO_COLOR: '1',
    ...env,
  })
  // Deleted after the merge, so an ambient value (the suite's own
  // `$XDG_DATA_HOME`, say) cannot reach the child; an empty string would
  // still count as set.
  for (const key of unset) delete childEnv[key]
  return run(cmd, cwd, childEnv)
}

async function run(
  cmd: string[],
  cwd: string,
  env: Record<string, string | undefined>,
): Promise<SpawnResult> {
  const proc = Bun.spawn(cmd, { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { stdout, stderr, exitCode }
}

/**
 * The sandbox environment for `root`, the parent env of every oracle run (and
 * of a cospec run that must match it): color forcing stripped, `NO_COLOR=1`,
 * `OPENSPEC_TELEMETRY=0`, and HOME, the XDG config/data/state/cache dirs,
 * CODEX_HOME and ZDOTDIR redirected under `root/.oracle-home`, and
 * `EDITOR`/`VISUAL` set to `true`. The binary itself runs under
 * `buildWrappedSpawnEnv(oracleEnv(root))`, as cospec's child does when cospec
 * is handed this env. Exported (and re-exported by the contract oracle) so a
 * differential test can hand cospec the identical environment.
 */
export function oracleEnv(root: string): Record<string, string> {
  const home = join(root, '.oracle-home')
  const dirs = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_CACHE_HOME: join(home, '.cache'),
    CODEX_HOME: join(home, '.codex'),
    ZDOTDIR: home,
    // The pinned binary's home skills root reads `USERPROFILE` before `HOME`, so a `USERPROFILE`
    // exported by the host would point a home-scoped tool outside this sandbox.
    USERPROFILE: home,
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  return {
    ...envWithoutColorForcing(),
    NO_COLOR: '1',
    OPENSPEC_TELEMETRY: '0',
    // A terminal-handover leaf (`config edit`) that does run must return at
    // once and edit nothing, never open a real editor on the test machine.
    EDITOR: 'true',
    VISUAL: 'true',
    // `HOME` above hides any real `~/.gitconfig`, so `store setup`'s initial
    // commit (`git.js` `assertGitCommitIdentity`) falls back to Git's own
    // username+hostname auto-detection. That fallback is host-dependent: it
    // reads the OS user's GECOS full name and needs a hostname Git accepts as
    // a mail domain, both of which a plain Linux CI runner account typically
    // lacks (empty GECOS, a bare container hostname), where a macOS account
    // usually has both — so the same row passes on a dev machine and fails
    // with `store_git_identity_missing` in CI. Setting the identity directly
    // makes every sandboxed run deterministic across hosts.
    GIT_AUTHOR_NAME: 'cospec test',
    GIT_AUTHOR_EMAIL: 'cospec-test@example.invalid',
    GIT_COMMITTER_NAME: 'cospec test',
    GIT_COMMITTER_EMAIL: 'cospec-test@example.invalid',
    ...dirs,
  }
}

/**
 * Run the pinned binary the way cospec's wrapped calls do (`spawnRaw` in
 * `src/core/openspec.ts`): the running executable on the package bin, under
 * `buildWrappedSpawnEnv`. The parent env is a private `oracleEnv` sandbox,
 * made for this one run and removed after it, so the binary never reads or
 * writes the real HOME (its `init` enumerates `~/.codex/prompts`, its global
 * config lives under XDG); `env` is applied over the sandbox, so a caller's
 * own `XDG_CONFIG_HOME` or `TZ` wins.
 */
async function runBinary(
  args: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<SpawnResult> {
  const sandbox = mkdtempSync(join(tmpdir(), 'cospec-binary-home-'))
  try {
    return await run(
      [process.execPath, openspecBinPath(), ...args],
      cwd,
      withSuiteZone(buildWrappedSpawnEnv({ ...oracleEnv(sandbox), ...env })),
    )
  } finally {
    rmSync(sandbox, { recursive: true, force: true })
  }
}

/** Run the cospec CLI from source in `cwd`. */
export function cospec(
  args: string[],
  opts: {
    cwd: string
    env?: Record<string, string>
    /** Variables the child runs without, whatever the suite's own environment holds. */
    unset?: readonly string[]
  },
): Promise<SpawnResult> {
  return spawn(['bun', CLI_ENTRY, ...args], opts.cwd, opts.env, opts.unset)
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
 * Run the real bundled openspec binary in `cwd`, as `runBinary` describes.
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
  return runBinary(['--no-color', ...args], cwd, env)
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
  return runBinary(args, cwd, env)
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

/**
 * Env pointing openspec's machine-global state (the store registry under
 * `XDG_DATA_HOME`, the global config under `XDG_CONFIG_HOME`) at fresh empty
 * dirs. Root selection hard-fails when stores are registered and no root
 * exists, so a test of the rootless path must never see stores registered on
 * the machine running it. Registered for `cleanupAll()`.
 */
export function emptyMachineStateEnv(): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-machine-'))
  activeDirs.add(dir)
  return machineStateEnv(dir)
}

function machineStateEnv(dir: string): Record<string, string> {
  return { XDG_DATA_HOME: join(dir, 'data'), XDG_CONFIG_HOME: join(dir, 'config') }
}

/**
 * Run an in-process `fn` with the `emptyMachineStateEnv()` vars applied to
 * `process.env` (wrapped spawns read it at spawn time), restoring the env and
 * removing the dirs after.
 */
export async function withEmptyMachineState<T>(fn: () => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-machine-'))
  const env = machineStateEnv(dir)
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    previous.set(key, process.env[key])
    process.env[key] = value
  }
  try {
    return await fn()
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    rmSync(dir, { recursive: true, force: true })
  }
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

/**
 * Variables a completion test must not inherit from the suite's environment
 * (design §13): the rc and config dirs an Oh My Zsh or PowerShell probe reads,
 * CI's tip suppression, and the two opt-outs the preload sets for the suite.
 */
const HOME_UNSET = [
  'ZSH',
  'ZSH_CUSTOM',
  'PSModulePath',
  'CI',
  'OPENSPEC_NO_COMPLETIONS',
  'OPENSPEC_NO_AUTO_CONFIG',
] as const

/**
 * A temporary home for a test that installs, uninstalls or prints the tip
 * (design §13). `env` holds every home-like variable under `home`; `unset` is
 * the list `cospec()` removes from the child's inherited environment. Removed
 * by `cleanup(sandbox.root)`.
 */
export interface HomeSandbox {
  readonly root: string
  readonly home: string
  readonly env: Record<string, string>
  readonly unset: readonly string[]
}

/** `path` with symlinks resolved; a missing path resolves lexically. */
function realOrResolved(path: string): string {
  try {
    return realpathSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return resolve(path)
  }
}

/**
 * Throws unless `home` resolves inside the temporary directory. Compared on
 * realpaths because macOS `tmpdir()` (`/var/folders/...`) resolves to
 * `/private/var/...`. Called before every sandboxed spawn, so a test that
 * would touch a real home fails before the child starts.
 */
export function assertTempHome(home: string | undefined): void {
  if (home === undefined || home === '') throw new Error('test HOME is unset')
  const real = realOrResolved(home)
  const temp = realOrResolved(tmpdir())
  if (real !== temp && !real.startsWith(temp + sep)) {
    throw new Error(`test HOME ${home} is outside the temporary directory ${temp}`)
  }
}

/** A fresh sandbox whose home is `<root>/home`, every home-like path under it. */
export function homeSandbox(): HomeSandbox {
  const root = mkdtempSync(join(tmpdir(), 'cospec-home-'))
  activeDirs.add(root)
  const home = join(root, 'home')
  const dirs = {
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_CACHE_HOME: join(home, '.cache'),
    CODEX_HOME: join(home, '.codex'),
  }
  for (const dir of [home, ...Object.values(dirs)]) mkdirSync(dir, { recursive: true })
  return {
    root,
    home,
    env: {
      HOME: home,
      USERPROFILE: home,
      ZDOTDIR: home,
      PROFILE: join(home, '.config', 'powershell', 'Microsoft.PowerShell_profile.ps1'),
      SHELL: '/bin/zsh',
      // Bun's transpiler cache otherwise lands under HOME (Library/Caches on
      // macOS), where the file snapshots would see it.
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, 'bun-transpiler-cache'),
      ...dirs,
    },
    unset: HOME_UNSET,
  }
}

/**
 * The env and unset list for one sandboxed child: `extra` wins over the
 * sandbox, and a variable the caller sets is never also unset.
 */
function sandboxed(
  sandbox: HomeSandbox,
  extra: { env?: Record<string, string>; unset?: readonly string[] } = {},
): { env: Record<string, string>; unset: readonly string[] } {
  const env: Record<string, string> = { ...sandbox.env, ...extra.env }
  // A caller's unset removes the sandbox's own value too (SHELL, say), so the
  // child inherits neither; it is listed for `cospec()` to delete from the
  // inherited environment as well.
  for (const key of extra.unset ?? []) delete env[key]
  assertTempHome(env.HOME)
  const unset = [...sandbox.unset, ...(extra.unset ?? [])].filter((key) => !(key in env))
  return { env, unset }
}

/** Run the cospec CLI from source under `sandbox`. */
export function homeCospec(
  sandbox: HomeSandbox,
  args: string[],
  opts: { cwd: string; env?: Record<string, string>; unset?: readonly string[] },
): Promise<SpawnResult> {
  const { env, unset } = sandboxed(sandbox, opts)
  return cospec(args, { cwd: opts.cwd, env, unset })
}

/**
 * Run the pinned openspec binary under `sandbox`, with `OPENSPEC_NO_COMPLETIONS`
 * set by the caller when a probe must stay quiet. The binary never inherits the
 * suite's environment, so only the sandbox and `env` reach it.
 */
export function homeOpenspec(
  sandbox: HomeSandbox,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): Promise<SpawnResult> {
  const { env } = sandboxed(sandbox, opts)
  return openspecRaw(args, opts.cwd, env)
}

/**
 * Whether a pseudo-terminal can be driven here. Bun's `terminal` spawn option
 * is POSIX-only, so Windows hosts skip the pty rows.
 */
export function ptyAvailable(): boolean {
  return process.platform !== 'win32'
}

/**
 * Run `cmd` under a pseudo-terminal, so the child sees a TTY on stdin, stdout
 * and stderr (the tip and the uninstall prompt both gate on one). Each
 * `answers` pair types `reply` once `prompt` has appeared in the output, so an
 * answer never lands before the child is reading (typed-ahead input can be
 * dropped when the child switches the terminal into raw mode). Output is what
 * the terminal received, stdout and stderr merged, with CRLF folded to LF.
 * Skipped where `ptyAvailable()` is false.
 */
export async function ptyRun(
  sandbox: HomeSandbox,
  cmd: string[],
  opts: {
    cwd: string
    env?: Record<string, string>
    unset?: readonly string[]
    answers?: readonly (readonly [prompt: string, reply: string])[]
  },
): Promise<{ output: string; exitCode: number }> {
  const { env, unset } = sandboxed(sandbox, opts)
  const childEnv: Record<string, string | undefined> = {
    ...envWithoutColorForcing(),
    NO_COLOR: '1',
    ...env,
  }
  for (const key of unset) delete childEnv[key]
  const chunks: Uint8Array[] = []
  const answers = [...(opts.answers ?? [])]
  let seen = ''
  const decoder = new TextDecoder()
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    env: childEnv,
    terminal: {
      cols: 100,
      rows: 40,
      data(terminal, chunk) {
        chunks.push(chunk)
        seen += decoder.decode(chunk, { stream: true })
        const next = answers[0]
        if (next !== undefined && seen.includes(next[0])) {
          answers.shift()
          terminal.write(next[1])
        }
      },
    },
  })
  const exitCode = await proc.exited
  proc.terminal?.close()
  const output = Buffer.concat(chunks).toString('utf8').replaceAll('\r\n', '\n')
  if (answers.length > 0) {
    throw new Error(`the child exited before the prompt ${JSON.stringify(answers[0]?.[0])}`)
  }
  return { output, exitCode }
}
