// The upstream oracle: the pinned OpenSpec binary run on a scratch root, so a
// contract test can ask "what does upstream answer for this argv?" at test
// time instead of hand-typing a probed copy of the answer.
//
// The API is deliberately four functions and later changes' differential
// tests reuse them, so keep it small:
//
// - `scaffoldOracleRoot()` makes a temp root that `openspec init` has scaffolded.
// - `oracle(argv, root)` runs the binary and returns stdout/stderr/exit code.
// - `oracleJson(argv, root)` does the same and requires stdout to be exactly one
//   JSON document.
// - `oracleEnv(root)` is the environment both of those use, for handing a
//   cospec run the identical environment in a differential.
//
// Every run uses the same environment: color forcing stripped and `NO_COLOR=1`
// (the `test/fixtures/support.ts` discipline), `OPENSPEC_TELEMETRY=0`, and a
// private HOME/XDG sandbox per root. The sandbox matters because
// `openspec init` reads machine-global state (it enumerates
// `~/.codex/prompts`, for one), so a run against the real HOME can differ
// between machines and could touch the developer's own files.
//
// argv reaches the binary untouched. Unlike `openspec()` in support.ts, no
// leading `--no-color` is prepended, because a pre-command token such as
// `--store-path /x list` is only meaningful when nothing else precedes it.

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

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
 * The environment every oracle run (and a cospec run that must match it) uses
 * for `root`: color forcing stripped, `NO_COLOR=1`, `OPENSPEC_TELEMETRY=0`, and
 * HOME plus the XDG config/data/cache dirs redirected under `root/.oracle-home`.
 * Exported so a differential test can hand cospec the identical environment.
 */
export function oracleEnv(root: string): Record<string, string> {
  const home = join(root, '.oracle-home')
  const dirs = {
    HOME: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_CACHE_HOME: join(home, '.cache'),
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  return {
    ...envWithoutColorForcing(),
    NO_COLOR: '1',
    OPENSPEC_TELEMETRY: '0',
    ...dirs,
  }
}

/**
 * Run the pinned binary (resolved by package path, never `$PATH`) with `argv`
 * verbatim in `root`, under `oracleEnv(root)`.
 */
export async function oracle(argv: string[], root: string): Promise<OracleRun> {
  const proc = Bun.spawn(['bun', openspecBinPath(), ...argv], {
    cwd: root,
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    env: oracleEnv(root),
  })
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
export async function oracleJson(argv: string[], root: string): Promise<OracleJsonRun> {
  const run = await oracle(argv, root)
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
