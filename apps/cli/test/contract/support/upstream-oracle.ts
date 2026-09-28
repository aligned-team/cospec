// The upstream oracle: the pinned OpenSpec binary run on a scratch root, so a
// contract test can ask "what does upstream answer for this argv?" at test
// time instead of hand-typing a probed copy of the answer.
//
// The API is deliberately five functions and later changes' differential
// tests reuse them, so keep it small:
//
// - `scaffoldOracleRoot()` makes a temp root that `openspec init` has scaffolded.
// - `oracle(argv, root)` runs the binary and returns stdout/stderr/exit code.
// - `oracleJson(argv, root)` does the same and requires stdout to be exactly one
//   JSON document.
// - `oracleEnv(root)` is the sandbox environment both of those run from, for
//   handing a cospec run the identical environment in a differential.
// - `oracleSpawn(argv, root)` is the command, cwd and env a run spawns, so the
//   spawn discipline below is testable (`../upstream-oracle.test.ts`).
//
// The binary runs the way cospec's own wrapped calls run it (`spawnRaw` in
// `src/core/openspec.ts`), so the oracle and the product share a runtime: the
// running executable (`process.execPath`, Bun under `bun test`) on the
// package's `bin/openspec.js`, under `buildWrappedSpawnEnv` — the product's
// `WRAPPED_ENV` (`NO_COLOR`, `BUN_BE_BUN`, `OPENSPEC_TELEMETRY=0`,
// `OPENSPEC_NO_COMPLETIONS=1`) over the parent env minus every color-forcing
// key. The parent env is `oracleEnv(root)`: a private HOME/XDG sandbox per
// root, which matters because `openspec init` reads machine-global state (it
// enumerates `~/.codex/prompts`, for one), so a run against the real HOME can
// differ between machines and could touch the developer's own files. A cospec
// run handed `oracleEnv(root)` spawns its binary under exactly the env the
// oracle's child sees.
//
// argv reaches the binary untouched — the one deliberate difference from
// `spawnRaw`, which prepends `--no-color`: a pre-command token such as
// `--store-path /x list` is only meaningful when nothing else precedes it
// (`NO_COLOR=1` already turns color off).
//
// Bun drops one `--` that directly follows the script path, so an argv whose
// first token is `--` never reaches the binary under Bun. `{ runtime: 'node' }`
// runs it under Node instead (the `mise.toml` pin, tests and CI only — cospec
// itself never runs Node), which delivers a leading `--` intact, as a user's
// `openspec -- list` does. Use it for exactly those rows; every other row runs
// under Bun, as cospec's wrapped calls do.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildWrappedSpawnEnv } from '../../../src/core/openspec.ts'
import { envWithoutColorForcing, mkTempRepo, openspecBinPath } from '../../fixtures/support.ts'

/** What one oracle run observed. */
export interface OracleRun {
  exitCode: number
  stdout: string
  stderr: string
}

/** What one `--json` oracle run observed; `json` is the parsed stdout document. */
export interface OracleJsonRun {
  exitCode: number
  json: unknown
  stderr: string
}

/**
 * The sandbox environment for `root`, the parent env of every oracle run (and
 * of a cospec run that must match it): color forcing stripped, `NO_COLOR=1`,
 * `OPENSPEC_TELEMETRY=0`, and HOME, the XDG config/data/state/cache dirs,
 * CODEX_HOME and ZDOTDIR redirected under `root/.oracle-home`, and
 * `EDITOR`/`VISUAL` set to `true`. The binary itself runs under
 * `buildWrappedSpawnEnv(oracleEnv(root))` (`oracleSpawn`), as cospec's child
 * does when cospec is handed this env. Exported so a differential test can
 * hand cospec the identical environment.
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

/** Which runtime executes the pinned binary's `bin/openspec.js`, and where. */
export interface OracleOptions {
  runtime?: 'bun' | 'node'
  /**
   * The directory the binary runs in, when it is not `root` itself (a
   * subdirectory, or a directory elsewhere in the same sandbox). The
   * environment is still `oracleEnv(root)`.
   */
  cwd?: string
}

/** The command, cwd and env one oracle run spawns. */
export interface OracleSpawn {
  cmd: string[]
  cwd: string
  env: Record<string, string | undefined>
}

/**
 * What `oracle(argv, root, opts)` spawns: the pinned binary (resolved by
 * package path, never `$PATH`) under the running executable — as `spawnRaw`
 * does — or under `node` from PATH for `{ runtime: 'node' }`, with `argv`
 * untouched, in `root` (or `opts.cwd`), under
 * `buildWrappedSpawnEnv(oracleEnv(root))`.
 */
export function oracleSpawn(argv: string[], root: string, opts: OracleOptions = {}): OracleSpawn {
  let interpreter = process.execPath
  if (opts.runtime === 'node') {
    const node = Bun.which('node')
    if (node === null)
      throw new Error('oracle: `node` is not on PATH, so the binary cannot run under Node')
    interpreter = node
  }
  return {
    cmd: [interpreter, openspecBinPath(), ...argv],
    cwd: opts.cwd ?? root,
    env: buildWrappedSpawnEnv(oracleEnv(root)),
  }
}

/**
 * Run the pinned binary with `argv` as `oracleSpawn` describes. Under Node
 * every token arrives verbatim; under Bun (the default) a leading `--` is
 * dropped.
 */
export async function oracle(
  argv: string[],
  root: string,
  opts: OracleOptions = {},
): Promise<OracleRun> {
  const { cmd, cwd, env } = oracleSpawn(argv, root, opts)
  const proc = Bun.spawn(cmd, { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr }
}

/**
 * Run `argv` through the pinned binary and parse stdout as one JSON document.
 * Throws when stdout is not exactly one JSON document, so a caller never
 * compares against a partial or absent payload.
 */
export async function oracleJson(
  argv: string[],
  root: string,
  opts: OracleOptions = {},
): Promise<OracleJsonRun> {
  const run = await oracle(argv, root, opts)
  let json: unknown
  try {
    json = JSON.parse(run.stdout)
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err
    throw new Error(
      `oracle: \`openspec ${argv.join(' ')}\` did not print one JSON document ` +
        `(exit ${run.exitCode}); stdout: ${JSON.stringify(run.stdout.slice(0, 400))}`,
      { cause: err },
    )
  }
  return { exitCode: run.exitCode, json, stderr: run.stderr }
}

/**
 * A fresh temp root scaffolded by `openspec init --tools none --no-animation .`
 * (registered with `cleanupAll()` from support.ts). Throws when the scaffold
 * does not exit 0 or leaves no `openspec/` directory, since every oracle answer
 * after that would describe a broken fixture rather than upstream.
 */
export async function scaffoldOracleRoot(): Promise<string> {
  const root = mkTempRepo()
  const run = await oracle(['init', '--tools', 'none', '--no-animation', '.'], root)
  const probe = Bun.file(join(root, 'openspec', 'config.yaml'))
  if (run.exitCode !== 0 || !(await probe.exists()))
    throw new Error(
      `oracle: scaffolding ${root} failed (exit ${run.exitCode}); stderr: ${run.stderr.slice(0, 400)}`,
    )
  return root
}
