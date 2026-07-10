/**
 * Tests for the `release:set-version` task script
 * (scripts/mise-tasks/release/set-version).
 *
 * cospec ships as ONE versioned npm package (`@aligned-team/cospec`); the
 * release workflow computes the next semver with cocogitto and then calls
 * this script to stamp that version into `apps/cli/package.json`, the matching
 * workspace entry in `bun.lock`, and the cospec pin in the commit-gate template
 * `apps/cli/src/canon/gate/mise.toml.tpl` — the root `package.json` stays
 * `private`/`0.0.0` and must never be touched. These tests run the script
 * against a throwaway copy of just those manifests (via its `--root` flag,
 * so the real working tree is never touched) and assert the version lands
 * correctly, the root manifest is untouched, a second run is a byte-for-byte
 * no-op (idempotent), and a bad version arg is rejected.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

// Absolute path to the script under test and the repo root it lives in.
const SCRIPT = new URL('../../scripts/mise-tasks/release/set-version', import.meta.url).pathname
const REPO_ROOT = new URL('../../', import.meta.url).pathname

const ROOT_PACKAGE = 'package.json'
const CLI_PACKAGE = 'apps/cli/package.json'
const BUN_LOCK = 'bun.lock'
const GATE_TPL = 'apps/cli/src/canon/gate/mise.toml.tpl'

/** The pinned cospec version in the gate mise.toml template (anchored at col 0). */
const gateTplCospecVersion = (text: string): string | undefined =>
  text.match(/^"npm:@aligned-team\/cospec" = "([^"]+)"/m)?.[1]

/** The seven per-platform binary packages the main manifest pins (Linux split by libc). */
const PLATFORMS = [
  'linux-x64-gnu',
  'linux-x64-musl',
  'linux-arm64-gnu',
  'linux-arm64-musl',
  'darwin-x64',
  'darwin-arm64',
  'win32-x64',
] as const
const platformPackage = (p: string): string => `apps/cli/npm/${p}/package.json`

/** The cospec workspace entry's version in bun.lock (JSONC — parsed by line). */
const lockCospecVersion = (text: string): string | undefined => {
  const lines = text.split('\n')
  let inCospec = false
  for (const line of lines) {
    if (line.includes('"name": "@aligned-team/cospec"')) inCospec = true
    if (inCospec) {
      const m = line.match(/^\s*"version": "([^"]+)",$/)
      if (m) return m[1]
    }
  }
  return undefined
}

/** Run the script against `root`, return its exit code + captured output. */
async function runScript(
  version: string,
  root: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bash', SCRIPT, version, '--root', root], {
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env },
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  return { exitCode, stdout, stderr }
}

describe('release:set-version', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cospec-set-version-'))
    for (const rel of [
      ROOT_PACKAGE,
      CLI_PACKAGE,
      BUN_LOCK,
      GATE_TPL,
      ...PLATFORMS.map(platformPackage),
    ]) {
      const dest = join(root, rel)
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(join(REPO_ROOT, rel), dest)
    }
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('stamps the target version into apps/cli/package.json', async () => {
    const target = '9.9.9'
    const { exitCode, stderr } = await runScript(target, root)
    expect(stderr).toBe('')
    expect(exitCode).toBe(0)

    const cli = JSON.parse(readFileSync(join(root, CLI_PACKAGE), 'utf8'))
    expect(cli.version).toBe(target)
  })

  test('stamps the workspace version recorded in bun.lock', async () => {
    const target = '9.9.9'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    const lock = readFileSync(join(root, BUN_LOCK), 'utf8')
    expect(lockCospecVersion(lock)).toBe(target)
  })

  test('stamps every per-platform package.json .version', async () => {
    const target = '9.9.9'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    for (const p of PLATFORMS) {
      const pkg = JSON.parse(readFileSync(join(root, platformPackage(p)), 'utf8'))
      expect(pkg.version).toBe(target)
    }
  })

  test('repins the main package optionalDependencies to the target version', async () => {
    const target = '9.9.9'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    const cli = JSON.parse(readFileSync(join(root, CLI_PACKAGE), 'utf8'))
    for (const p of PLATFORMS) {
      expect(cli.optionalDependencies[`@aligned-team/cospec-${p}`]).toBe(target)
    }
  })

  test('repins the optionalDependencies recorded in bun.lock', async () => {
    const target = '9.9.9'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    const lock = readFileSync(join(root, BUN_LOCK), 'utf8')
    for (const p of PLATFORMS) {
      expect(lock).toContain(`"@aligned-team/cospec-${p}": "${target}",`)
    }
  })

  test('stamps the cospec pin in the gate mise.toml template', async () => {
    const target = '9.9.9'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    const tpl = readFileSync(join(root, GATE_TPL), 'utf8')
    expect(gateTplCospecVersion(tpl)).toBe(target)
  })

  test('gate template stamp is idempotent — a second run makes no change', async () => {
    const target = '9.9.9'
    await runScript(target, root)
    const first = readFileSync(join(root, GATE_TPL), 'utf8')
    const { exitCode, stdout } = await runScript(target, root)
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('updated:')
    expect(readFileSync(join(root, GATE_TPL), 'utf8')).toBe(first)
  })

  test('fails loudly when the gate template is missing', async () => {
    rmSync(join(root, GATE_TPL), { force: true })
    const { exitCode, stderr } = await runScript('9.9.9', root)
    expect(exitCode).toBe(1)
    expect(stderr).toContain('expected file not found')
  })

  test('fails loudly when a platform manifest is missing', async () => {
    rmSync(join(root, platformPackage('darwin-arm64')), { force: true })
    const { exitCode, stderr } = await runScript('9.9.9', root)
    expect(exitCode).toBe(1)
    expect(stderr).toContain('expected file not found')
  })

  test('never touches the root package.json (stays private/0.0.0)', async () => {
    await runScript('9.9.9', root)

    const rootPkg = JSON.parse(readFileSync(join(root, ROOT_PACKAGE), 'utf8'))
    expect(rootPkg.version).toBe('0.0.0')
    expect(rootPkg.private).toBe(true)
  })

  test('is idempotent — a second run makes no byte-level change', async () => {
    const target = '9.9.9'
    await runScript(target, root)
    const first = readFileSync(join(root, CLI_PACKAGE), 'utf8')

    const { exitCode, stdout } = await runScript(target, root)
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain('updated:')

    const second = readFileSync(join(root, CLI_PACKAGE), 'utf8')
    expect(second).toBe(first)
  })

  test('accepts a prerelease semver', async () => {
    const target = '9.9.9-rc.1'
    const { exitCode } = await runScript(target, root)
    expect(exitCode).toBe(0)
    const cli = JSON.parse(readFileSync(join(root, CLI_PACKAGE), 'utf8'))
    expect(cli.version).toBe(target)
  })

  test('rejects a non-semver version and leaves files untouched', async () => {
    const before = readFileSync(join(root, CLI_PACKAGE), 'utf8')
    const tplBefore = readFileSync(join(root, GATE_TPL), 'utf8')
    const { exitCode, stderr } = await runScript('v1.2', root)
    expect(exitCode).toBe(2)
    expect(stderr).toContain('not a valid semver')
    expect(readFileSync(join(root, CLI_PACKAGE), 'utf8')).toBe(before)
    expect(readFileSync(join(root, GATE_TPL), 'utf8')).toBe(tplBefore)
  })

  test('rejects missing version argument', async () => {
    const proc = Bun.spawn(['bash', SCRIPT, '--root', root], {
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
    expect(exitCode).toBe(2)
    expect(stderr).toContain('missing <version>')
  })
})
