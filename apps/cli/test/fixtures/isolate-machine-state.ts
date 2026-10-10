// Preloaded by every `bun test` run through `bunfig.toml` (the repo root's and this package's),
// so a run started without flags is as isolated as the mise tasks.
//
// 1. The completion tip: in-process `run()` calls inherit the test runner's stderr, a terminal
//    when a person runs the suite, so the tip would write the machine-global config of whoever
//    runs it. The tip's own unit tests inject their environment and never read this.
// 2. The machine: `init`, `update` and `doctor` read the machine-global OpenSpec config (the
//    workflow profile, `defaultStore`) at the path `openspec config path` prints, from
//    `XDG_CONFIG_HOME` else `HOME`. `HOME` and `USERPROFILE` and the XDG and Codex directories
//    point at a private sandbox, so no run reads, or depends on, the config of whoever runs
//    it. A test that wants a profile sets `XDG_CONFIG_HOME` itself.
// 3. A guard: before every test, the global config path the environment resolves to must lie
//    outside the real home. A test that deletes or reassigns those variables and does not
//    restore them fails the next test, not a later machine.

import { beforeEach, mock } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import osDefault, * as nodeOs from 'node:os'
import { join } from 'node:path'

import { assertGlobalConfigOffRealHome, REAL_HOMES_KEY, realHomes } from './machine-isolation.ts'

const registry = globalThis as { [REAL_HOMES_KEY]?: readonly string[] }

// A second load (a `--preload` flag beside the bunfig's) must not sandbox the sandbox.
if (registry[REAL_HOMES_KEY] === undefined) {
  process.env.OPENSPEC_NO_COMPLETIONS = '1'

  const homes = realHomes({ HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE })
  registry[REAL_HOMES_KEY] = homes
  const root = mkdtempSync(join(nodeOs.tmpdir(), 'cospec-test-machine-'))
  const home = join(root, 'home')
  const dirs = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(root, 'config'),
    XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state'),
    CODEX_HOME: join(home, '.codex'),
  }
  for (const dir of Object.values(dirs)) mkdirSync(dir, { recursive: true })
  Object.assign(process.env, dirs)

  // Bun's `os.homedir()` is the home the process started with, whatever `process.env.HOME` is
  // assigned afterwards, so every in-process `homedir()` call (the completion and schema
  // readers, the legacy prompts fallback) would still read the real one. Replaced for ESM
  // imports (the module mock) and for `require` (the patched export object).
  const homedir = (): string => process.env.HOME ?? home
  const realOs = { ...nodeOs }
  ;(osDefault as { homedir: () => string }).homedir = homedir
  mock.module('node:os', () => ({
    ...realOs,
    homedir,
    default: { ...osDefault, homedir },
  }))
  process.on('exit', () => {
    rmSync(root, { recursive: true, force: true })
  })

  assertGlobalConfigOffRealHome(process.env, homes)
  beforeEach(() => assertGlobalConfigOffRealHome(process.env, homes))
}
