// Pack smoke — the publish-readiness proof (DESIGN §8.3). Pack the CLI exactly
// as `npm publish` would, install the tarball into a throwaway project, and drive
// the installed `cospec` binary: version, then an init from the packaged copy
// (canon ships in `files`, so init works with zero build step).

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
  test('tarball installs and the installed cospec runs init', async () => {
    const packDir = mkTempRepo()
    const tarball = pack(packDir)

    // A clean consumer project that installs only the tarball.
    const consumer = mkTempRepo()
    writeFiles(consumer, {
      'package.json': '{\n  "name": "pack-smoke",\n  "version": "1.0.0",\n  "private": true\n}\n',
    })
    const install = Bun.spawnSync(['bun', 'add', tarball], { cwd: consumer })
    expect(install.exitCode).toBe(0)

    const bin = join(consumer, 'node_modules/.bin/cospec')
    expect(existsSync(bin)).toBe(true)

    // `cospec --version` needs no wrapped openspec call. Compare against the
    // manifest (not a literal) so the release pipeline's post-bump run of this
    // suite still passes at the freshly stamped version.
    const expected = ((await Bun.file(join(cliDir, 'package.json')).json()) as { version: string })
      .version
    const version = await cospecBin(bin, ['--version'], { cwd: consumer })
    expect(version.exitCode).toBe(0)
    expect(version.stdout.trim()).toBe(expected)

    // `cospec init` from the installed copy: canon shipped in the tarball.
    const target = mkTempRepo({ fixture: 'fresh', git: true })
    const init = await cospecBin(bin, ['init', '--harness', 'none', '--no-gate', '--yes'], {
      cwd: target,
    })
    expect(init.exitCode).toBe(0)
    expect(existsSync(join(target, 'openspec/schemas/feat/schema.yaml'))).toBe(true)
  }, 120_000)
})
