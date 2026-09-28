// `cospec workset <sub>` — disciplined passthrough of `openspec workset
// create|list|remove`, plus a terminal-handover smoke test for `workset open`
// (WI-4). Worksets are a purely local/personal registry (added in openspec 1.5.0), keyed
// by a machine-global XDG_DATA_HOME location, never `openspec/`-tree-scoped —
// each test sandboxes its own registry so runs never collide or leak.

import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { respellRemedies } from '../../src/core/remedies.ts'
import { cleanupAll, cospec, mkTempRepo, openspecRaw } from '../fixtures/support.ts'

afterAll(cleanupAll)

function sandbox(): { cwd: string; env: Record<string, string> } {
  const workspace = mkTempRepo()
  const member = join(workspace, 'member')
  mkdirSync(member, { recursive: true })
  const xdg = join(workspace, 'xdg')
  return {
    cwd: member,
    env: { XDG_DATA_HOME: xdg, OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_COMPLETIONS: '1' },
  }
}

describe('cospec workset', () => {
  test('create then list shows the new workset', async () => {
    const { cwd, env } = sandbox()

    const created = await cospec(['workset', 'create', 'demo', '--member', '.', '--json'], {
      cwd,
      env,
    })
    expect(created.exitCode).toBe(0)
    const createdBody = JSON.parse(created.stdout) as { workset: { name: string } }
    expect(createdBody.workset.name).toBe('demo')

    const listed = await cospec(['workset', 'list', '--json'], { cwd, env })
    expect(listed.exitCode).toBe(0)
    const listedBody = JSON.parse(listed.stdout) as { worksets: Array<{ name: string }> }
    expect(listedBody.worksets.map((w) => w.name)).toContain('demo')

    // `ls` is the same subcommand under openspec's own alias.
    const aliased = await cospec(['workset', 'ls', '--json'], { cwd, env })
    expect(aliased.exitCode).toBe(0)
    expect(JSON.parse(aliased.stdout)).toEqual(listedBody)
  }, 30_000)

  test('remove without --yes is refused (JSON mode) and relays the fix', async () => {
    const { cwd, env } = sandbox()
    await cospec(['workset', 'create', 'guarded', '--member', '.', '--json'], { cwd, env })

    const refused = await cospec(['workset', 'remove', 'guarded', '--json'], { cwd, env })
    expect(refused.exitCode).toBe(1)
    const body = JSON.parse(refused.stdout) as { removed: unknown; status: Array<{ code: string }> }
    expect(body.removed).toBeNull()
    expect(body.status.map((s) => s.code)).toContain('workset_remove_confirmation_required')

    // still present after the refused attempt
    const stillListed = await cospec(['workset', 'list', '--json'], { cwd, env })
    const stillBody = JSON.parse(stillListed.stdout) as { worksets: Array<{ name: string }> }
    expect(stillBody.worksets.map((w) => w.name)).toContain('guarded')
  }, 30_000)

  test('remove without --yes is refused (non-JSON mode)', async () => {
    const { cwd, env } = sandbox()
    await cospec(['workset', 'create', 'guarded2', '--member', '.', '--json'], { cwd, env })

    const refused = await cospec(['workset', 'remove', 'guarded2'], { cwd, env })
    expect(refused.exitCode).toBe(1)
    expect(refused.stderr + refused.stdout).toMatch(/--yes/)
  }, 30_000)

  test('remove --yes deletes it', async () => {
    const { cwd, env } = sandbox()
    await cospec(['workset', 'create', 'removable', '--member', '.', '--json'], { cwd, env })

    const removed = await cospec(['workset', 'remove', 'removable', '--yes', '--json'], {
      cwd,
      env,
    })
    expect(removed.exitCode).toBe(0)
    const body = JSON.parse(removed.stdout) as { removed: { name: string } | null }
    expect(body.removed?.name).toBe('removable')

    const listed = await cospec(['workset', 'list', '--json'], { cwd, env })
    const listedBody = JSON.parse(listed.stdout) as { worksets: Array<{ name: string }> }
    expect(listedBody.worksets.map((w) => w.name)).not.toContain('removable')
  }, 30_000)

  test('--store is never threaded onto the wrapped workset call', async () => {
    const { cwd, env } = sandbox()
    // openspec workset rejects --store as an unknown option; cospec must not
    // append it even when the global --store flag is passed.
    const res = await cospec(['workset', 'list', '--store', 'no-such-store', '--json'], {
      cwd,
      env,
    })
    expect(res.exitCode).toBe(0)
    expect(JSON.parse(res.stdout)).toHaveProperty('worksets')
  }, 30_000)

  describe('workset open (terminal handover)', () => {
    test('propagates the child exit code for an unsaved workset (arg forwarding smoke test)', async () => {
      const { cwd, env } = sandbox()
      const res = await cospec(['workset', 'open', 'not-saved-anywhere'], { cwd, env })
      expect(res.exitCode).toBe(1)
      expect(res.stderr + res.stdout).toMatch(/not saved on this machine/)
    }, 30_000)

    test.failing(
      "--json is the binary's workset_open_json_unsupported refusal, nothing opened",
      async () => {
        const { cwd, env } = sandbox()
        const upstream = await openspecRaw(
          ['workset', 'open', 'not-saved-anywhere', '--json'],
          cwd,
          env,
        )
        const res = await cospec(['workset', 'open', 'not-saved-anywhere', '--json'], { cwd, env })
        expect(res.exitCode).toBe(1)
        const body = JSON.parse(res.stdout) as { status: Array<{ code: string }> }
        expect(body).toEqual(JSON.parse(respellRemedies(upstream.stdout)) as typeof body)
        expect(body.status[0]!.code).toBe('workset_open_json_unsupported')
        expect(res.stderr + res.stdout).not.toMatch(/not saved on this machine/)
      },
      30_000,
    )
  })

  for (const argv of [['workset', 'bogus'], ['workset']]) {
    test.failing(
      `${argv.join(' ')}: the binary's refusal, spelled through cospec`,
      async () => {
        const { cwd, env } = sandbox()
        const upstream = await openspecRaw(argv, cwd, env)
        const res = await cospec(argv, { cwd, env })
        expect(upstream.exitCode).toBe(1)
        expect(res.exitCode).toBe(1)
        expect(res.stdout).toBe('')
        expect(res.stderr).toBe(respellRemedies(upstream.stderr))
        expect(res.stderr).toContain("'cospec workset'")
      },
      30_000,
    )
  }
})
