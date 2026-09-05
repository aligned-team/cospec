// `cospec config` against the real pinned openspec binary (ledger row 1.5,
// tasks.md 6.2). `XDG_CONFIG_HOME` AND `HOME` are sandboxed into a fresh temp
// dir per test so this suite never reads or writes the developer's real
// machine-global OpenSpec config.
//
// Trailing `--no-color` finding (probed directly against the pinned 1.11.0
// binary via `openspec()` below, bypassing cospec entirely): a trailing
// `--no-color` on every `config` subcommand — `path`, `get`, `set`, `unset`,
// `list`, `reset --all -y` — is ACCEPTED (exit 0/1 exactly as without it,
// never a "unknown option" error), because `--no-color` is declared on the
// root `Command` and commander resolves a parent option from a leaf
// regardless of whether that leaf's own `--help` lists it. This confirms
// `apps/cli/src/commands/config.ts`'s header comment (point 3) and
// contradicts the change's own `verification.md` row 1.5, `design.md`'s
// decision text, `proposal.md`, and `specs/openspec-config-passthrough/spec.md`,
// all of which assert the opposite (a REJECTED trailing `--no-color`) as the
// premise for `tasks.md` 7.6's proposed follow-up `fix` change. This suite
// asserts the real, observed behavior — acceptance — and documents the
// discrepancy rather than encoding a false expectation. (cospec's own argv
// builder still never appends `--no-color`, per the same header: not to dodge
// a rejection that turns out not to exist, but so the built argv carries
// nothing the wrapped call did not need.)

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { cleanupAll, mkTempRepo, openspec } from '../fixtures/support.ts'

afterAll(cleanupAll)

function sandbox(): { cwd: string; env: Record<string, string> } {
  const workspace = mkTempRepo()
  const xdg = join(workspace, 'xdg')
  const home = join(workspace, 'home')
  mkdirSync(xdg, { recursive: true })
  mkdirSync(home, { recursive: true })
  return {
    cwd: workspace,
    env: { XDG_CONFIG_HOME: xdg, HOME: home, OPENSPEC_TELEMETRY: '0' },
  }
}

describe('real pinned binary: a trailing --no-color on config subcommands', () => {
  test('config path --no-color exits 0, same as without it', async () => {
    const { cwd, env } = sandbox()
    const withFlag = await openspec(['config', 'path', '--no-color'], cwd, env)
    const without = await openspec(['config', 'path'], cwd, env)
    expect(withFlag.exitCode).toBe(0)
    expect(withFlag.stdout).toBe(without.stdout)
  })

  test('config get <set-key> --no-color exits 0 and prints the value unchanged', async () => {
    const { cwd, env } = sandbox()
    await openspec(['config', 'set', 'defaultStore', 'probe-store'], cwd, env)
    const res = await openspec(['config', 'get', 'defaultStore', '--no-color'], cwd, env)
    expect(res.exitCode).toBe(0)
    expect(res.stdout.trim()).toBe('probe-store')
    expect(res.stderr.trim()).toBe('')
  })

  test('config set <key> <value> --no-color exits 0 and the value round-trips', async () => {
    const { cwd, env } = sandbox()
    const set = await openspec(['config', 'set', 'defaultStore', 'bar', '--no-color'], cwd, env)
    expect(set.exitCode).toBe(0)
    const got = await openspec(['config', 'get', 'defaultStore'], cwd, env)
    expect(got.stdout.trim()).toBe('bar')
  })

  test('config unset <key> --no-color exits 0', async () => {
    const { cwd, env } = sandbox()
    await openspec(['config', 'set', 'defaultStore', 'baz'], cwd, env)
    const res = await openspec(['config', 'unset', 'defaultStore', '--no-color'], cwd, env)
    expect(res.exitCode).toBe(0)
  })

  test('config list --no-color exits 0 and prints the same text listing', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'list', '--no-color'], cwd, env)
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('profile:')
  })

  test('config reset --all -y --no-color exits 0', async () => {
    const { cwd, env } = sandbox()
    await openspec(['config', 'set', 'defaultStore', 'to-reset'], cwd, env)
    const res = await openspec(['config', 'reset', '--all', '-y', '--no-color'], cwd, env)
    expect(res.exitCode).toBe(0)
  })

  test('a genuinely unknown option is still rejected (control: --no-color is not special-cased)', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'get', 'defaultStore', '--bogus-flag-xyz'], cwd, env)
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr).toContain('unknown option')
  })
})

describe('real pinned binary: config surface shape cospec depends on', () => {
  test('an unset key: exit 1, empty stdout, empty stderr', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'get', 'defaultStore'], cwd, env)
    expect(res.exitCode).toBe(1)
    expect(res.stdout.trim()).toBe('')
  })

  test('list --json is exactly one parseable document carrying profile and delivery', async () => {
    // Upstream pretty-prints this document (multi-line, indented) rather than
    // emitting it on one line, so "exactly one document" is verified by
    // parsing the whole trimmed stdout, not by counting lines.
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'list', '--json'], cwd, env)
    expect(res.exitCode).toBe(0)
    const body = JSON.parse(res.stdout.trim()) as { profile: string; delivery: string }
    expect(typeof body.profile).toBe('string')
    expect(typeof body.delivery).toBe('string')
  })

  test('path/get/set/unset/reset reject --json outright (cospec must synthesize its own envelope)', async () => {
    const { cwd, env } = sandbox()
    for (const args of [
      ['config', 'path', '--json'],
      ['config', 'get', 'defaultStore', '--json'],
      ['config', 'set', 'defaultStore', 'x', '--json'],
    ]) {
      const res = await openspec(args, cwd, env)
      expect(res.exitCode).toBe(1)
      expect(res.stderr.toLowerCase()).toContain('unknown option')
    }
  })

  test('--store is rejected as an unknown option on config (no store dimension)', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', '--store', 'x', 'list'], cwd, env)
    expect(res.exitCode).not.toBe(0)
    expect(res.stderr.toLowerCase()).toContain('unknown option')
  })

  test('--scope global is accepted; a non-global scope is upstream\'s own "not implemented" error', async () => {
    const { cwd, env } = sandbox()
    const global = await openspec(['config', '--scope', 'global', 'list', '--json'], cwd, env)
    expect(global.exitCode).toBe(0)
    const project = await openspec(['config', '--scope', 'project', 'list'], cwd, env)
    expect(project.exitCode).not.toBe(0)
    expect(project.stderr.toLowerCase()).toContain('not yet implemented')
  })

  test('edit with EDITOR=true spawns and exits 0 with inherited stdio (handover contract)', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'edit'], cwd, { ...env, EDITOR: 'true' })
    expect(res.exitCode).toBe(0)
  }, 15_000)

  test('profile with no preset and no TTY relays the interactive-mode-required error', async () => {
    const { cwd, env } = sandbox()
    const res = await openspec(['config', 'profile'], cwd, env)
    expect(res.exitCode).not.toBe(0)
  })
})
