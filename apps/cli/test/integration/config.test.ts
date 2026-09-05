// `cospec config <sub>` (DESIGN §1, ledger rows 1.3–1.6, 1.8). `XDG_CONFIG_HOME`
// is sandboxed per test so this suite never reads or writes the developer's
// real machine-global OpenSpec config (`~/.config/openspec/config.json`).

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, cospec, mkTempRepo } from '../fixtures/support.ts'

afterAll(cleanupAll)

function sandbox(): { cwd: string; env: Record<string, string> } {
  const workspace = mkTempRepo()
  const xdg = join(workspace, 'xdg')
  mkdirSync(xdg, { recursive: true })
  return { cwd: workspace, env: { XDG_CONFIG_HOME: xdg, OPENSPEC_TELEMETRY: '0' } }
}

describe('cospec config path/list/get (Class A, piped)', () => {
  test('path prints the machine-global config.json path', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'path'], { cwd, env })
    expect(res.exitCode).toBe(0)
    expect(res.stdout.trim()).toContain(join('openspec', 'config.json'))
  })

  test('list --json is one parseable document containing profile and delivery', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'list', '--json'], { cwd, env })
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout) as { profile: string; delivery: string }
    expect(typeof body.profile).toBe('string')
    expect(typeof body.delivery).toBe('string')
  })

  test('get on an unset key: exit 1, empty stdout (text mode)', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'get', 'defaultStore'], { cwd, env })
    expect(res.exitCode).toBe(1)
    expect(res.stdout.trim()).toBe('')
  })

  test('get on an unset key with --json: found:false, value:null, exit 1, one document', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'get', 'defaultStore', '--json'], { cwd, env })
    expect(res.exitCode).toBe(1)
    const lines = res.stdout.trim().split('\n')
    expect(lines.length).toBe(1)
    const body = JSON.parse(lines[0]!) as {
      version: number
      command: string
      key: string
      value: unknown
      found: boolean
    }
    expect(body).toEqual({
      version: 1,
      command: 'config get',
      key: 'defaultStore',
      value: null,
      found: false,
    })
  })

  test('set then get round-trips a scalar value as a raw string', async () => {
    const { cwd, env } = sandbox()
    const set = await cospec(['config', 'set', 'defaultStore', 'some-store'], { cwd, env })
    expect(set.exitCode).toBe(0)

    const got = await cospec(['config', 'get', 'defaultStore', '--json'], { cwd, env })
    expect(got.exitCode).toBe(0)
    const body = JSON.parse(got.stdout) as { value: string; found: boolean }
    expect(body.found).toBe(true)
    expect(body.value).toBe('some-store')

    const listed = await cospec(['config', 'list', '--json'], { cwd, env })
    const listBody = JSON.parse(listed.stdout) as { defaultStore: string }
    expect(listBody.defaultStore).toBe('some-store')
  })

  test('unset removes a previously-set key', async () => {
    const { cwd, env } = sandbox()
    await cospec(['config', 'set', 'defaultStore', 'temp-store'], { cwd, env })
    const unset = await cospec(['config', 'unset', 'defaultStore'], { cwd, env })
    expect(unset.exitCode).toBe(0)

    const got = await cospec(['config', 'get', 'defaultStore', '--json'], { cwd, env })
    expect(got.exitCode).toBe(1)
    expect((JSON.parse(got.stdout) as { found: boolean }).found).toBe(false)
  })
})

describe('cospec config — the two precedence notes', () => {
  test('set telemetry.enabled true succeeds AND prints the forced-env note on stderr', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'set', 'telemetry.enabled', 'true'], { cwd, env })
    expect(res.exitCode).toBe(0)
    expect(res.stderr).toContain('OPENSPEC_TELEMETRY=0')
    expect(res.stderr).toContain("bare 'openspec' runs only")
  })

  test('--json stdout stays exactly one document even though a note went to stderr', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'set', 'telemetry.enabled', 'true', '--json'], {
      cwd,
      env,
    })
    expect(res.exitCode).toBe(0)
    const lines = res.stdout.trim().split('\n')
    expect(lines.length).toBe(1)
    expect(JSON.parse(lines[0]!).ok).toBe(true)
    expect(res.stderr).toContain('OPENSPEC_TELEMETRY=0')
  })

  test('set profile <preset> prints the harness-canon note', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'set', 'profile', 'core'], { cwd, env })
    expect(res.exitCode).toBe(0)
    expect(res.stderr).toContain('cospec update')
    expect(res.stderr).toContain("not 'openspec update'")
  })

  test('an unrelated key gets no notes on stderr', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'set', 'defaultStore', 'x'], { cwd, env })
    expect(res.exitCode).toBe(0)
    expect(res.stderr.trim()).toBe('')
  })

  test('a failed mutation prints no note (notes are success-only)', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'set', 'telemetry.enabled', 'not-a-bool'], { cwd, env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).not.toContain('OPENSPEC_TELEMETRY=0')
  })
})

describe('cospec config — --store never applies (machine-global, no store dimension)', () => {
  test('--store x config list exits 1 with the named message; no wrapped spawn', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', '--store', 'x', 'list'], { cwd, env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('--store does not apply')
    expect(res.stderr).toContain('OpenSpec config is machine-global')
    expect(res.stderr).toContain('--scope global')
  })
})

describe('cospec config — --scope hoisting through the real wrapped binary', () => {
  test('--scope global is accepted and behaves like the default (real binary)', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', '--scope', 'global', 'list', '--json'], { cwd, env })
    expect(res.exitCode).toBe(0)
    expect(() => JSON.parse(res.stdout)).not.toThrow()
  })

  test('a non-global scope relays upstream\'s own "not yet implemented" error verbatim', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', '--scope', 'project', 'list'], { cwd, env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr.toLowerCase()).toContain('not yet implemented')
  })
})

describe('cospec config — usage errors', () => {
  test('no subcommand is a usage error listing all eight subcommands', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config'], { cwd, env })
    expect(res.exitCode).toBe(1)
    for (const sub of ['path', 'list', 'get', 'set', 'unset', 'reset', 'edit', 'profile'])
      expect(res.stderr).toContain(sub)
  })

  test('an unknown subcommand is a usage error, not a wrapped spawn', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'frobnicate'], { cwd, env })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain("unknown subcommand 'frobnicate'")
  })
})

describe('cospec config edit / reset (Class B, terminal handover)', () => {
  test('edit with EDITOR=true opens and returns 0 (no file mutation needed to succeed)', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'edit'], { cwd, env: { ...env, EDITOR: 'true' } })
    expect(res.exitCode).toBe(0)
  }, 15_000)

  test('edit --json is refused as interactive-and-cannot-emit-JSON, exit 1, one document', async () => {
    const { cwd, env } = sandbox()
    const res = await cospec(['config', 'edit', '--json'], { cwd, env: { ...env, EDITOR: 'true' } })
    expect(res.exitCode).toBe(1)
    const lines = res.stdout.trim().split('\n')
    expect(lines.length).toBe(1)
    const body = JSON.parse(lines[0]!) as { ok: boolean; message: string }
    expect(body.ok).toBe(false)
    expect(body.message).toContain('interactive')
  })

  test('reset --all -y is piped (Class A), not a handover, and succeeds', async () => {
    const { cwd, env } = sandbox()
    await cospec(['config', 'set', 'defaultStore', 'to-be-reset'], { cwd, env })
    const res = await cospec(['config', 'reset', '--all', '-y'], { cwd, env })
    expect(res.exitCode).toBe(0)

    const got = await cospec(['config', 'get', 'defaultStore', '--json'], { cwd, env })
    expect((JSON.parse(got.stdout) as { found: boolean }).found).toBe(false)
  })
})
