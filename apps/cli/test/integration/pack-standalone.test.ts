// The "not bun-exclusive" regression gate. cospec publishes a runtime-agnostic
// launcher (`@aligned-team/cospec`) plus one `bun build --compile` binary per
// platform (`@aligned-team/cospec-<platform>`). This test proves a Node-only
// consumer — bun stripped from PATH — can `npm install` the launcher + the host
// platform package and run the compiled binary: version, then a real
// subcommand that exercises command dispatch (the compiled binary previously
// bundled zero command modules and reported every subcommand unimplemented).
//
// Only the host platform can be built + run locally; the other four targets and
// mise github-backend autodetection are cross-platform and verified in the
// release matrix (see openspec verification rows 4.x).

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

import { cleanupAll, mkTempRepo, REPO_ROOT, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const cliDir = join(REPO_ROOT, 'apps/cli')

/** Host platform-package dir name + compiled binary name (mirrors the launcher). */
function hostPlatform(): { dir: string; binName: string } {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'win32') return { dir: 'win32-x64', binName: 'cospec.exe' }
  if (process.platform === 'darwin') return { dir: `darwin-${arch}`, binName: 'cospec' }
  // Linux is libc-split (same probe as the launcher): glibc reports
  // glibcVersionRuntime in process.report; musl does not.
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined
  const libc = report?.header?.glibcVersionRuntime === undefined ? 'musl' : 'gnu'
  return { dir: `linux-${arch}-${libc}`, binName: 'cospec' }
}

/**
 * PATH with bun removed but node (the launcher's shebang interpreter) kept.
 * If `node` and `bun` share a directory (e.g. Homebrew, some mise layouts),
 * keeping that whole directory would put `bun` back on PATH, so a shim
 * directory containing only a `node` symlink stands in for it instead.
 */
function bunlessPath(): string {
  const nodePath = Bun.which('node')
  if (nodePath === null) throw new Error('node not found — required for the bun-less smoke')
  const nodeDir = dirname(nodePath)
  const nodeEntry =
    Bun.which('bun', { PATH: nodeDir }) === null
      ? nodeDir
      : (() => {
          const shimDir = mkTempRepo()
          symlinkSync(nodePath, join(shimDir, 'node'))
          return shimDir
        })()
  const kept = (process.env.PATH ?? '')
    .split(delimiter)
    .filter((p) => p.length > 0 && Bun.which('bun', { PATH: p }) === null)
  return [nodeEntry, ...kept, '/usr/bin', '/bin'].join(delimiter)
}

function run(
  cmd: string[],
  cwd: string,
  path: string,
): { code: number; stdout: string; stderr: string } {
  const res = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, PATH: path, NO_COLOR: '1' },
  })
  return {
    code: res.exitCode,
    stdout: new TextDecoder().decode(res.stdout),
    stderr: new TextDecoder().decode(res.stderr),
  }
}

describe('standalone pack smoke (bun-less)', () => {
  test('Node-only consumer installs launcher + platform binary and runs a real subcommand', async () => {
    const npm = Bun.which('npm')
    if (npm === null) {
      // npm is guaranteed in CI (setup-node) but may be absent on a bun-only dev
      // box; skip rather than fail so `mise run check` stays runnable there.
      console.warn('npm not on PATH — skipping bun-less standalone smoke')
      return
    }

    const { dir: platformDir, binName } = hostPlatform()
    const version = ((await Bun.file(join(cliDir, 'package.json')).json()) as { version: string })
      .version

    // 1. Assemble the host platform package: template manifest + compiled binary.
    const platformPkg = mkTempRepo()
    writeFiles(platformPkg, {
      'package.json': await Bun.file(join(cliDir, 'npm', platformDir, 'package.json')).text(),
    })
    mkdirSync(join(platformPkg, 'bin'), { recursive: true })
    const compile = Bun.spawnSync(
      ['bun', 'build', '--compile', 'src/index.ts', '--outfile', join(platformPkg, 'bin', binName)],
      { cwd: cliDir },
    )
    expect(compile.exitCode, new TextDecoder().decode(compile.stderr)).toBe(0)
    expect(existsSync(join(platformPkg, 'bin', binName))).toBe(true)

    // The platform package ships the bundled openspec's MIT/ISC notices next to
    // the binary that embeds them (license compliance) — mirror release.yml's
    // copy so the packed tarball is exactly what publish uploads.
    cpSync(join(cliDir, 'THIRD-PARTY-LICENSES.md'), join(platformPkg, 'THIRD-PARTY-LICENSES.md'))

    // 2. Pack both packages exactly as `npm publish` would.
    const platformTgz = packNpm(npm, platformPkg)
    const mainTgz = packBun(cliDir)

    // 3. Node-only install: bun stripped from PATH, optional deps omitted so npm
    //    never reaches for the four cross-platform packages (not published yet).
    const path = bunlessPath()
    expect(Bun.which('bun', { PATH: path })).toBeNull()

    const consumer = mkTempRepo()
    writeFiles(consumer, {
      'package.json':
        '{\n  "name": "standalone-smoke",\n  "version": "1.0.0",\n  "private": true\n}\n',
    })
    const install = run(
      [npm, 'install', mainTgz, platformTgz, '--omit=optional', '--no-audit', '--no-fund'],
      consumer,
      path,
    )
    expect(install.code, install.stderr).toBe(0)

    const bin = join(consumer, 'node_modules', '.bin', 'cospec')
    expect(existsSync(bin)).toBe(true)

    // The redistributed openspec bundle's license notices must land on disk with
    // the installed platform package (a broken `files` glob would drop them).
    expect(
      existsSync(
        join(
          consumer,
          'node_modules',
          '@aligned-team',
          `cospec-${platformDir}`,
          'THIRD-PARTY-LICENSES.md',
        ),
      ),
    ).toBe(true)

    // 4. Run on Node only: version, then real subcommands (dispatch + embedded
    //    canon, no wrapped openspec call, no bun).
    const ver = run([bin, '--version'], consumer, path)
    expect(ver.code, ver.stderr).toBe(0)
    expect(ver.stdout.trim()).toBe(version)

    const target = mkTempRepo({ git: true })
    const list = run([bin, 'list'], target, path)
    expect(list.code, list.stderr).toBe(0)
    expect(list.stdout).toContain('No active changes')

    // `init` is the README quickstart and exercises the embedded canon (the
    // compiled binary has no canon/ directory on disk — a regression here means
    // `bun build --compile` stopped embedding the canon assets). The gate is
    // left ON (state A defaults it on) so the gate .tpl templates are read from
    // $bunfs too — they are embedded canon just like the schemas, and reading
    // them via a stale on-disk path is the exact standalone `init` regression.
    const init = run([bin, 'init', '--harness', 'none', '--yes'], target, path)
    expect(init.code, init.stderr).toBe(0)
    expect(existsSync(join(target, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
    expect(existsSync(join(target, 'commitlint.config.mjs'))).toBe(true)

    // `new` spawns the WRAPPED openspec binary: proves the compiled executable
    // resolves the consumer-installed @fission-ai/openspec dependency and runs
    // it via BUN_BE_BUN=1 self-spawn — the full bun-less wrapped-call path.
    // openspec must be reachable from the target repo, so link the consumer's
    // node_modules into it (as a real project installing cospec would have).
    symlinkSync(join(consumer, 'node_modules'), join(target, 'node_modules'))
    const created = run([bin, 'new', 'chore', 'smoke-change'], target, path)
    expect(created.code, created.stderr).toBe(0)
    expect(existsSync(join(target, 'openspec/changes/smoke-change/.openspec.yaml'))).toBe(true)

    // `config`, `completion`, and `feedback` must dispatch from the compiled
    // binary too (not just from `bun run src/index.ts`) — literal `import()`
    // bundling is the trap that silently drops a command module (module
    // header of `COMMAND_MODULES`), so each of these proves its module made it
    // into the compiled artifact.
    const configPath = run([bin, 'config', 'path'], target, path)
    expect(configPath.code, configPath.stderr).toBe(0)
    expect(configPath.stdout.trim().length).toBeGreaterThan(0)

    const completionZsh = run([bin, 'completion', 'zsh'], target, path)
    expect(completionZsh.code, completionZsh.stderr).toBe(0)
    expect(completionZsh.stdout).toContain('#compdef cospec')

    const feedbackHelp = run([bin, 'feedback', '--help'], target, path)
    expect(feedbackHelp.code, feedbackHelp.stderr).toBe(0)
    expect(feedbackHelp.stdout).toContain('feedback')
  }, 180_000)

  // The "fully self-contained" gate. NO npm install, NO node_modules anywhere,
  // NO bun on PATH — just the compiled binary in a fresh temp dir. Every
  // wrapped call must resolve via the EMBEDDED openspec bundle (extracted to a
  // temp XDG_CACHE_HOME and self-spawned via BUN_BE_BUN=1). This is the exact
  // `mise use github:aligned-team/cospec && cospec init && cospec new …` flow.
  test('standalone binary runs wrapped calls via the embedded bundle (no node_modules)', async () => {
    const { binName } = hostPlatform()
    const binDir = mkTempRepo()
    const bin = join(binDir, binName)
    const compile = Bun.spawnSync(['bun', 'build', '--compile', 'src/index.ts', '--outfile', bin], {
      cwd: cliDir,
    })
    expect(compile.exitCode, new TextDecoder().decode(compile.stderr)).toBe(0)

    const path = bunlessPath()
    expect(Bun.which('bun', { PATH: path })).toBeNull()

    // Per-run cache so the embedded bundle is extracted here (asserted below),
    // not read from a warm ~/.cache left by a previous run. A fresh HOME makes
    // this a genuine first-run: it exercises the wrapped tool's first-run
    // telemetry notice, which prints to stdout and would corrupt `--json` reads
    // unless cospec opts the wrapped calls out (OPENSPEC_TELEMETRY=0).
    const cache = mkTempRepo()
    const home = mkTempRepo()
    const target = mkTempRepo({ git: true })
    const env = (cmd: string[]) =>
      Bun.spawnSync(cmd, {
        cwd: target,
        env: { ...process.env, HOME: home, PATH: path, NO_COLOR: '1', XDG_CACHE_HOME: cache },
      })

    // No openspec resolvable: binDir has no node_modules, target has no
    // node_modules, and $bunfs (import.meta.dir) misses — so every wrapped call
    // below MUST come from the embedded bundle.
    const init = env([bin, 'init', '--harness', 'none', '--yes'])
    expect(init.exitCode, new TextDecoder().decode(init.stderr)).toBe(0)

    const created = env([bin, 'new', 'feat', 'demo'])
    expect(created.exitCode, new TextDecoder().decode(created.stderr)).toBe(0)
    expect(existsSync(join(target, 'openspec/changes/demo/.openspec.yaml'))).toBe(true)

    // A fresh feat change is incomplete, so `validate --strict` returns a
    // validation verdict (exit 1), and `apply` is blocked on missing artifacts
    // (exit 2). Both are the WRAPPED tool's own structured outcomes — proof the
    // embedded openspec ran; a resolution failure would surface a different
    // error and none of the expected validation/gate text.
    const validated = env([bin, 'validate', 'demo', '--strict'])
    const validateOut = new TextDecoder().decode(validated.stdout)
    expect([0, 1]).toContain(validated.exitCode)
    expect(validateOut).toContain('demo')

    const applied = env([bin, 'apply', 'demo'])
    // apply gate: 0 clear / 2 blocked / 3 soft-blocked — all are gate verdicts
    // that only compute after the wrapped instructions call runs.
    expect([0, 2, 3]).toContain(applied.exitCode)

    // Post-condition: the embedded bundle was extracted into the per-version
    // cache — proof the calls above went through the embedded path, not a
    // stray node_modules copy.
    const extracted = readdirSync(join(cache, 'cospec')).find((d) => d.startsWith('openspec-'))
    expect(extracted, 'embedded openspec bundle was not extracted').toBeDefined()
    expect(existsSync(join(cache, 'cospec', extracted!, 'vendor', 'bin', 'openspec.js'))).toBe(true)
  }, 180_000)
})

function packBun(dir: string): string {
  const out = mkTempRepo()
  const res = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', out], { cwd: dir })
  if (res.exitCode !== 0)
    throw new Error(`bun pm pack failed: ${new TextDecoder().decode(res.stderr)}`)
  const tgz = readdirSync(out).find((f) => f.endsWith('.tgz'))
  if (tgz === undefined) throw new Error('no tarball produced by bun pm pack')
  return join(out, tgz)
}

function packNpm(npm: string, dir: string): string {
  const res = Bun.spawnSync([npm, 'pack', '--pack-destination', dir], { cwd: dir })
  if (res.exitCode !== 0)
    throw new Error(`npm pack failed: ${new TextDecoder().decode(res.stderr)}`)
  const tgz = readdirSync(dir).find((f) => f.endsWith('.tgz'))
  if (tgz === undefined) throw new Error('no tarball produced by npm pack')
  return join(dir, tgz)
}
