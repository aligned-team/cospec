// Sandbox builder for the root-resolution differential matrix
// (`../root-resolution.test.ts`), on top of the shared oracle
// (`upstream-oracle.ts`): every sandbox is an `oracleEnv` root, so the pinned
// binary, cospec's CLI and the in-process resolver all run under the one
// environment `oracleEnv(dir)` returns — its own `HOME`, `XDG_DATA_HOME` (the
// store registry) and `XDG_CONFIG_HOME` (the global config holding
// `defaultStore`), so none of them ever sees the real machine's stores. What
// stays here is what the shared oracle has no equivalent for: stores
// registered and `defaultStore` set through the pinned binary itself (never by
// writing its registry or config files by hand), a run from any directory of
// the sandbox read as the selected root or its diagnostic, and the in-process
// environment and stderr capture.

import { join } from 'node:path'

import { mkTempRepo } from '../../fixtures/support.ts'
import { oracle, oracleEnv, oracleJson, type OracleRun as UpstreamRun } from './upstream-oracle.ts'

export interface Sandbox {
  /** Sandbox directory as `tmpdir()` spells it (not canonicalized). */
  dir: string
  /** `$HOME` under the sandbox (`oracleEnv(dir).HOME`). */
  home: string
  env: Record<string, string>
}

/** One entry of the pinned binary's `status: [...]` diagnostic envelope. */
export interface OracleDiagnostic {
  severity: string
  code: string
  message: string
  target?: string
  fix?: string
}

/** The pinned binary's selected root, as `list --json` / `status --json` report it. */
export interface OracleRoot {
  path: string
  source: string
  store_id?: string
}

export interface OracleRun {
  exitCode: number
  stderr: string
  root: OracleRoot | null
  /** `status[0]` when the binary failed, else undefined. */
  diagnostic: OracleDiagnostic | undefined
}

function assertOk(label: string, res: UpstreamRun): void {
  if (res.exitCode !== 0)
    throw new Error(`${label} exited ${res.exitCode}\nstdout: ${res.stdout}\nstderr: ${res.stderr}`)
}

/** Default store location inside a sandbox. */
export function storePath(sb: Sandbox, id: string): string {
  return join(sb.dir, 'stores', id)
}

/** `openspec store setup <id> --path <path> --no-init-git` in the sandbox. */
export async function setupStore(
  sb: Sandbox,
  id: string,
  path = storePath(sb, id),
): Promise<string> {
  const res = await oracle(
    ['store', 'setup', id, '--path', path, '--no-init-git', '--json'],
    sb.dir,
  )
  assertOk(`openspec store setup ${id}`, res)
  return path
}

/** `openspec config set defaultStore <id>` in the sandbox's global config. */
export async function setDefaultStore(sb: Sandbox, id: string): Promise<void> {
  assertOk(
    `openspec config set defaultStore ${id}`,
    await oracle(['config', 'set', 'defaultStore', id], sb.dir),
  )
}

/**
 * A fresh sandbox with `stores` registered through the pinned binary (default:
 * `alpha` and `beta` at `<dir>/stores/<id>`; pass `[]` for no stores).
 */
export async function makeSandbox(stores: readonly string[] = ['alpha', 'beta']): Promise<Sandbox> {
  const dir = mkTempRepo()
  const env = oracleEnv(dir)
  const sb: Sandbox = { dir, home: env['HOME']!, env }
  for (const id of stores) await setupStore(sb, id)
  return sb
}

/**
 * Run the pinned binary in `cwd` (anywhere in the sandbox) under the sandbox
 * env and read its single JSON document as the selected root, or the
 * diagnostic it failed with. `args` must carry `--json`.
 */
export async function rootOracle(sb: Sandbox, cwd: string, args: string[]): Promise<OracleRun> {
  const run = await oracleJson(args, sb.dir, { cwd })
  const body = run.json as { root?: OracleRoot | null; status?: OracleDiagnostic[] }
  return {
    exitCode: run.exitCode,
    stderr: run.stderr,
    root: body.root ?? null,
    diagnostic: run.exitCode !== 0 ? body.status?.[0] : undefined,
  }
}

/**
 * Run `fn` with the sandbox env applied to `process.env`, for an in-process call
 * whose wrapped spawns read `process.env` at spawn time.
 */
export async function withSandboxEnv<T>(sb: Sandbox, fn: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(sb.env)) {
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
  }
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown }

/**
 * Run `fn` collecting everything written through `process.stderr.write`, keeping
 * the output whether `fn` resolves or throws (the caller decides which throws
 * are expected).
 */
export async function captureStderr<T>(
  fn: () => Promise<T>,
): Promise<{ outcome: Settled<T>; stderr: string }> {
  const original = process.stderr.write.bind(process.stderr)
  const decoder = new TextDecoder()
  let stderr = ''
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    stderr += typeof chunk === 'string' ? chunk : decoder.decode(chunk)
    return true
  }) as typeof process.stderr.write
  let outcome: Settled<T>
  try {
    outcome = { ok: true, value: await fn() }
  } catch (error) {
    outcome = { ok: false, error }
  } finally {
    process.stderr.write = original
  }
  return { outcome, stderr }
}
