// What the test run guarantees about the machine it runs on: no suite reads or writes the real
// home directory, and so none can depend on the config of whoever runs it. `isolate-machine-state.ts`
// (the bunfig preload) establishes it, and `support-machine-isolation.test.ts` checks it.

import { realpathSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** Where the preload leaves the real homes it found, for the guard test and its own hook. */
export const REAL_HOMES_KEY = Symbol.for('cospec.test.real-homes')

/** The variables the preload points at the sandbox, in the form they had when the run started. */
export const STARTED_ENV_KEY = Symbol.for('cospec.test.started-env')

export const SANDBOXED_KEYS = [
  'HOME',
  'USERPROFILE',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'CODEX_HOME',
] as const

/**
 * The current environment with the sandboxed variables put back as the run started with them
 * (unset stays unset). For a child that runs a HOST tool (`jq`, `oxfmt`, `git`) whose resolution
 * depends on the real home: a mise shim finds its version and its trust list there. Pass it to
 * nothing that is cospec's own code under test, which must stay over the sandbox.
 */
export function hostToolEnv(): Record<string, string | undefined> {
  const started = (globalThis as { [STARTED_ENV_KEY]?: Record<string, string | undefined> })[
    STARTED_ENV_KEY
  ]
  const env: Record<string, string | undefined> = { ...process.env }
  if (started === undefined) return env
  for (const key of SANDBOXED_KEYS) env[key] = started[key]
  return env
}

/**
 * `path` with symlinks resolved. A path that does not exist resolves through its nearest
 * existing ancestor, since macOS `tmpdir()` (`/var/folders/...`) is `/private/var/...` for real.
 */
function real(path: string): string {
  const abs = resolve(path)
  try {
    return realpathSync(abs)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const parent = dirname(abs)
    return parent === abs ? abs : join(real(parent), basename(abs))
  }
}

/** True when `path` is `root` or lies inside it, compared on resolved paths. */
export function isUnder(path: string, root: string): boolean {
  const a = real(path)
  const b = real(root)
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep)
}

/**
 * The directories that are a real person's home: the account's own home directory and the
 * `HOME`/`USERPROFILE` the run was started with (`started`). One that contains the temporary
 * directory (`HOME=/tmp`, say) is no home to keep out of, and is left out.
 */
export function realHomes(started: { HOME?: string; USERPROFILE?: string }): string[] {
  const candidates = [userInfo().homedir, started.HOME, started.USERPROFILE]
  const homes = candidates.filter((p): p is string => p !== undefined && p !== '' && p !== '/')
  return [...new Set(homes.map(real))].filter((home) => !isUnder(tmpdir(), home))
}

/**
 * The machine-global OpenSpec config file under `env`, as the pinned binary resolves it
 * (`getGlobalConfigDir`): `$XDG_CONFIG_HOME/openspec`, else `$HOME/.config/openspec`. Bun's
 * `os.homedir()` is the home the process started with whatever `$HOME` later says, which is why
 * the preload replaces it; this reads `$HOME` itself.
 */
export function globalConfigPath(env: Record<string, string | undefined>): string {
  const xdg = env.XDG_CONFIG_HOME
  const base = xdg !== undefined && xdg !== '' ? xdg : join(env.HOME ?? '', '.config')
  return join(base, 'openspec', 'config.json')
}

/** Throws when the global config file `env` resolves to lies inside one of `homes`. */
export function assertGlobalConfigOffRealHome(
  env: Record<string, string | undefined>,
  homes: readonly string[],
): void {
  const path = globalConfigPath(env)
  for (const home of homes) {
    if (isUnder(path, home)) {
      throw new Error(
        `the global config path ${path} lies under the real home ${home}; ` +
          'a test must run over the sandbox the bunfig preload installs ' +
          '(apps/cli/test/fixtures/isolate-machine-state.ts), never the real home',
      )
    }
  }
}
