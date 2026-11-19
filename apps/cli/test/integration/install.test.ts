// `cospec install [version]`: the command-level run, through the real CLI under a
// temporary home. The installer is served from a local http server
// (`COSPEC_INSTALLER_BASE` accepts http to localhost only), so no test reaches the
// network, GitHub, or the real home. The fake installer records the version and
// install directory it was handed; the refusal tests assert the server saw no
// request at all, which is what "refused before any work" means here.

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import '../../src/commands/install.ts'

import {
  cleanup,
  homeCospec,
  type HomeSandbox,
  homeSandbox,
  REPO_ROOT,
} from '../fixtures/support.ts'

const CLEARED = ['COSPEC_VERSION', 'COSPEC_INSTALL_DIR', 'COSPEC_INSTALLER_BASE'] as const
const hasDownloader = Bun.which('curl') !== null || Bun.which('wget') !== null
const download = hasDownloader && process.platform !== 'win32' ? test : test.skip

const sandboxes: HomeSandbox[] = []
const scratch: string[] = []
const requests: string[] = []
let server: ReturnType<typeof Bun.serve>
let base = ''
/** What `GET /install.sh` answers; each test sets it. */
let installer = ''
let installerStatus = 200

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const path = new URL(req.url).pathname
      requests.push(path)
      if (path === '/install.sh' && installerStatus === 200) return new Response(installer)
      return new Response('not found', { status: installerStatus === 200 ? 404 : installerStatus })
    },
  })
  base = `http://127.0.0.1:${server.port}`
})

afterAll(() => {
  void server.stop(true)
})

afterEach(() => {
  requests.length = 0
  installerStatus = 200
  for (const sb of sandboxes.splice(0)) cleanup(sb.root)
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sandbox(): HomeSandbox {
  const sb = homeSandbox()
  sandboxes.push(sb)
  return sb
}

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cospec-install-'))
  scratch.push(dir)
  return dir
}

/** A fake installer that writes one `name=value` line per variable it was handed. */
function recorder(log: string): string {
  return `#!/bin/sh
{
  echo "version=\${COSPEC_VERSION-<unset>}"
  echo "dir=\${COSPEC_INSTALL_DIR-<unset>}"
  echo "argc=$#"
} > '${log}'
echo "fake installer ran"
`
}

function install(
  sb: HomeSandbox,
  args: string[],
  env: Record<string, string> = {},
): ReturnType<typeof homeCospec> {
  return homeCospec(sb, ['install', ...args], {
    cwd: sb.root,
    env: { COSPEC_INSTALLER_BASE: base, ...env },
    unset: CLEARED.filter((key) => key !== 'COSPEC_INSTALLER_BASE' && !(key in env)),
  })
}

function recorded(log: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
    const at = line.indexOf('=')
    out[line.slice(0, at)] = line.slice(at + 1)
  }
  return out
}

describe('cospec install runs the release installer it downloads', () => {
  download('with no version it fetches install.sh and sets no COSPEC_VERSION', async () => {
    const log = join(scratchDir(), 'seen.txt')
    installer = recorder(log)
    const res = await install(sandbox(), [])
    expect(res.exitCode).toBe(0)
    expect(requests).toEqual(['/install.sh'])
    expect(res.stdout).toContain('fake installer ran')
    expect(res.stdout).toContain("Check with 'cospec version'; it shows (standalone).")
    // Run from source, cospec is not a standalone install, so no directory is chosen for it.
    expect(recorded(log)).toEqual({ version: '<unset>', dir: '<unset>', argc: '0' })
  })

  download('a version operand reaches the installer as COSPEC_VERSION, v stripped', async () => {
    const cases = [
      ['1.2.3', '1.2.3'],
      ['v1.2.3', '1.2.3'],
      ['0.12.0-rc.1', '0.12.0-rc.1'],
      ['latest', '<unset>'],
    ] as const
    // One shared installer script; each run records into its own log.
    installer = `#!/bin/sh
echo "version=\${COSPEC_VERSION-<unset>}" > "$COSPEC_TEST_LOG"
`
    const logs = cases.map(() => join(scratchDir(), 'seen.txt'))
    const results = await Promise.all(
      cases.map(([operand], i) => install(sandbox(), [operand], { COSPEC_TEST_LOG: logs[i]! })),
    )
    for (const [i, [, expected]] of cases.entries()) {
      expect(results[i]!.exitCode).toBe(0)
      expect(recorded(logs[i]!).version).toBe(expected)
    }
  })

  download('the caller’s COSPEC_INSTALL_DIR is passed through untouched', async () => {
    const dir = scratchDir()
    const log = join(dir, 'seen.txt')
    installer = recorder(log)
    const target = join(dir, 'bin')
    const res = await install(sandbox(), ['1.2.3'], { COSPEC_INSTALL_DIR: target })
    expect(res.exitCode).toBe(0)
    expect(recorded(log)).toMatchObject({ version: '1.2.3', dir: target })
  })

  download(
    'a failing installer’s exit code is the command’s, with the installer named',
    async () => {
      installer = '#!/bin/sh\necho "installer says no" >&2\nexit 7\n'
      const res = await install(sandbox(), ['1.2.3'])
      expect(res.exitCode).toBe(7)
      expect(res.stderr).toContain('installer says no')
      expect(res.stderr).toContain(
        `cospec install: the standalone install did not finish (installer: ${base}/install.sh).`,
      )
      expect(res.stdout).not.toContain('Check with')
    },
  )

  download(
    'an installer that cannot be downloaded fails the command, running nothing',
    async () => {
      installer = recorder(join(scratchDir(), 'never.txt'))
      installerStatus = 404
      const res = await install(sandbox(), [])
      expect(res.exitCode).not.toBe(0)
      expect(res.stderr).toContain('the standalone install did not finish')
      expect(res.stdout).not.toContain('fake installer ran')
    },
  )

  download('the real install.sh, given a release with no archive, installs nothing', async () => {
    const dir = scratchDir()
    const releases = join(dir, 'releases')
    mkdirSync(join(releases, 'download', 'v9.9.9'), { recursive: true })
    const target = join(dir, 'bin')
    installer = readFileSync(join(REPO_ROOT, 'scripts', 'install', 'install.sh'), 'utf8')
    const res = await install(sandbox(), ['9.9.9'], {
      COSPEC_RELEASE_BASE: releases,
      COSPEC_INSTALL_DIR: target,
    })
    expect(res.exitCode).not.toBe(0)
    expect(requests).toEqual(['/install.sh'])
    expect(res.stderr).toContain('cospec-install:')
    expect(res.stderr).toContain('the standalone install did not finish')
    expect(existsSync(target) ? readdirSync(target) : []).toEqual([])
  })
})

describe('cospec install refuses before it fetches anything', () => {
  const refusedVersions = ['1.2', 'next', '1.2.3; rm -rf /', '$(id)', '--force']
  for (const version of refusedVersions) {
    test(`not a release version: ${JSON.stringify(version)}`, async () => {
      const operand = version.startsWith('-') ? ['--', version] : [version]
      const res = await install(sandbox(), operand)
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain(`cospec install: not a release version: ${version}.`)
      expect(requests).toEqual([])
    })
  }

  const refusedBases = [
    ['plain http to a remote host', 'http://example.com/releases'],
    ['http to a lookalike of localhost', 'http://localhost.example.com'],
    ['a user part', 'https://user@example.com/releases'],
    ['another scheme', 'ftp://example.com/releases'],
    ['not a URL', 'not a url'],
  ] as const
  for (const [label, value] of refusedBases) {
    test(`COSPEC_INSTALLER_BASE: ${label}`, async () => {
      const res = await install(sandbox(), [], { COSPEC_INSTALLER_BASE: value })
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain('cospec install: COSPEC_INSTALLER_BASE')
      expect(requests).toEqual([])
    })
  }

  test('--json is refused with exactly one document on stdout, exit 1', async () => {
    const res = await install(sandbox(), ['--json'])
    expect(res.exitCode).toBe(1)
    const lines = res.stdout.trim().split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!)).toEqual({
      version: 1,
      command: 'install',
      ok: false,
      message: 'cospec install runs the release installer and cannot emit JSON',
    })
    expect(requests).toEqual([])
  })

  test('--store is an unknown option, as on every command that never reads a root', async () => {
    const res = await install(sandbox(), ['--store', 'main'])
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("cospec install: unknown option '--store'")
    expect(requests).toEqual([])
  })

  test('an extra operand is refused', async () => {
    const res = await install(sandbox(), ['1.2.3', '1.2.4'])
    expect(res.exitCode).toBe(1)
    expect(requests).toEqual([])
  })
})
