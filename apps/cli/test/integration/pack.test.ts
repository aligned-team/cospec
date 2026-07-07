// Pack smoke — the publish-readiness proof (DESIGN §8.3). The main
// `@aligned-team/cospec` package is a runtime-agnostic launcher plus per-platform
// optionalDependencies; it ships NO runtime source. Pack it exactly as
// `npm publish` would, install the tarball into a throwaway project WITHOUT its
// platform package, and prove the launcher fails loud and clear (the actionable
// missing-platform-package error, exit 1) instead of a stack trace or a silent
// success. The full happy path — platform binary installed, bun stripped from
// PATH, real subcommands including `init` — is pack-standalone.test.ts.

import { afterAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospecBin, mkTempRepo, REPO_ROOT, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const cliDir = join(REPO_ROOT, 'apps/cli')

function pack(destDir: string, fromDir: string = cliDir): string {
  const res = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', destDir], { cwd: fromDir })
  if (res.exitCode !== 0)
    throw new Error(`bun pm pack failed: ${new TextDecoder().decode(res.stderr)}`)
  const tgz = readdirSync(destDir).find((f) => f.endsWith('.tgz'))
  if (tgz === undefined) throw new Error('no tarball produced by bun pm pack')
  return join(destDir, tgz)
}

describe('pack smoke', () => {
  test('main tarball installs; launcher without a platform package fails with the actionable error', async () => {
    const packDir = mkTempRepo()
    const tarball = pack(packDir)

    // A clean consumer project that installs only the main tarball. Optional
    // deps are omitted EXPLICITLY: the platform packages are live on npm since
    // v0.1.1, so a default install would resolve the real host binary from the
    // registry and never hit the missing-platform-package branch under test.
    const consumer = mkTempRepo()
    writeFiles(consumer, {
      'package.json': '{\n  "name": "pack-smoke",\n  "version": "1.0.0",\n  "private": true\n}\n',
    })
    const install = Bun.spawnSync(['bun', 'add', '--omit=optional', tarball], { cwd: consumer })
    expect(install.exitCode).toBe(0)

    const bin = join(consumer, 'node_modules/.bin/cospec')
    expect(existsSync(bin)).toBe(true)

    // No platform package installed → the launcher must exit 1 with the
    // actionable error naming the exact platform package it looked for.
    const res = await cospecBin(bin, ['--version'], { cwd: consumer })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('@aligned-team/cospec-')
    expect(res.stderr).toContain('is not installed')

    // The launcher ships no runtime source: the tarball must not contain src/.
    expect(existsSync(join(consumer, 'node_modules/@aligned-team/cospec/src'))).toBe(false)
    expect(existsSync(join(consumer, 'node_modules/@aligned-team/cospec/bin/cospec.js'))).toBe(true)
  }, 120_000)

  test('npm publish --dry-run accepts the tarball and lists its key files', async () => {
    // Pack from a copy stamped with a never-publishable smoke version: npm's
    // dry-run still checks the registry, and the repo's manifest version is
    // (or lags) a live release, so packing the real version would fail with
    // "cannot publish over the previously published versions". The copy holds
    // exactly the shipped `files` set, so the contents listing under test is
    // the same. `--tag smoke` is required for any prerelease version; the
    // tarball path must be absolute or npm parses it as a git specifier.
    const smokeVersion = '0.0.0-smoke.0'
    const manifest = (await Bun.file(join(cliDir, 'package.json')).json()) as {
      name: string
      version: string
    }
    const stamped = mkTempRepo()
    for (const entry of ['bin', 'README.md', 'LICENSE']) {
      cpSync(join(cliDir, entry), join(stamped, entry), { recursive: true })
    }
    writeFileSync(
      join(stamped, 'package.json'),
      JSON.stringify(
        {
          ...((await Bun.file(join(cliDir, 'package.json')).json()) as object),
          version: smokeVersion,
        },
        null,
        2,
      ),
    )
    const packDir = mkTempRepo()
    const tarball = pack(packDir, stamped)

    // `npm publish --dry-run` makes no network mutation and needs no auth —
    // verified empirically: it warns "requires you to be logged in" but still
    // exits 0 and prints the full contents listing. It writes the manifest
    // summary and contents listing to stderr; stdout only carries the final
    // `+ name@version` confirmation line.
    const res = Bun.spawnSync(['npm', 'publish', '--dry-run', '--tag', 'smoke', tarball], {
      cwd: packDir,
      env: { ...process.env, NO_COLOR: '1' },
    })
    const stdout = new TextDecoder().decode(res.stdout)
    const stderr = new TextDecoder().decode(res.stderr)
    expect(res.exitCode, stderr).toBe(0)

    expect(stdout).toContain(`${manifest.name}@${smokeVersion}`)
    expect(stderr).toContain(manifest.name)
    expect(stderr).toContain(smokeVersion)

    // Contents listing must include the files a broken `files` glob would drop.
    // No src/ — the package ships only the launcher; the runtime is the
    // per-platform compiled binaries.
    for (const file of ['bin/cospec.js', 'package.json', 'README.md', 'LICENSE']) {
      expect(stderr).toContain(file)
    }
    expect(stderr).not.toContain('src/index.ts')
  }, 120_000)
})
