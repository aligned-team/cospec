// Pack smoke — the publish-readiness proof (DESIGN §8.3). The main
// `@aligned-team/cospec` package is a runtime-agnostic launcher plus per-platform
// optionalDependencies; it ships NO runtime source. Pack it exactly as
// `npm publish` would, install the tarball into a throwaway project WITHOUT its
// platform package, and prove the launcher fails loud and clear (the actionable
// missing-platform-package error, exit 1) instead of a stack trace or a silent
// success. The full happy path — platform binary installed, bun stripped from
// PATH, real subcommands including `init` — is pack-standalone.test.ts.

import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospecBin, mkTempRepo, REPO_ROOT, writeFiles } from '../fixtures/support.ts'

afterAll(cleanupAll)

const cliDir = join(REPO_ROOT, 'apps/cli')

function pack(destDir: string): string {
  const res = Bun.spawnSync(['bun', 'pm', 'pack', '--destination', destDir], { cwd: cliDir })
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

    // A clean consumer project that installs only the main tarball. The
    // platform optionalDependencies are unpublished/absent here, so the
    // launcher must hit its missing-platform-package branch.
    const consumer = mkTempRepo()
    writeFiles(consumer, {
      'package.json': '{\n  "name": "pack-smoke",\n  "version": "1.0.0",\n  "private": true\n}\n',
    })
    const install = Bun.spawnSync(['bun', 'add', tarball], { cwd: consumer })
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
    const packDir = mkTempRepo()
    const tarball = pack(packDir)

    // `npm publish --dry-run` makes no network mutation and needs no auth —
    // verified empirically: it warns "requires you to be logged in" but still
    // exits 0 and prints the full contents listing, even with the registry
    // unreachable (proxy env pointed at a closed port). It writes the
    // manifest summary and contents listing to stderr; stdout only carries
    // the final `+ name@version` confirmation line.
    const res = Bun.spawnSync(['npm', 'publish', '--dry-run', tarball], {
      cwd: packDir,
      env: { ...process.env, NO_COLOR: '1' },
    })
    const stdout = new TextDecoder().decode(res.stdout)
    const stderr = new TextDecoder().decode(res.stderr)
    expect(res.exitCode).toBe(0)

    const manifest = (await Bun.file(join(cliDir, 'package.json')).json()) as {
      name: string
      version: string
    }
    expect(stdout).toContain(`${manifest.name}@${manifest.version}`)
    expect(stderr).toContain(manifest.name)
    expect(stderr).toContain(manifest.version)

    // Contents listing must include the files a broken `files` glob would drop.
    for (const file of ['bin/cospec.js', 'package.json', 'README.md', 'LICENSE', 'src/index.ts']) {
      expect(stderr).toContain(file)
    }
  }, 120_000)
})
